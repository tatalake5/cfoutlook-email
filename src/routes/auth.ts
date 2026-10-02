import { Hono } from 'hono';
import type { Env } from '../types';
import { ok, badRequest, fail } from '../response';
import { verifyPassword, issueSessionCookie, buildSetCookie, buildClearCookie, verifySession } from '../auth';

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  const password = body.password?.trim();

  if (!password) {
    return badRequest('请输入密码');
  }

  // Misconfig guard: COOKIE_SECRET is always required to sign the session
  if (!c.env.COOKIE_SECRET) {
    return fail(
      'CONFIG_MISSING',
      '服务端未配置 COOKIE_SECRET：请运行 wrangler secret put COOKIE_SECRET',
      500
    );
  }

  const valid = await verifyPassword(c.env.DB, password, c.env.ADMIN_PASSWORD);
  if (!valid) {
    return badRequest('密码错误');
  }

  const sessionValue = await issueSessionCookie(c.env.COOKIE_SECRET);
  const isSecure = new URL(c.req.url).protocol === 'https:';
  const cookie = buildSetCookie(sessionValue, isSecure);

  return new Response(JSON.stringify({ success: true, data: {} }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
});

// POST /api/auth/logout
auth.post('/logout', async (c) => {
  return new Response(JSON.stringify({ success: true, data: {} }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearCookie(),
    },
  });
});

// GET /api/auth/me
auth.get('/me', async (c) => {
  const cookie = c.req.header('Cookie');
  if (!cookie) return ok({ loggedIn: false });

  const cookies = cookie.split(';');
  let sessionVal = '';
  for (const ck of cookies) {
    const [name, ...rest] = ck.trim().split('=');
    if (name === 'session') {
      sessionVal = rest.join('=');
      break;
    }
  }

  if (!sessionVal) return ok({ loggedIn: false });

  const valid = await verifySession(sessionVal, c.env.COOKIE_SECRET);
  return ok({ loggedIn: valid });
});

export default auth;
