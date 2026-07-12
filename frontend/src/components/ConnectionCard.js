'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

const STATUS_MAP = {
  READY: { cls: 'status-ready', label: 'Connected', pulse: true },
  QR: { cls: 'status-qr', label: 'Scan QR code', pulse: true },
  AUTHENTICATED: { cls: 'status-wait', label: 'Syncing…', pulse: true },
  INITIALIZING: { cls: 'status-wait', label: 'Starting…', pulse: true },
  DISCONNECTED: { cls: 'status-off', label: 'Disconnected', pulse: false },
};

export default function ConnectionCard({ status, qr, me, notify }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_MAP[status] || STATUS_MAP.INITIALIZING;

  async function handleLogout() {
    if (!confirm('Log out of WhatsApp and clear the session? You will need to scan the QR again.')) return;
    setBusy(true);
    try {
      await api.logout();
      notify?.('Logged out. A new QR code will appear shortly.', 'info');
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">🔗</span> Connection
        </div>
        <span className={`status-pill ${meta.cls}`}>
          <span className={`dot ${meta.pulse ? 'pulse' : ''}`} />
          {meta.label}
        </span>
      </div>

      {status === 'READY' ? (
        <div className="ready-badge">
          <div className="ready-ring">✓</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{me?.pushname || 'WhatsApp account'}</div>
            {me?.number && <div className="muted cell-mono">+{me.number}</div>}
          </div>
          <button className="btn btn-danger btn-sm" onClick={handleLogout} disabled={busy}>
            {busy ? <span className="spinner" /> : '⏻'} Log out
          </button>
        </div>
      ) : status === 'QR' && qr ? (
        <div className="qr-wrap">
          <div className="qr-frame">
            <img src={qr} alt="WhatsApp QR code" />
            <div className="qr-scan-line" />
          </div>
          <p className="small muted center" style={{ maxWidth: 260 }}>
            Open WhatsApp → <b>Linked devices</b> → <b>Link a device</b>, then scan this code.
          </p>
        </div>
      ) : (
        <div className="qr-wrap">
          <div className="qr-empty">
            <span className="spinner" style={{ width: 22, height: 22 }} />
            <span>
              {status === 'DISCONNECTED'
                ? 'Reconnecting to WhatsApp…'
                : 'Waiting for WhatsApp to produce a QR code…'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
