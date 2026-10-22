/**
 * @file src/lib/googleWorkspaceService.ts
 * Real Integration Service for Google Gmail API and Google Sheets API
 * Uses client-obtained OAuth Access Token with server relay fallback and safe range encoding.
 */

import { getAccessToken } from './googleWorkspaceAuth';

/**
 * Formats a sheet tab title and A1 cell range safely for Google Sheets API v4.
 * Escapes internal single quotes and wraps in single quotes only when required.
 */
export function formatSheetRange(tabTitle: string, cellRange: string = 'A1:Z60'): string {
  const cleanTab = (tabTitle || 'Sheet1').trim().replace(/^'+|'+$/g, '');
  const escapedTab = cleanTab.replace(/'/g, "''");
  const isSimpleAlphaNumeric = /^[A-Za-z0-9_]+$/.test(cleanTab);
  const formattedTab = isSimpleAlphaNumeric ? cleanTab : `'${escapedTab}'`;
  return cellRange ? `${formattedTab}!${cellRange}` : formattedTab;
}

/**
 * Executes a Google Workspace API request using the user's OAuth Access Token.
 * Routes via the same-origin `/api/v1/workspace/relay` endpoint (passing Bearer token)
 * to prevent browser CORS / GFE URL-path rejections, with automatic direct-fetch fallback.
 */
async function workspaceApiFetch(
  targetUrl: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: any } = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');
  }

  const method = options.method || 'GET';

  // 1. Primary path: same-origin server relay with X-Google-Access-Token (immune to browser CORS / GFE path drops)
  try {
    const relayRes = await fetch('/api/v1/workspace/relay', {
      method: 'POST',
      headers: {
        'X-Google-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetUrl,
        method,
        body: options.body,
        googleAccessToken: token,
      }),
    });

    if (relayRes.ok) {
      const payload = await relayRes.json().catch(() => null);
      if (payload && typeof payload.ok === 'boolean') {
        return {
          ok: payload.ok,
          status: payload.status || 200,
          data: payload.data || {},
        };
      }
    }
  } catch {
    // Fall through to direct browser fetch if local relay is unreachable
  }

  // 2. Fallback path: direct browser fetch to Google APIs
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (options.body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    const directRes = await fetch(targetUrl, {
      method,
      headers,
      body: options.body !== undefined && method !== 'GET' ? JSON.stringify(options.body) : undefined,
    });

    const data = await directRes.json().catch(() => ({}));
    return {
      ok: directRes.ok,
      status: directRes.status,
      data,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 503,
      data: {
        error: {
          message:
            err?.message && !String(err.message).includes('Failed to fetch')
              ? err.message
              : 'تعذر الاتصال بخدمة Google السحابية، يرجى التحقق من اتصال الإنترنت أو إعادة تسجيل الدخول بحساب Google.',
        },
      },
    };
  }
}

// ==========================================
// GMAIL TYPES & SERVICES
// ==========================================

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  labels: string[];
  isUnread: boolean;
  body?: string;
  internalDate?: string;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/**
 * Encodes a string to RFC 2822 Base64URL
 */
function base64UrlEncode(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes base64url string to unicode text
 */
function base64UrlDecode(str: string): string {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return str;
  }
}

/**
 * Extract message body from Gmail payload
 */
function extractBodyFromPayload(payload: any): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64UrlDecode(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return base64UrlDecode(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBodyFromPayload(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * Fetch Gmail user profile
 */
export async function getGmailProfile(): Promise<GmailProfile> {
  const res = await workspaceApiFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل في جلب بيانات Gmail (${res.status})`);
  }
  return res.data;
}

/**
 * List messages with full details (Subject, From, Date, Snippet, Labels, Body)
 */
export async function listGmailMessages(
  query: string = 'label:INBOX',
  maxResults: number = 15
): Promise<GmailMessageSummary[]> {
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  if (query) listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(maxResults));

  const listRes = await workspaceApiFetch(listUrl.toString());
  if (!listRes.ok) {
    throw new Error(listRes.data?.error?.message || `خطأ في استرجاع رسائل Gmail (${listRes.status})`);
  }

  const listData = listRes.data;
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  const detailPromises = listData.messages
    .slice(0, maxResults)
    .map(async (msg: { id: string; threadId: string }) => {
      try {
        const detailRes = await workspaceApiFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`
        );
        if (!detailRes.ok) return null;
        const data = detailRes.data;

        const headers = data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const labels = data.labelIds || [];
        const isUnread = labels.includes('UNREAD');
        const body = extractBodyFromPayload(data.payload);

        return {
          id: data.id,
          threadId: data.threadId,
          snippet: data.snippet || '',
          subject: getHeader('Subject') || '(بدون عنوان)',
          from: getHeader('From') || 'مجهول',
          to: getHeader('To') || '',
          date: getHeader('Date') || new Date().toLocaleString(),
          labels,
          isUnread,
          body: body || data.snippet || '',
          internalDate: data.internalDate,
        } as GmailMessageSummary;
      } catch {
        return null;
      }
    });

  const results = await Promise.all(detailPromises);
  return results.filter((r): r is GmailMessageSummary => r !== null);
}

/**
 * Send an email via Gmail API
 */
export async function sendGmailMessage(params: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ id: string; threadId: string }> {
  const lines = [
    `To: ${params.to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    params.body,
  ];

  if (params.threadId) {
    lines.splice(2, 0, `References: <${params.threadId}@mail.gmail.com>`);
  }

  const rawMessage = base64UrlEncode(lines.join('\r\n'));

  const payload: any = { raw: rawMessage };
  if (params.threadId) {
    payload.threadId = params.threadId;
  }

  const res = await workspaceApiFetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      body: payload,
    }
  );

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل إرسال البريد (${res.status})`);
  }

  return res.data;
}

/**
 * Move message to trash in Gmail
 */
export async function trashGmailMessage(messageId: string): Promise<boolean> {
  const res = await workspaceApiFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    { method: 'POST' }
  );

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل حذف الرسالة (${res.status})`);
  }

  return true;
}

// ==========================================
// GOOGLE SHEETS & DRIVE TYPES & SERVICES
// ==========================================

export interface SpreadsheetFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink?: string;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    rowCount?: number;
    columnCount?: number;
  }>;
}

export interface SheetRangeValues {
  range: string;
  values: string[][];
}

/**
 * List spreadsheets owned or accessible by user via Google Drive API
 */
export async function listUserSpreadsheets(): Promise<SpreadsheetFileInfo[]> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set(
    'q',
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  url.searchParams.set('fields', 'files(id, name, modifiedTime, webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '20');

  const res = await workspaceApiFetch(url.toString());

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل استرجاع جداول البيانات (${res.status})`);
  }

  return res.data?.files || [];
}

/**
 * Create a new Google Spreadsheet with predefined sheets
 */
export async function createSpreadsheet(
  title: string = 'OmniFlow Contact Center Reports'
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const res = await workspaceApiFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: {
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: 'Tickets & SLA',
            gridProperties: { rowCount: 200, columnCount: 12 },
          },
        },
        {
          properties: {
            title: 'Live Metrics KPI',
            gridProperties: { rowCount: 100, columnCount: 8 },
          },
        },
      ],
    },
  });

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل إنشاء جدول البيانات (${res.status})`);
  }

  const data = res.data;
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    title: data.properties?.title || title,
  };
}

/**
 * Fetch spreadsheet metadata to dynamically get tab names
 */
export async function getSpreadsheetDetails(spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const cleanId = encodeURIComponent(spreadsheetId.trim());
  const res = await workspaceApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}`
  );

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل جلب تفاصيل الجدول (${res.status})`);
  }

  const data = res.data;
  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'جدول بيانات Google',
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title || 'Sheet1',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount,
    })),
  };
}

/**
 * Read values from a spreadsheet range using query-parameter `values:batchGet`
 * so special characters, spaces, colons, or Arabic sheet names never break URL path routing.
 */
export async function readSpreadsheetRange(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const cleanId = encodeURIComponent(spreadsheetId.trim());

  // Use values:batchGet with query parameter `ranges` to avoid URL path encoding / GFE issues
  const batchUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchGet`
  );
  batchUrl.searchParams.set('ranges', range);
  batchUrl.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');

  const res = await workspaceApiFetch(batchUrl.toString());

  if (res.ok) {
    const firstRange = res.data?.valueRanges?.[0];
    return firstRange?.values || [];
  }

  // Fallback: if the specific tab range syntax had a mismatch, try reading the default first tab range A1:Z60
  const fallbackUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchGet`
  );
  fallbackUrl.searchParams.set('ranges', 'A1:Z60');
  fallbackUrl.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');

  const fallbackRes = await workspaceApiFetch(fallbackUrl.toString());
  if (fallbackRes.ok) {
    const firstRange = fallbackRes.data?.valueRanges?.[0];
    return firstRange?.values || [];
  }

  throw new Error(
    res.data?.error?.message || `فشل قراءة خلايا الجدول (${res.status})`
  );
}

/**
 * Append rows to a spreadsheet
 */
export async function appendSpreadsheetRows(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<{ updatedRows: number; updatedRange: string }> {
  const cleanId = encodeURIComponent(spreadsheetId.trim());
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await workspaceApiFetch(url, {
    method: 'POST',
    body: {
      values,
    },
  });

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `فشل إضافة صفوف إلى الجدول (${res.status})`);
  }

  const data = res.data;
  return {
    updatedRows: data.updates?.updatedRows || values.length,
    updatedRange: data.updates?.updatedRange || range,
  };
}
