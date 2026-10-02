import { Hono } from 'hono';
import type { Env, TempEmailRow, SettingRow } from '../types';
import { query, first, run } from '../db';
import { ok, badRequest, notFound, serverError } from '../response';

const GPTMAIL_BASE_URL = 'https://mail.chatgpt.org.uk';

const tempEmails = new Hono<{ Bindings: Env }>();

// Helper: get GPTMail API key from settings or env
async function getApiKey(db: D1Database, envKey?: string): Promise<string> {
  const row = await first<SettingRow>(db, "SELECT value FROM settings WHERE key = 'gptmail_api_key'");
  if (row?.value) return row.value;
  return envKey ?? '';
}

// Helper: make GPTMail API request
async function gptmailRequest(
  method: string,
  endpoint: string,
  apiKey: string,
  options?: { params?: Record<string, string>; body?: unknown }
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  if (!apiKey) return { ok: false, error: 'GPTMail API Key 未配置' };

  let url = `${GPTMAIL_BASE_URL}${endpoint}`;
  if (options?.params) {
    url += '?' + new URLSearchParams(options.params).toString();
  }

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      return { ok: false, error: `GPTMail API error: ${res.status}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `GPTMail request failed: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

// GET /api/temp-emails
tempEmails.get('/', async (c) => {
  const rows = await query<TempEmailRow>(c.env.DB, 'SELECT * FROM temp_emails ORDER BY created_at DESC');
  return ok(rows);
});

// POST /api/temp-emails (generate new temp email)
tempEmails.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { prefix?: string; domain?: string };
  const apiKey = await getApiKey(c.env.DB, c.env.GPTMAIL_API_KEY);

  let result;
  if (body.prefix || body.domain) {
    result = await gptmailRequest('POST', '/api/generate-email', apiKey, { body });
  } else {
    result = await gptmailRequest('GET', '/api/generate-email', apiKey);
  }

  if (!result.ok) return badRequest(result.error ?? '生成临时邮箱失败');

  const data = result.data as { success?: boolean; data?: { email?: string } };
  const emailAddr = data?.data?.email;
  if (!emailAddr) return badRequest('生成临时邮箱失败，API 返回异常');

  try {
    await run(c.env.DB, 'INSERT INTO temp_emails (email, source) VALUES (?, ?)', [emailAddr, 'gptmail']);
  } catch {
    return badRequest('邮箱已存在');
  }

  return ok({ email: emailAddr }, '临时邮箱创建成功');
});

// DELETE /api/temp-emails/:id
tempEmails.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = await first<TempEmailRow>(c.env.DB, 'SELECT * FROM temp_emails WHERE id = ?', [id]);
  if (!existing) return notFound('临时邮箱不存在');

  await run(c.env.DB, 'DELETE FROM temp_emails WHERE id = ?', [id]);
  return ok(null, '临时邮箱已删除');
});

// GET /api/temp-emails/:id/messages
tempEmails.get('/:id/messages', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = await first<TempEmailRow>(c.env.DB, 'SELECT * FROM temp_emails WHERE id = ?', [id]);
  if (!existing) return notFound('临时邮箱不存在');

  const apiKey = await getApiKey(c.env.DB, c.env.GPTMAIL_API_KEY);
  const result = await gptmailRequest('GET', '/api/emails', apiKey, {
    params: { email: existing.email },
  });

  if (!result.ok) {
    return ok({ emails: [], error: result.error });
  }

  const data = result.data as { data?: { emails?: Array<Record<string, unknown>> } };
  const emails = data?.data?.emails ?? [];

  const formatted = emails.map((msg) => ({
    id: msg.id,
    from: msg.from_address ?? '未知',
    subject: msg.subject ?? '无主题',
    body_preview: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '',
    timestamp: msg.timestamp ?? 0,
    has_html: !!msg.has_html,
  }));

  return ok({ emails: formatted, count: formatted.length });
});

// GET /api/temp-emails/:id/messages/:messageId
tempEmails.get('/:id/messages/:messageId', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const messageId = c.req.param('messageId');

  const existing = await first<TempEmailRow>(c.env.DB, 'SELECT * FROM temp_emails WHERE id = ?', [id]);
  if (!existing) return notFound('临时邮箱不存在');

  const apiKey = await getApiKey(c.env.DB, c.env.GPTMAIL_API_KEY);
  const result = await gptmailRequest('GET', `/api/email/${messageId}`, apiKey);

  if (!result.ok) return notFound('邮件不存在');

  const data = result.data as { data?: Record<string, unknown> };
  const msg = data?.data;
  if (!msg) return notFound('邮件不存在');

  return ok({
    id: msg.id,
    from: msg.from_address ?? '未知',
    to: existing.email,
    subject: msg.subject ?? '无主题',
    body: msg.html_content ?? msg.content ?? '',
    body_type: msg.has_html ? 'html' : 'text',
    timestamp: msg.timestamp ?? 0,
  });
});

export default tempEmails;
