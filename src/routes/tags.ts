import { Hono } from 'hono';
import type { Env } from '../types';
import { query, first, run } from '../db';
import { ok, badRequest, notFound } from '../response';

const tags = new Hono<{ Bindings: Env }>();

interface TagRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

// GET /api/tags - list tags with account counts
tags.get('/', async (c) => {
  const rows = await query<TagRow & { account_count: number }>(
    c.env.DB,
    `SELECT t.*, COUNT(at.account_id) AS account_count
     FROM tags t LEFT JOIN account_tags at ON t.id = at.tag_id
     GROUP BY t.id ORDER BY t.name`,
    []
  );
  return ok(rows);
});

// POST /api/tags
tags.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; color?: string };
  const name = body.name?.trim();
  if (!name) return badRequest('标签名不能为空');
  try {
    await run(c.env.DB, 'INSERT INTO tags (name, color) VALUES (?, ?)', [name, body.color?.trim() || '#6366f1']);
    return ok(null, '标签已创建');
  } catch {
    return badRequest('创建失败，标签名可能已存在');
  }
});

// PUT /api/tags/:id
tags.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = await first<TagRow>(c.env.DB, 'SELECT * FROM tags WHERE id = ?', [id]);
  if (!existing) return notFound('标签不存在');
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; color?: string };
  const name = body.name?.trim() ?? existing.name;
  const color = body.color?.trim() ?? existing.color;
  if (!name) return badRequest('标签名不能为空');
  try {
    await run(c.env.DB, 'UPDATE tags SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    return ok(null, '标签已更新');
  } catch {
    return badRequest('更新失败，标签名可能已存在');
  }
});

// DELETE /api/tags/:id
tags.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = await first<TagRow>(c.env.DB, 'SELECT * FROM tags WHERE id = ?', [id]);
  if (!existing) return notFound('标签不存在');
  await run(c.env.DB, 'DELETE FROM account_tags WHERE tag_id = ?', [id]);
  await run(c.env.DB, 'DELETE FROM tags WHERE id = ?', [id]);
  return ok(null, '标签已删除');
});

export default tags;
