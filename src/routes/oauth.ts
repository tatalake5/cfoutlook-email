import { Hono } from 'hono';
import type { Env } from '../types';
import { verifySession } from '../auth';
import { ok, badRequest, unauthorized } from '../response';

// Default client_id: Mozilla Thunderbird (public). Mail.ReadWrite enables read + delete.
const DEFAULT_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

const oauth = new Hono<{ Bindings: Env }>();

// Helper: check session from cookie
async function checkSession(cookieHeader: string | undefined, secret: string): Promise<boolean> {
  if (!cookieHeader) return false;
  const cookies = cookieHeader.split(';');
  for (const c of cookies) {
    const [name, ...rest] = c.trim().split('=');
    if (name === 'session') {
      return verifySession(rest.join('='), secret);
    }
  }
  return false;
}

// GET /api/oauth/authorize - generate authorization URL
// Frontend calls this to get the URL, then opens it in a popup/new tab
oauth.get('/authorize', async (c) => {
  const loggedIn = await checkSession(c.req.header('Cookie'), c.env.COOKIE_SECRET);
  if (!loggedIn) return unauthorized();

  const clientId = c.req.query('client_id') || DEFAULT_CLIENT_ID;
  const loginHint = c.req.query('login_hint') || '';

  // Use the worker's own URL as redirect
  const baseUrl = new URL(c.req.url);
  const redirectUri = `${baseUrl.protocol}//${baseUrl.host}/api/oauth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'Mail.ReadWrite offline_access',
    response_mode: 'query',
  });
  if (loginHint) params.set('login_hint', loginHint);

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

  return ok({ url: authUrl, client_id: clientId });
});

// POST /api/oauth/exchange - manual flow: exchange a code obtained via the
// https://localhost redirect (registered for the Thunderbird public client),
// so users can authorize WITHOUT registering their own Azure app.
oauth.post('/exchange', async (c) => {
  const loggedIn = await checkSession(c.req.header('Cookie'), c.env.COOKIE_SECRET);
  if (!loggedIn) return unauthorized();

  const body = (await c.req.json().catch(() => ({}))) as {
    code?: string;
    client_id?: string;
    redirect_uri?: string;
  };
  const code = body.code?.trim();
  if (!code) return badRequest('请提供授权码 code');

  const clientId = body.client_id?.trim() || DEFAULT_CLIENT_ID;
  const redirectUri = body.redirect_uri?.trim() || 'https://localhost';

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: 'Mail.ReadWrite offline_access',
      }).toString(),
    });

    const data = (await tokenRes.json()) as Record<string, unknown>;
    if (!tokenRes.ok || !data.refresh_token) {
      const errMsg = (data.error_description as string) || (data.error as string) || 'Token exchange failed';
      return badRequest(`换取令牌失败: ${errMsg}`);
    }

    return ok({ client_id: clientId, refresh_token: data.refresh_token as string });
  } catch (e) {
    return badRequest(`网络错误: ${e instanceof Error ? e.message : 'unknown'}`);
  }
});

// GET /api/oauth/callback - Microsoft redirects here with ?code=
// This is opened in a browser tab, so we return HTML that posts the result back
oauth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const errorDesc = c.req.query('error_description');

  if (error) {
    return c.html(callbackPage(false, `授权失败: ${errorDesc || error}`));
  }

  if (!code) {
    return c.html(callbackPage(false, '未收到授权码'));
  }

  // Exchange code for tokens
  const baseUrl = new URL(c.req.url);
  const redirectUri = `${baseUrl.protocol}//${baseUrl.host}/api/oauth/callback`;

  // We need to know which client_id was used. Store it in state param or use default.
  const clientId = c.req.query('state') || DEFAULT_CLIENT_ID;

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        scope: 'Mail.ReadWrite offline_access',
      }).toString(),
    });

    const data = (await tokenRes.json()) as Record<string, unknown>;

    if (!tokenRes.ok || !data.refresh_token) {
      const errMsg = (data.error_description as string) || (data.error as string) || 'Token exchange failed';
      return c.html(callbackPage(false, `换取令牌失败: ${errMsg}`));
    }

    // Return success page with token data that the opener window can read
    return c.html(callbackPage(true, '', {
      client_id: clientId,
      refresh_token: data.refresh_token as string,
    }));
  } catch (e) {
    return c.html(callbackPage(false, `网络错误: ${e instanceof Error ? e.message : 'unknown'}`));
  }
});

// Generate the callback HTML page
function callbackPage(success: boolean, error: string, data?: { client_id: string; refresh_token: string }): string {
  const dataJson = data ? JSON.stringify(data) : 'null';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OAuth 授权</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 500px; text-align: center; }
  .success { color: #22c55e; }
  .error { color: #ef4444; }
  h2 { margin-bottom: 12px; }
  p { color: #94a3b8; font-size: 14px; }
</style></head>
<body><div class="card">
  ${success
    ? '<h2 class="success">授权成功！</h2><p>正在自动填入账号信息，请稍候...</p>'
    : `<h2 class="error">授权失败</h2><p>${error}</p><p>你可以关闭此窗口重试。</p>`
  }
</div>
<script>
  var result = { success: ${success}, data: ${dataJson}, error: ${JSON.stringify(error)} };
  if (window.opener) {
    // Callback page is same-origin with the opener (both served by this worker),
    // so target the opener's exact origin instead of '*' - '*' would leak the
    // long-lived refresh_token to any window that acquired an opener reference.
    window.opener.postMessage({ type: 'oauth-callback', ...result }, location.origin);
    setTimeout(function() { window.close(); }, 1500);
  }
</script>
</body></html>`;
}

export default oauth;
