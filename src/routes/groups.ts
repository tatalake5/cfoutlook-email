import { Hono } from 'hono';
import type { Env, GroupRow } from '../types';
import { query, first, run } from '../db';
import { ok, badRequest, notFound } from '../response';

const groups = new Hono<{ Bindings: Env }>();

// GET /api/groups
groups.get('/', async (c) => {
  const rows = await query<GroupRow & { account_count: number }>(
    c.env.DB,
    `SELECT g.*, (SELECT COUNT(*) FROM accounts a WHERE a.group_id = g.id) AS account_count
     FROM groups g ORDER BY g.id`
  );
  return ok(rows);
});

// POST /api/groups
groups.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; description?: string; color?: string };
  const name = body.name?.trim();
  if (!name) return badRequest('分组名称不能为空');

  const description = body.description ?? '';
  const color = body.color ?? '#2563eb';

  try {
    const result = await run(
      c.env.DB,
      'INSERT INTO groups (name, description, color) VALUES (?, ?, ?)',
      [name, description, color]
    );
    return ok({ id: result.meta.last_row_id }, '分组创建成功');
  } catch {
    return badRequest('分组名称已存在');
  }
});

// PUT /api/groups/:id
groups.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; description?: string; color?: string };
  const name = body.name?.trim();
  if (!name) return badRequest('分组名称不能为空');

  const existing = await first<GroupRow>(c.env.DB, 'SELECT * FROM groups WHERE id = ?', [id]);
  if (!existing) return notFound('分组不存在');

  try {
    await run(
      c.env.DB,
      'UPDATE groups SET name = ?, description = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, body.description ?? existing.description, body.color ?? existing.color, id]
    );
    return ok(null, '分组更新成功');
  } catch {
    return badRequest('分组名称已存在');
  }
});

// DELETE /api/groups/:id
groups.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (id === 1) return badRequest('默认分组不能删除');

  const existing = await first<GroupRow>(c.env.DB, 'SELECT * FROM groups WHERE id = ?', [id]);
  if (!existing) return notFound('分组不存在');

  // Move accounts to default group
  await run(c.env.DB, 'UPDATE accounts SET group_id = 1 WHERE group_id = ?', [id]);
  await run(c.env.DB, 'DELETE FROM groups WHERE id = ?', [id]);

  return ok(null, '分组已删除，邮箱已移至默认分组');
});

export default groups;
