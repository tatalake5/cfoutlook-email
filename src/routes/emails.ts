import { Hono } from 'hono';
import type { Env, AccountRow } from '../types';
import { first, run } from '../db';
import { ok, notFound, badRequest } from '../response';
import { getAccessToken, fetchEmails, fetchEmailDetail, deleteEmail, listAttachments, getAttachment } from '../graph';

const emails = new Hono<{ Bindings: Env }>();

// Helper: get token and auto-save rotated refresh_token
async function getTokenAndRefresh(
  db: D1Database,
  acc: AccountRow
): Promise<{ token?: string; error?: string }> {
  const result = await getAccessToken(acc.client_id, acc.refresh_token);

  if (!result.token) {
    await run(db, 'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['error', acc.id]);
    return { error: result.error?.message ?? 'Token acquisition failed' };
  }

  // Auto-save new refresh_token if Microsoft rotated it
  if (result.newRefreshToken && result.newRefreshToken !== acc.refresh_token) {
    await run(
      db,
      'UPDATE accounts SET refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [result.newRefreshToken, 'active', acc.id]
    );
  } else if (acc.status === 'error') {
    // Token works without rotation (e.g. right after a manual re-auth):
    // clear the stale error flag so the account shows healthy again
    await run(db, "UPDATE accounts SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [acc.id]);
  }

  return { token: result.token };
}

// GET /api/accounts/:id/emails
emails.get('/', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');

  if (acc.status === 'disabled') {
    return badRequest('该账号已停用');
  }

  const folder = c.req.query('folder') ?? 'inbox';
  const top = Math.min(parseInt(c.req.query('top') ?? '20', 10), 50);
  const skip = parseInt(c.req.query('skip') ?? '0', 10);
  const keyword = c.req.query('keyword');

  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) {
    return ok({ items: [], error: tokenResult.error }, 'Graph API 认证失败');
  }

  const result = await fetchEmails(tokenResult.token, { folder, top, skip, keyword });
  if (result.error) {
    return ok({ items: [], error: result.error.message }, '获取邮件失败');
  }

  const items = (result.items ?? []).map((e) => ({
    id: e.id,
    subject: e.subject ?? '(无主题)',
    from: {
      name: e.from?.emailAddress?.name ?? '',
      address: e.from?.emailAddress?.address ?? '未知',
    },
    receivedDateTime: e.receivedDateTime,
    bodyPreview: e.bodyPreview ?? '',
    isRead: e.isRead,
    hasAttachments: e.hasAttachments,
  }));

  return ok({ items, total: items.length });
});

// GET /api/accounts/:id/emails/:messageId
emails.get('/:messageId', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const messageId = c.req.param('messageId')!;

  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');

  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) {
    return badRequest('Graph API 认证失败');
  }

  const result = await fetchEmailDetail(tokenResult.token, messageId);
  if (result.error) {
    if (result.error.code === 'NOT_FOUND') return notFound('邮件不存在');
    return badRequest(result.error.message);
  }

  const e = result.item!;
  return ok({
    id: e.id,
    subject: e.subject ?? '(无主题)',
    from: {
      name: e.from?.emailAddress?.name ?? '',
      address: e.from?.emailAddress?.address ?? '未知',
    },
    toRecipients: (e.toRecipients ?? []).map((r) => ({
      name: r.emailAddress?.name ?? '',
      address: r.emailAddress?.address ?? '',
    })),
    ccRecipients: (e.ccRecipients ?? []).map((r) => ({
      name: r.emailAddress?.name ?? '',
      address: r.emailAddress?.address ?? '',
    })),
    receivedDateTime: e.receivedDateTime,
    body: e.body,
    bodyPreview: e.bodyPreview ?? '',
    isRead: e.isRead,
    hasAttachments: e.hasAttachments,
  });
});

// GET /api/accounts/:id/emails/:messageId/attachments - list attachment metadata
emails.get('/:messageId/attachments', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const messageId = c.req.param('messageId')!;
  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');
  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) return badRequest('Graph API 认证失败');
  const result = await listAttachments(tokenResult.token, messageId);
  if (result.error) return badRequest(result.error.message);
  const items = (result.items ?? []).map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size }));
  return ok({ items });
});

// GET /api/accounts/:id/emails/:messageId/attachments/:attId - download one attachment
emails.get('/:messageId/attachments/:attId', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const messageId = c.req.param('messageId')!;
  const attId = c.req.param('attId')!;
  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');
  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) return badRequest('Graph API 认证失败');

  const result = await getAttachment(tokenResult.token, messageId, attId);
  if (result.error) {
    if (result.error.code === 'NOT_FOUND') return notFound('附件不存在');
    return badRequest(result.error.message);
  }
  const att = result.attachment!;
  if (!att.contentBytes) return badRequest('该附件不是文件附件，无法下载');

  // Decode base64 contentBytes to binary
  const binary = atob(att.contentBytes);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      'Content-Type': att.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`,
    },
  });
});

// POST /api/accounts/:id/emails/batch-delete  body: { ids: string[] }
emails.post('/batch-delete', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = (body.ids ?? []).filter((x) => typeof x === 'string');
  if (!ids.length) return badRequest('请选择要删除的邮件');

  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');

  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) return badRequest('Graph API 认证失败');

  // Cap per request: 1 token call + N deletes must stay under the 50-subrequest limit
  const MAX = 30;
  const targets = ids.slice(0, MAX);
  const results = await Promise.all(targets.map((id) => deleteEmail(tokenResult.token!, id)));
  const deleted = results.filter((r) => r.ok).length;
  const failed = targets.length - deleted;
  const skipped = ids.length - targets.length;
  const forbidden = results.some((r) => r.error?.code === 'FORBIDDEN');

  let msg = `已删除 ${deleted} 封`;
  if (failed) msg += `，失败 ${failed} 封`;
  if (skipped) msg += `，超出单次上限未处理 ${skipped} 封（请分批）`;
  if (forbidden) msg += '。该账号为只读授权，请「编辑账号 → 重新授权」获取读写权限';
  return ok({ deleted, failed, skipped }, msg);
});

// DELETE /api/accounts/:id/emails/:messageId
emails.delete('/:messageId', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const messageId = c.req.param('messageId')!;

  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');

  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) return badRequest('Graph API 认证失败');

  const result = await deleteEmail(tokenResult.token, messageId);
  if (!result.ok) {
    if (result.error?.code === 'NOT_FOUND') return notFound('邮件不存在');
    return badRequest(result.error?.message || '删除失败');
  }
  return ok(null, '已删除');
});

export default emails;
