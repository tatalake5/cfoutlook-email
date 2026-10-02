// Basic email format validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

// Mask sensitive strings: show first 4 and last 4 chars
export function maskToken(token: string, visibleChars = 4): string {
  if (token.length <= visibleChars * 2) return '****';
  return token.slice(0, visibleChars) + '****' + token.slice(-visibleChars);
}
