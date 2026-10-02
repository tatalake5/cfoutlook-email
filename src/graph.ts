import type { GraphTokenResponse, GraphMailMessage } from './types';
import { maskToken } from './utils/validation';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface GraphError {
  code: string;
  message: string;
}

// Get access token using refresh_token via Graph endpoint
// Returns new_refresh_token when Microsoft issues a rotated token
export async function getAccessToken(
  clientId: string,
  refreshToken: string
): Promise<{ token?: string; newRefreshToken?: string; error?: GraphError }> {
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://graph.microsoft.com/.default',
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, string>;
      return {
        error: {
          code: err.error || 'TOKEN_FAILED',
          message: err.error_description
            ? sanitizeErrorMessage(err.error_description)
            : `Token request failed with status ${res.status}`,
        },
      };
    }

    const data = (await res.json()) as GraphTokenResponse;
    return {
      token: data.access_token,
      newRefreshToken: data.refresh_token,
    };
  } catch (e) {
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: `Network error during token request: ${e instanceof Error ? e.message : 'unknown'}`,
      },
    };
  }
}

// Fetch email list from inbox
export async function fetchEmails(
  accessToken: string,
  options: { folder?: string; top?: number; skip?: number; keyword?: string; includeBody?: boolean } = {}
): Promise<{ items?: GraphMailMessage[]; error?: GraphError }> {
  const { folder = 'inbox', top = 20, skip = 0, keyword, includeBody = false } = options;

  // Aggregated view: merge inbox + junk, sorted by date desc. Single page (skip ignored)
  // to keep merged ordering correct; 2 subrequests stay within the free-tier budget.
  if (folder === 'all') {
    const [inbox, junk] = await Promise.all([
      fetchEmails(accessToken, { folder: 'inbox', top, skip: 0, keyword, includeBody }),
      fetchEmails(accessToken, { folder: 'junkemail', top, skip: 0, keyword, includeBody }),
    ]);
    // If both fail, surface the error; otherwise show whatever succeeded
    if (inbox.error && junk.error) return { error: inbox.error };
    const merged = [...(inbox.items ?? []), ...(junk.items ?? [])]
      .sort((a, b) => (b.receivedDateTime ?? '').localeCompare(a.receivedDateTime ?? ''))
      .slice(0, top);
    return { items: merged };
  }

  let url = `${GRAPH_BASE}/me/mailFolders/${folder}/messages`;
  // bodyPreview is hard-capped at 255 chars by Graph; select `body` for the full text.
  // Same single Graph request either way, so the subrequest budget is unaffected.
  const params = new URLSearchParams({
    $top: String(top),
    $skip: String(skip),
    $orderby: 'receivedDateTime desc',
    $select:
      'id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments' +
      (includeBody ? ',body' : ''),
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Prefer: 'outlook.body-content-type="text"',
  };

  if (keyword) {
    params.set('$search', `"${keyword}"`);
    headers['ConsistencyLevel'] = 'eventual';
  }

  url += '?' + params.toString();

  try {
    const res = await fetch(url, { headers });

    if (res.status === 429) {
      return { error: { code: 'RATE_LIMITED', message: 'Graph API rate limited, please retry later' } };
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        error: {
          code: 'GRAPH_ERROR',
          message: `Failed to fetch emails: ${res.status}`,
        },
      };
    }

    const data = (await res.json()) as { value: GraphMailMessage[] };
    return { items: data.value || [] };
  } catch (e) {
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: `Network error fetching emails: ${e instanceof Error ? e.message : 'unknown'}`,
      },
    };
  }
}

// Fetch single email detail
export async function fetchEmailDetail(
  accessToken: string,
  messageId: string
): Promise<{ item?: GraphMailMessage; error?: GraphError }> {
  const url =
    `${GRAPH_BASE}/me/messages/${messageId}?` +
    new URLSearchParams({
      $select:
        'id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,isRead,hasAttachments',
    }).toString();

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="html"',
      },
    });

    if (res.status === 404) {
      return { error: { code: 'NOT_FOUND', message: '邮件不存在' } };
    }

    if (!res.ok) {
      return {
        error: { code: 'GRAPH_ERROR', message: `Failed to fetch email detail: ${res.status}` },
      };
    }

    const data = (await res.json()) as GraphMailMessage;
    return { item: data };
  } catch (e) {
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: `Network error: ${e instanceof Error ? e.message : 'unknown'}`,
      },
    };
  }
}

// Delete a message (Graph soft-deletes it to Deleted Items)
export async function deleteEmail(
  accessToken: string,
  messageId: string
): Promise<{ ok: boolean; error?: GraphError }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 204 || res.ok) return { ok: true };
    if (res.status === 404) return { ok: false, error: { code: 'NOT_FOUND', message: '邮件不存在' } };
    if (res.status === 403) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: '无删除权限：该账号是只读授权。请在「编辑账号 → 重新授权」重新授权以获取读写权限',
        },
      };
    }
    return { ok: false, error: { code: 'GRAPH_ERROR', message: `删除失败: ${res.status}` } };
  } catch (e) {
    return {
      ok: false,
      error: { code: 'NETWORK_ERROR', message: `Network error: ${e instanceof Error ? e.message : 'unknown'}` },
    };
  }
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string; // base64, present when fetching a single fileAttachment
}

// List attachments metadata for a message
export async function listAttachments(
  accessToken: string,
  messageId: string
): Promise<{ items?: GraphAttachment[]; error?: GraphError }> {
  const url = `${GRAPH_BASE}/me/messages/${messageId}/attachments?$select=id,name,contentType,size`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { error: { code: 'GRAPH_ERROR', message: `获取附件列表失败: ${res.status}` } };
    const data = (await res.json()) as { value: GraphAttachment[] };
    return { items: data.value ?? [] };
  } catch (e) {
    return { error: { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : 'unknown' } };
  }
}

// Fetch a single attachment (includes base64 contentBytes for fileAttachment)
export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ attachment?: GraphAttachment; error?: GraphError }> {
  const url = `${GRAPH_BASE}/me/messages/${messageId}/attachments/${attachmentId}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404) return { error: { code: 'NOT_FOUND', message: '附件不存在' } };
    if (!res.ok) return { error: { code: 'GRAPH_ERROR', message: `获取附件失败: ${res.status}` } };
    const data = (await res.json()) as GraphAttachment;
    return { attachment: data };
  } catch (e) {
    return { error: { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : 'unknown' } };
  }
}

// Remove any token-like strings from error messages
function sanitizeErrorMessage(msg: string): string {
  // Redact anything that looks like a token (long base64/alphanumeric strings)
  return msg.replace(/[A-Za-z0-9_-]{40,}/g, (match) => maskToken(match));
}
