import { Context, Next } from 'hono';
import { hmacSign, hmacVerify, hashPassword } from './utils/crypto';
import { first } from './db';
import { unauthorized } from './response';
import type { Env, SettingRow } from './types';

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// Build cookie payload: expiry timestamp
function buildPayload(expiresAt: number): string {
  return `admin:${expiresAt}`;
}

// Issue a signed session cookie
export async function issueSessionCookie(secret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const payload = buildPayload(expiresAt);
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

// Verify session cookie value
export async function verifySession(cookieValue: string, secret: string): Promise<boolean> {
  const lastDot = cookieValue.lastIndexOf('.');
  if (lastDot === -1) return false;

  const payload = cookieValue.slice(0, lastDot);
  const sig = cookieValue.slice(lastDot + 1);

  const valid = await hmacVerify(payload, sig, secret);
  if (!valid) return false;

  // Check expiry
  const parts = payload.split(':');
  if (parts.length !== 2) return false;
  const expiresAt = parseInt(parts[1], 10);
  if (isNaN(expiresAt)) return false;

  return Math.floor(Date.now() / 1000) < expiresAt;
}

// Build Set-Cookie header value
export function buildSetCookie(value: string, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Build clear cookie header
export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Parse cookie header to get session value
function getSessionFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const c of cookies) {
    const [name, ...rest] = c.trim().split('=');
    if (name === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

// Verify login password against stored hash or ADMIN_PASSWORD secret
export async function verifyPassword(
  db: D1Database,
  password: string,
  adminPassword: string
): Promise<boolean> {
  // First check if there is a password hash in settings
  const row = await first<SettingRow>(db, 'SELECT value FROM settings WHERE key = ?', [
    'login_password_hash',
  ]);

  if (row) {
    const inputHash = await hashPassword(password);
    return inputHash === row.value;
  }

  // Fallback: compare with ADMIN_PASSWORD secret directly, then store hash
  if (password === adminPassword) {
    const hashed = await hashPassword(password);
    await db
      .prepare(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('login_password_hash', ?, CURRENT_TIMESTAMP)`
      )
      .bind(hashed)
      .run();
    return true;
  }

  return false;
}

// Auth middleware for Hono
export function authMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const cookie = c.req.header('Cookie') ?? null;
    const session = getSessionFromCookie(cookie);

    if (!session) {
      return unauthorized();
    }

    const valid = await verifySession(session, c.env.COOKIE_SECRET);
    if (!valid) {
      return unauthorized();
    }

    await next();
  };
}
