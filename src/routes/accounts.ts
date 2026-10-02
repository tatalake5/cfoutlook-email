import { Hono } from 'hono';
import type { Env, AccountRow } from '../types';
import { query, first, run, batchRun, chunk, D1_MAX_BOUND_PARAMS } from '../db';
import { ok, badRequest, notFound } from '../response';
import { maskToken, isValidEmail } from '../utils/validation';
import { getAccessToken } from '../graph';

const accounts = new Hono<{ Bindings: Env }>();

// Mask account for list responses
function safeAccount(acc: AccountRow) {
  return {
    id: acc.id,
    email: acc.email,
    client_id: maskToken(acc.client_id),
    refresh_token: maskToken(acc.refresh_token),
    group_id: acc.group_id,
    remark: acc.remark,
    status: acc.status,
    created_at: acc.created_at,
    updated_at: acc.updated_at,
  };
}

// GET /api/accounts
accounts.get('/', async (c) => {
  const groupId = c.req.query('group_id');
  const keyword = c.req.query('keyword');
  const tagId = c.req.query('tag_id');

  let sql = `SELECT a.*, g.name AS group_name, g.color AS group_color
             FROM accounts a LEFT JOIN groups g ON a.group_id = g.id`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (tagId) {
    sql += ' JOIN account_tags at ON at.account_id = a.id';
    conditions.push('at.tag_id = ?');
    params.push(parseInt(tagId, 10));
  }
  if (groupId) {
    conditions.push('a.group_id = ?');
    params.push(parseInt(groupId, 10));
  }
  if (keyword) {
    conditions.push('(a.email LIKE ? OR a.remark LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY a.created_at DESC';

  const rows = await query<AccountRow & { group_name: string; group_color: string }>(
    c.env.DB, sql, params
  );

  // Attach tags per account in one atomic batch (avoid N+1); the id list is
  // chunked because D1 allows at most 100 bound parameters per statement
  const tagMap = new Map<number, { id: number; name: string; color: string }[]>();
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const results = await batchRun<{ account_id: number; id: number; name: string; color: string }>(
      c.env.DB,
      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({
        sql: `SELECT at.account_id, t.id, t.name, t.color FROM account_tags at
              JOIN tags t ON t.id = at.tag_id WHERE at.account_id IN (${part.map(() => '?').join(',')}) ORDER BY t.name`,
        params: part,
      }))
    );
    for (const res of results) {
      for (const tr of res.results) {
        const list = tagMap.get(tr.account_id) ?? [];
        list.push({ id: tr.id, name: tr.name, color: tr.color });
        tagMap.set(tr.account_id, list);
      }
    }
  }

  const data = rows.map((r) => ({
    ...safeAccount(r),
    group_name: r.group_name ?? '默认分组',
    group_color: r.group_color ?? '#2563eb',
    tags: tagMap.get(r.id) ?? [],
  }));

  return ok(data);
});

// POST /api/accounts (supports batch import)
accounts.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    account_string?: string;
    email?: string;
    client_id?: string;
    refresh_token?: string;
    password?: string;
    group_id?: number;
    remark?: string;
  };

  const groupId = body.group_id ?? 1;

  // Batch import mode
  if (body.account_string) {
    const lines = body.account_string.trim().split('\n');
    let added = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('----');
      if (parts.length >= 4) {
        const [email, password, clientId, refreshToken] = parts;
        try {
          await run(
            c.env.DB,
            'INSERT INTO accounts (email, password, client_id, refresh_token, group_id) VALUES (?, ?, ?, ?, ?)',
            [email.trim(), password.trim(), clientId.trim(), refreshToken.trim(), groupId]
          );
          added++;
        } catch {
          // Duplicate email, skip
        }
      }
    }
    if (added > 0) return ok({ added }, `成功添加 ${added} 个账号`);
    return badRequest('没有新账号被添加（可能格式错误或已存在）');
  }

  // Single add mode
  const email = body.email?.trim();
  const clientId = body.client_id?.trim();
  const refreshToken = body.refresh_token?.trim();

  if (!email || !clientId || !refreshToken) {
    return badRequest('邮箱、Client ID 和 Refresh Token 不能为空');
  }
  if (!isValidEmail(email)) {
    return badRequest('邮箱格式不正确');
  }

  try {
    const result = await run(
      c.env.DB,
      'INSERT INTO accounts (email, password, client_id, refresh_token, group_id, remark) VALUES (?, ?, ?, ?, ?, ?)',
      [email, body.password ?? '', clientId, refreshToken, groupId, body.remark ?? '']
    );
    return ok({ id: result.meta.last_row_id }, '账号添加成功');
  } catch {
    return badRequest('邮箱已存在');
  }
});

// GET /api/accounts/export - export accounts as text (same format as import)
// MUST be before /:id to avoid being matched as id="export"
accounts.get('/export', async (c) => {
  const groupId = c.req.query('group_id');
  const idsParam = c.req.query('ids');
  type ExportRow = { email: string; password: string; client_id: string; refresh_token: string };

  let rows: ExportRow[];
  // `ids` (comma-separated) takes precedence — used for single-row and selected exports
  if (idsParam) {
    const ids = idsParam
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n));
    if (!ids.length) return ok({ content: '', count: 0 });
    // Chunked batch: D1 allows at most 100 bound parameters per statement.
    // created_at is fetched so newest-first order survives the merge across chunks.
    const results = await batchRun<ExportRow & { created_at: string }>(
      c.env.DB,
      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({
        sql: `SELECT email, password, client_id, refresh_token, created_at FROM accounts
              WHERE id IN (${part.map(() => '?').join(',')})`,
        params: part,
      }))
    );
    rows = results
      .flatMap((r) => r.results)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  } else {
    let sql = 'SELECT email, password, client_id, refresh_token FROM accounts';
    const params: unknown[] = [];
    if (groupId) {
      sql += ' WHERE group_id = ?';
      params.push(parseInt(groupId, 10));
    }
    sql += ' ORDER BY created_at DESC';
    rows = await query<ExportRow>(c.env.DB, sql, params);
  }

  const lines = rows.map(r => `${r.email}----${r.password || ''}----${r.client_id}----${r.refresh_token}`);
  return ok({ content: lines.join('\n'), count: rows.length });
});

// POST /api/accounts/batch - batch operations (delete / move group)
// MUST be before /:id
accounts.post('/batch', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    action?: string;
    ids?: number[];
    group_id?: number;
  };

  if (!body.ids?.length) return badRequest('请选择账号');

  // Each action runs as one atomic D1 batch; ids are chunked so every
  // statement stays within D1's 100-bound-params limit.
  const inList = (part: number[]) => part.map(() => '?').join(',');

  if (body.action === 'delete') {
    await batchRun(
      c.env.DB,
      chunk(body.ids, D1_MAX_BOUND_PARAMS).map((part) => ({
        sql: `DELETE FROM accounts WHERE id IN (${inList(part)})`,
        params: part,
      }))
    );
    return ok(null, `已删除 ${body.ids.length} 个账号`);
  }

  if (body.action === 'move' && body.group_id !== undefined) {
    // group_id occupies one bound slot per statement, hence limit - 1
    await batchRun(
      c.env.DB,
      chunk(body.ids, D1_MAX_BOUND_PARAMS - 1).map((part) => ({
        sql: `UPDATE accounts SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${inList(part)})`,
        params: [body.group_id, ...part],
      }))
    );
    return ok(null, `已移动 ${body.ids.length} 个账号`);
  }

  if (body.action === 'enable') {
    await batchRun(
      c.env.DB,
      chunk(body.ids, D1_MAX_BOUND_PARAMS).map((part) => ({
        sql: `UPDATE accounts SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id IN (${inList(part)})`,
        params: part,
      }))
    );
    return ok(null, `已启用 ${body.ids.length} 个账号`);
  }

  if (body.action === 'disable') {
    await batchRun(
      c.env.DB,
      chunk(body.ids, D1_MAX_BOUND_PARAMS).map((part) => ({
        sql: `UPDATE accounts SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id IN (${inList(part)})`,
        params: part,
      }))
    );
    return ok(null, `已停用 ${body.ids.length} 个账号`);
  }

  return badRequest('未知操作');
});

// GET /api/accounts/:id
accounts.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const acc = await first<AccountRow & { group_name: string; group_color: string }>(
    c.env.DB,
    `SELECT a.*, g.name AS group_name, g.color AS group_color
     FROM accounts a LEFT JOIN groups g ON a.group_id = g.id WHERE a.id = ?`,
    [id]
  );
  if (!acc) return notFound('账号不存在');

  const tagRows = await query<{ id: number; name: string; color: string }>(
    c.env.DB,
    `SELECT t.id, t.name, t.color FROM tags t
     JOIN account_tags at ON at.tag_id = t.id WHERE at.account_id = ?`,
    [id]
  );

  // For detail view, show full client_id but still mask refresh_token
  return ok({
    ...acc,
    refresh_token: maskToken(acc.refresh_token),
    group_name: acc.group_name ?? '默认分组',
    group_color: acc.group_color ?? '#2563eb',
    tags: tagRows,
    tag_ids: tagRows.map((t) => t.id),
  });
});

// PUT /api/accounts/:id
accounts.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [id]);
  if (!existing) return notFound('账号不存在');

  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    email: string;
    client_id: string;
    refresh_token: string;
    password: string;
    group_id: number;
    remark: string;
    status: string;
    tag_ids: number[];
  }>;

  // Sync tags if provided (replace the full set)
  if (Array.isArray(body.tag_ids)) {
    await run(c.env.DB, 'DELETE FROM account_tags WHERE account_id = ?', [id]);
    for (const tid of body.tag_ids) {
      if (Number.isInteger(tid)) {
        await run(c.env.DB, 'INSERT OR IGNORE INTO account_tags (account_id, tag_id) VALUES (?, ?)', [id, tid]);
      }
    }
    // If only tags changed, return early
    if (Object.keys(body).length === 1) return ok(null, '标签已更新');
  }

  // Status-only update
  if (body.status && Object.keys(body).length === 1) {
    await run(
      c.env.DB,
      'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [body.status, id]
    );
    return ok(null, '状态更新成功');
  }

  const email = body.email?.trim() ?? existing.email;
  const clientId = body.client_id?.trim() ?? existing.client_id;
  const refreshToken = body.refresh_token?.trim() ?? existing.refresh_token;

  if (!email || !clientId || !refreshToken) {
    return badRequest('邮箱、Client ID 和 Refresh Token 不能为空');
  }

  // A newly supplied refresh_token invalidates a stale 'error' verdict (the
  // error referred to the old token). Deliberate 'disabled' is never auto-changed.
  const status =
    body.status ??
    (body.refresh_token?.trim() && existing.status === 'error' ? 'active' : existing.status);

  try {
    await run(
      c.env.DB,
      `UPDATE accounts SET email = ?, password = ?, client_id = ?, refresh_token = ?,
       group_id = ?, remark = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        email,
        body.password ?? existing.password,
        clientId,
        refreshToken,
        body.group_id ?? existing.group_id,
        body.remark ?? existing.remark,
        status,
        id,
      ]
    );
    return ok(null, '账号更新成功');
  } catch {
    return badRequest('更新失败，邮箱可能已存在');
  }
});

// DELETE /api/accounts/:id
accounts.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [id]);
  if (!existing) return notFound('账号不存在');

  await run(c.env.DB, 'DELETE FROM account_tags WHERE account_id = ?', [id]);
  await run(c.env.DB, 'DELETE FROM accounts WHERE id = ?', [id]);
  return ok(null, '账号已删除');
});

// POST /api/accounts/:id/test - test Graph connection
accounts.post('/:id/test', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [id]);
  if (!acc) return notFound('账号不存在');

  const result = await getAccessToken(acc.client_id, acc.refresh_token);

  if (result.token) {
    // Auto-save rotated refresh_token + mark active
    const updates: unknown[] = ['active', id];
    let sql = 'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP';
    if (result.newRefreshToken && result.newRefreshToken !== acc.refresh_token) {
      sql = 'UPDATE accounts SET refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP';
      updates.splice(0, 0, result.newRefreshToken);
    }
    sql += ' WHERE id = ?';
    await run(c.env.DB, sql, updates);
    return ok({ connected: true }, 'Graph API 连接正常');
  }

  // Mark as error
  await run(
    c.env.DB,
    'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['error', id]
  );

  return ok({
    connected: false,
    error: result.error?.message ?? 'Unknown error',
  }, 'Graph API 连接失败');
});

export default accounts;
