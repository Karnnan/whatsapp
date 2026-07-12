import { getToken, clearAuth } from './auth';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Merge the auth token (if any) into request headers.
function authHeaders(extra) {
  const token = getToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handle(res) {
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  // Session expired / invalid → drop the token and bounce to the login screen.
  if (res.status === 401 && getToken()) {
    clearAuth();
    if (typeof window !== 'undefined') window.location.reload();
  }
  if (!res.ok) {
    const message = (body && body.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

const getJson = (path) => fetch(`${API_URL}${path}`, { headers: authHeaders() }).then(handle);
const sendJson = (path, method, payload) =>
  fetch(`${API_URL}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  }).then(handle);
const sendForm = (path, formData) =>
  fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: formData }).then(handle);
const del = (path) => fetch(`${API_URL}${path}`, { method: 'DELETE', headers: authHeaders() }).then(handle);

export const api = {
  // Auth
  login: async (username, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }
    if (!res.ok) throw new Error((body && body.error) || 'Login failed.');
    return body; // { ok, token, username }
  },
  authLogout: () =>
    fetch(`${API_URL}/api/auth/logout`, { method: 'POST', headers: authHeaders() })
      .then(() => true)
      .catch(() => true),

  // Status / connection
  getStatus: () => getJson('/api/status'),
  logout: () => sendJson('/api/logout', 'POST', {}),

  // Groups & extraction
  getGroups: () => getJson('/api/groups'),
  extract: (groupId) => sendJson('/api/extract', 'POST', { groupId }),
  cancelExtract: () => fetch(`${API_URL}/api/extract/cancel`, { method: 'POST', headers: authHeaders() }).then(handle),

  // Contacts
  getContacts: (groupId) => getJson(`/api/contacts${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`),
  deleteContact: (id) => del(`/api/contacts/${id}`),
  deleteContacts: (ids) => sendJson('/api/contacts/delete', 'POST', { ids }),
  clearContacts: (groupId) => del(`/api/contacts?${groupId ? `groupId=${encodeURIComponent(groupId)}` : 'all=true'}`),
  addContacts: (payload) => sendJson('/api/contacts/add', 'POST', payload),

  // Send
  send: (formData) => sendForm('/api/send', formData),
  broadcast: (formData) => sendForm('/api/broadcast', formData),

  // Messages — inbox & sent history
  getReceived: (unreadOnly) => getJson(`/api/messages/received${unreadOnly ? '?unreadOnly=true' : ''}`),
  markReceivedRead: (ids) => sendJson('/api/messages/received/read', 'POST', { ids }),
  getSent: () => getJson('/api/messages/sent'),
  deleteMessage: (whatsapp_message_id) => sendJson('/api/messages/delete', 'POST', { whatsapp_message_id }),
  deleteMessages: (ids) => sendJson('/api/messages/delete-bulk', 'POST', { ids }),

  // Keywords
  getKeywords: () => getJson('/api/keywords'),
  addKeyword: (keyword, reply) => sendJson('/api/keywords', 'POST', { keyword, reply }),
  updateKeyword: (id, keyword, reply) => sendJson(`/api/keywords/${id}`, 'PUT', { keyword, reply }),
  deleteKeyword: (id) => del(`/api/keywords/${id}`),

  // Settings
  getSettings: () => getJson('/api/settings'),
  setAutoReply: (enabled) => sendJson('/api/settings', 'PUT', { auto_reply_enabled: enabled }),
};
