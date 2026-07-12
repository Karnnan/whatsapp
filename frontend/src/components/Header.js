'use client';

import { useApp } from '@/context/AppContext';

const STATUS_LABEL = {
  READY: { cls: 'status-ready', label: 'Connected' },
  QR: { cls: 'status-qr', label: 'Scan QR' },
  AUTHENTICATED: { cls: 'status-wait', label: 'Syncing…' },
  INITIALIZING: { cls: 'status-wait', label: 'Starting…' },
  DISCONNECTED: { cls: 'status-off', label: 'Disconnected' },
};

export default function Header({ onBurger }) {
  const { status, online, me } = useApp();
  const s = STATUS_LABEL[status] || STATUS_LABEL.INITIALIZING;
  const connectedLabel = status === 'READY' && me?.number ? `Connected · +${me.number}` : s.label;

  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="burger" onClick={onBurger} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
        <div className="brand">
          <div className="brand-mark">🟢</div>
          <div className="brand-text">
            <h1>WhatsApp Control</h1>
            <p>Automation command center</p>
          </div>
        </div>
      </div>
      <div className="topnav-right">
        <span className={`status-pill ${s.cls}`} title="WhatsApp connection">
          <span className="dot pulse" />
          <span className="pill-text">{connectedLabel}</span>
        </span>
        <span className={`status-pill ${online ? 'status-ready' : 'status-off'}`} title="Backend socket">
          <span className={`dot ${online ? 'pulse' : ''}`} />
          <span className="pill-text">{online ? 'Backend connected' : 'Backend offline'}</span>
        </span>
      </div>
    </header>
  );
}
