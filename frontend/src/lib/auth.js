const TOKEN_KEY = 'wa_auth_token';
const USER_KEY = 'wa_auth_user';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUsername() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USER_KEY);
}

export function setAuth(token, username) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
  if (username) window.localStorage.setItem(USER_KEY, username);
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
