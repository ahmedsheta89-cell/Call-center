/**
 * @file src/lib/googleWorkspaceService.ts
 * Real Integration Service for Google Gmail API and Google Sheets API
 * Direct client-side calls using OAuth Access Token with proper error handling.
 */

import { getAccessToken } from './googleWorkspaceAuth';

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
  } catch (e) {
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
    // Look for text/plain or text/html
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
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `فشل في جلب بيانات Gmail (${res.status})`);
  }

  return res.json();
}

/**
 * List messages with full details (Subject, From, Date, Snippet, Labels, Body)
 */
export async function listGmailMessages(
  query: string = 'label:INBOX',
  maxResults: number = 15
): Promise<GmailMessageSummary[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  if (query) listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(maxResults));

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `خطأ في استرجاع رسائل Gmail (${listRes.status})`);
  }

  const listData = await listRes.json();
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  // Fetch individual details in parallel (capped at 15 for responsiveness)
  const detailPromises = listData.messages.slice(0, maxResults).map(async (msg: { id: string; threadId: string }) => {
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!detailRes.ok) return null;
      const data = await detailRes.json();

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
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  // Construct standard RFC 2822 email format
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

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل إرسال البريد (${res.status})`);
  }

  return res.json();
}

/**
 * Move message to trash in Gmail
 */
export async function trashGmailMessage(messageId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل حذف الرسالة (${res.status})`);
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
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set(
    'q',
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  url.searchParams.set('fields', 'files(id, name, modifiedTime, webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '20');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل استرجاع جداول البيانات (${res.status})`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Create a new Google Spreadsheet with predefined sheets
 */
export async function createSpreadsheet(
  title: string = 'OmniFlow Contact Center Reports'
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل إنشاء جدول البيانات (${res.status})`);
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    title: data.properties.title,
  };
}

/**
 * Fetch spreadsheet metadata to dynamically get tab names
 */
export async function getSpreadsheetDetails(spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل جلب تفاصيل الجدول (${res.status})`);
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties.title,
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount,
      columnCount: s.properties.gridProperties?.columnCount,
    })),
  };
}

/**
 * Read values from a spreadsheet range
 */
export async function readSpreadsheetRange(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل قراءة خلايا الجدول (${res.status})`);
  }

  const data = await res.json();
  return data.values || [];
}

/**
 * Append rows to a spreadsheet
 */
export async function appendSpreadsheetRows(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<{ updatedRows: number; updatedRange: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `فشل إضافة صفوف إلى الجدول (${res.status})`);
  }

  const data = await res.json();
  return {
    updatedRows: data.updates?.updatedRows || values.length,
    updatedRange: data.updates?.updatedRange || range,
  };
}
