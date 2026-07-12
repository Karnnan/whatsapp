export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function handle(res) {
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  // Status / connection
  getStatus: () => fetch(`${API_URL}/api/status`).then(handle),
  logout: () => fetch(`${API_URL}/api/logout`, { method: 'POST' }).then(handle),

  // Groups & extraction
  getGroups: () => fetch(`${API_URL}/api/groups`).then(handle),
  extract: (groupId) =>
    fetch(`${API_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    }).then(handle),

  // Contacts
  getContacts: (groupId) =>
    fetch(`${API_URL}/api/contacts${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`).then(handle),
  deleteContact: (id) => fetch(`${API_URL}/api/contacts/${id}`, { method: 'DELETE' }).then(handle),
  clearContacts: () => fetch(`${API_URL}/api/contacts`, { method: 'DELETE' }).then(handle),

  // Send (FormData built by the caller)
  send: (formData) => fetch(`${API_URL}/api/send`, { method: 'POST', body: formData }).then(handle),
  broadcast: (formData) => fetch(`${API_URL}/api/broadcast`, { method: 'POST', body: formData }).then(handle),

  // Keywords
  getKeywords: () => fetch(`${API_URL}/api/keywords`).then(handle),
  addKeyword: (keyword, reply) =>
    fetch(`${API_URL}/api/keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, reply }),
    }).then(handle),
  updateKeyword: (id, keyword, reply) =>
    fetch(`${API_URL}/api/keywords/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, reply }),
    }).then(handle),
  deleteKeyword: (id) => fetch(`${API_URL}/api/keywords/${id}`, { method: 'DELETE' }).then(handle),

  // Settings
  getSettings: () => fetch(`${API_URL}/api/settings`).then(handle),
  setAutoReply: (enabled) =>
    fetch(`${API_URL}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_reply_enabled: enabled }),
    }).then(handle),
};
