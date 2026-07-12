'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { setAuth } from '@/lib/auth';

export default function LoginPage({ onAuthed }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username.trim(), password);
      setAuth(res.token, res.username);
      onAuthed?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">🟢</div>
          <div>
            <h1>WhatsApp Control</h1>
            <p className="muted small" style={{ margin: '2px 0 0' }}>Sign in to your dashboard</p>
          </div>
        </div>

        <div className="field">
          <label className="label">Username</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        {error && <div className="login-error">⚠️ {error}</div>}

        <button className="btn btn-primary btn-block mt-2" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : '→'} {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
