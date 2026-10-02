// Minimal Telegram Bot API client (pure HTTPS fetch, no SDK).
// Used to push new-email notifications from the cron handler.

const TG_BASE = 'https://api.telegram.org';

export interface TelegramResult {
  ok: boolean;
  error?: string;
}

// Send a text message to a chat. Uses HTML parse mode so we can bold the subject.
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<TelegramResult> {
  if (!botToken || !chatId) return { ok: false, error: 'missing bot token or chat id' };
  try {
    const res = await fetch(`${TG_BASE}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (res.ok) return { ok: true };
    // Telegram returns { ok:false, description } on errors; surface a short reason
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    return { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

// Escape the few characters that break Telegram HTML parse mode.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
