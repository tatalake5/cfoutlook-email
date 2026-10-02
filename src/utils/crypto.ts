// HMAC-SHA256 signing and verification using Web Crypto API

const encoder = new TextEncoder();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Sign a payload string with HMAC-SHA256, return hex signature
export async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufToHex(sig);
}

// Verify HMAC-SHA256 signature
export async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(payload, secret);
  if (expected.length !== signature.length) return false;
  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// Hash a password with SHA-256 (hex output)
export async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return bufToHex(digest);
}
