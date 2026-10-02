import type { Env, AccountRow } from './types';
import { query, first, run } from './db';
import { getAccessToken, fetchEmails } from './graph';
import { sendTelegramMessage, escapeHtml } from './telegram';

// Hard cap per run: each account = 1 subrequest (token refresh); free plan allows 50/invocation
const MAX_BATCH = 40;

// Push budget is tighter: each account costs 1 token + 1 fetch + up to N sends.
// Keep the account batch small and cap messages so we stay well under 50 subrequests.
const PUSH_MAX_ACCOUNTS = 8;
const PUSH_MAX_MSGS_PER_ACCOUNT = 3;

async function getSetting(db: D1Database, key: string): Promise<string | undefined> {
  const row = await first<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value;
}

async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await run(
    db,
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [key, value]
  );
}

// Refresh a batch of the least-recently-updated accounts' tokens.
// Returns a short summary string (also persisted for the settings page to show).
export async function runTokenRefresh(env: Env, opts: { force?: boolean } = {}): Promise<string> {
  const db = env.DB;

  if (!opts.force) {
    const enabled = await getSetting(db, 'token_refresh_enabled');
    if (enabled !== '1') return 'skipped: disabled';

    // Interval gate — lets the user pick an effective interval larger than the base cron rate
    const intervalHours = parseInt((await getSetting(db, 'token_refresh_interval_hours')) || '24', 10) || 24;
    const lastRun = parseInt((await getSetting(db, 'token_refresh_last_run')) || '0', 10);
    const now = Date.now();
    if (lastRun && now - lastRun < intervalHours * 3600 * 1000) {
      return 'skipped: within interval';
    }
  }

  const batch = Math.min(
    parseInt((await getSetting(db, 'token_refresh_batch')) || '20', 10) || 20,
    MAX_BATCH
  );

  // Oldest-updated active accounts first, so refreshes rotate across runs
  const accounts = await query<AccountRow>(
    db,
    `SELECT * FROM accounts WHERE status != 'disabled' ORDER BY updated_at ASC LIMIT ?`,
    [batch]
  );

  let ok = 0;
  let fail = 0;
  for (const acc of accounts) {
    const res = await getAccessToken(acc.client_id, acc.refresh_token);
    if (res.token) {
      ok++;
      const newToken = res.newRefreshToken && res.newRefreshToken !== acc.refresh_token ? res.newRefreshToken : acc.refresh_token;
      await run(
        db,
        "UPDATE accounts SET refresh_token = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [newToken, acc.id]
      );
    } else {
      fail++;
      await run(db, "UPDATE accounts SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [acc.id]);
    }
  }

  const summary = `${new Date().toISOString()} 刷新 ${accounts.length} 个：成功 ${ok}，失败 ${fail}`;
  await setSetting(db, 'token_refresh_last_run', String(Date.now()));
  await setSetting(db, 'token_refresh_last_result', summary);
  return summary;
}

interface PushStateRow {
  account_id: number;
  last_pushed_at: string;
}

// Poll active accounts' inboxes and forward newly arrived emails to Telegram.
// Watermark per account (push_state.last_pushed_at) ensures each message is sent once.
// Gated by settings; subrequest-budget-capped via PUSH_MAX_* constants.
export async function runEmailPush(env: Env, opts: { force?: boolean } = {}): Promise<string> {
  const db = env.DB;

  const enabled = await getSetting(db, 'telegram_push_enabled');
  if (!opts.force && enabled !== '1') return 'skipped: disabled';

  const botToken = (await getSetting(db, 'telegram_bot_token')) || '';
  const chatId = (await getSetting(db, 'telegram_chat_id')) || '';
  if (!botToken || !chatId) return 'skipped: telegram not configured';

  if (!opts.force) {
    // Interval gate so the user can throttle below the base cron rate
    const intervalMin = parseInt((await getSetting(db, 'telegram_push_interval_minutes')) || '1', 10) || 1;
    const lastRun = parseInt((await getSetting(db, 'telegram_push_last_run')) || '0', 10);
    const now = Date.now();
    if (lastRun && now - lastRun < intervalMin * 60 * 1000) {
      return 'skipped: within interval';
    }
  }

  // Oldest-updated active accounts first so coverage rotates across runs
  const accounts = await query<AccountRow>(
    db,
    `SELECT * FROM accounts WHERE status != 'disabled' ORDER BY updated_at ASC LIMIT ?`,
    [PUSH_MAX_ACCOUNTS]
  );

  let sent = 0;
  let failedAccounts = 0;
  for (const acc of accounts) {
    const tok = await getAccessToken(acc.client_id, acc.refresh_token);
    if (!tok.token) {
      failedAccounts++;
      continue;
    }

    const stateRow = await first<PushStateRow>(
      db,
      'SELECT account_id, last_pushed_at FROM push_state WHERE account_id = ?',
      [acc.id]
    );
    const watermark = stateRow?.last_pushed_at || '';

    const list = await fetchEmails(tok.token, { folder: 'inbox', top: 10 });
    if (list.error || !list.items) {
      failedAccounts++;
      continue;
    }

    // First time we see an account: set the watermark to newest without flooding
    // the chat with the whole backlog. Newest is first (orderby desc).
    if (!watermark) {
      const newest = list.items[0]?.receivedDateTime || '';
      await run(
        db,
        `INSERT OR REPLACE INTO push_state (account_id, last_pushed_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [acc.id, newest]
      );
      continue;
    }

    // Strictly-newer messages, oldest-first so the chat reads chronologically
    const fresh = list.items
      .filter((m) => (m.receivedDateTime || '') > watermark)
      .sort((a, b) => (a.receivedDateTime || '').localeCompare(b.receivedDateTime || ''))
      .slice(-PUSH_MAX_MSGS_PER_ACCOUNT);

    let newWatermark = watermark;
    for (const m of fresh) {
      const fromAddr = m.from?.emailAddress?.address || '未知发件人';
      const text =
        `📬 <b>${escapeHtml(acc.email)}</b>\n` +
        `发件人: ${escapeHtml(fromAddr)}\n` +
        `主题: <b>${escapeHtml(m.subject || '(无主题)')}</b>\n` +
        `${escapeHtml((m.bodyPreview || '').slice(0, 300))}`;
      const r = await sendTelegramMessage(botToken, chatId, text);
      if (r.ok) {
        sent++;
        if ((m.receivedDateTime || '') > newWatermark) newWatermark = m.receivedDateTime;
      }
    }

    if (newWatermark !== watermark) {
      await run(
        db,
        `INSERT OR REPLACE INTO push_state (account_id, last_pushed_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [acc.id, newWatermark]
      );
    }
  }

  const summary = `${new Date().toISOString()} 推送：扫描 ${accounts.length} 个账号，发送 ${sent} 条，失败账号 ${failedAccounts}`;
  await setSetting(db, 'telegram_push_last_run', String(Date.now()));
  await setSetting(db, 'telegram_push_last_result', summary);
  return summary;
}
