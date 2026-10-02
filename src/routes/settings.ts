import { Hono } from 'hono';
import type { Env, SettingRow } from '../types';
import { query, run } from '../db';
import { ok, badRequest } from '../response';
import { hashPassword } from '../utils/crypto';
import { maskToken } from '../utils/validation';
import { runTokenRefresh, runEmailPush } from '../cron';
import { sendTelegramMessage } from '../telegram';

const settings = new Hono<{ Bindings: Env }>();

// GET /api/settings
settings.get('/', async (c) => {
  const rows = await query<SettingRow>(c.env.DB, 'SELECT * FROM settings');
  const data: Record<string, string> = {};

  for (const row of rows) {
    // Mask sensitive values
    if (row.key === 'login_password_hash') {
      data['login_password'] = '******';
    } else if (row.key === 'gptmail_api_key' || row.key === 'telegram_bot_token') {
      data[row.key] = row.value ? maskToken(row.value) : '';
    } else {
      // external_api_key is returned in full so the admin can copy it (page is behind login)
      data[row.key] = row.value;
    }
  }

  return ok(data);
});

// Generate a random hex key (no dependencies, Web Crypto)
function genApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/settings/external-key - (re)generate the external API key
settings.post('/external-key', async (c) => {
  const key = genApiKey();
  await run(
    c.env.DB,
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('external_api_key', ?, CURRENT_TIMESTAMP)`,
    [key]
  );
  return ok({ external_api_key: key }, '已生成新的 API Key');
});

// DELETE /api/settings/external-key - disable the external API
settings.delete('/external-key', async (c) => {
  await run(c.env.DB, "DELETE FROM settings WHERE key = 'external_api_key'", []);
  return ok(null, '已停用对外 API');
});

// POST /api/settings/refresh-now - manually refresh a batch of tokens immediately
settings.post('/refresh-now', async (c) => {
  const summary = await runTokenRefresh(c.env, { force: true });
  return ok({ summary }, summary);
});

// POST /api/settings/push-now - manually run the Telegram email push immediately
settings.post('/push-now', async (c) => {
  const summary = await runEmailPush(c.env, { force: true });
  return ok({ summary }, summary);
});

// POST /api/settings/telegram-test - send a test message with the saved bot/chat config
settings.post('/telegram-test', async (c) => {
  const rows = await query<SettingRow>(
    c.env.DB,
    "SELECT key, value FROM settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id')"
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;
  if (!cfg.telegram_bot_token || !cfg.telegram_chat_id) {
    return badRequest('请先填写并保存 Bot Token 和 Chat ID');
  }
  const r = await sendTelegramMessage(
    cfg.telegram_bot_token,
    cfg.telegram_chat_id,
    '✅ Outlook Email Manager 测试消息：Telegram 推送配置成功。'
  );
  if (!r.ok) return badRequest(`发送失败：${r.error}`);
  return ok(null, '测试消息已发送，请检查 Telegram');
});

// PUT /api/settings
settings.put('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  const updated: string[] = [];
  const errors: string[] = [];

  // Update login password
  if (body.login_password) {
    const pwd = body.login_password.trim();
    if (pwd.length < 4) {
      errors.push('密码长度至少为 4 位');
    } else {
      const hashed = await hashPassword(pwd);
      await run(
        c.env.DB,
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('login_password_hash', ?, CURRENT_TIMESTAMP)`,
        [hashed]
      );
      updated.push('登录密码');
    }
  }

  // Update GPTMail API Key
  if (body.gptmail_api_key !== undefined) {
    await run(
      c.env.DB,
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gptmail_api_key', ?, CURRENT_TIMESTAMP)`,
      [body.gptmail_api_key.trim()]
    );
    updated.push('GPTMail API Key');
  }

  // Update site title
  if (body.site_title !== undefined) {
    await run(
      c.env.DB,
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('site_title', ?, CURRENT_TIMESTAMP)`,
      [body.site_title.trim()]
    );
    updated.push('站点标题');
  }

  // Telegram bot token: skip if the value still looks masked (unchanged in UI)
  if (body.telegram_bot_token !== undefined && !body.telegram_bot_token.includes('*')) {
    await run(
      c.env.DB,
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('telegram_bot_token', ?, CURRENT_TIMESTAMP)`,
      [body.telegram_bot_token.trim()]
    );
    updated.push('Telegram Bot Token');
  }

  // Other Telegram push config (plain values)
  const telegramKeys: Record<string, string> = {
    telegram_push_enabled: 'enabled',
    telegram_chat_id: 'chat-id',
    telegram_push_interval_minutes: 'interval',
  };
  for (const [key, label] of Object.entries(telegramKeys)) {
    if (body[key] !== undefined) {
      await run(
        c.env.DB,
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, String(body[key]).trim()]
      );
      updated.push(`Telegram-${label}`);
    }
  }

  // Scheduled token refresh config
  const refreshKeys: Record<string, string> = {
    token_refresh_enabled: 'enabled',
    token_refresh_interval_hours: 'interval',
    token_refresh_batch: 'batch',
  };
  for (const [key, label] of Object.entries(refreshKeys)) {
    if (body[key] !== undefined) {
      await run(
        c.env.DB,
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, String(body[key]).trim()]
      );
      updated.push(`定时刷新-${label}`);
    }
  }

  if (errors.length > 0) return badRequest(errors.join('；'));
  if (updated.length === 0) return badRequest('没有需要更新的设置');

  return ok(null, `已更新：${updated.join(', ')}`);
});

export default settings;
