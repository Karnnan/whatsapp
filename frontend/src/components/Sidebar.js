'use client';

import { useApp } from '@/context/AppContext';

const NAV = [
  { key: 'connection', label: 'Connection', icon: '🔗' },
  { key: 'extraction', label: 'Extraction', icon: '👥' },
  { key: 'contacts', label: 'Contacts', icon: '📇' },
  { key: 'inbox', label: 'Inbox', icon: '📥' },
  { key: 'outbox', label: 'Sent History', icon: '📤' },
  { key: 'broadcast', label: 'Broadcast', icon: '📢' },
  { key: 'quicksend', label: 'Quick Send', icon: '⚡' },
  { key: 'keywords', label: 'Auto-Reply', icon: '🤖' },
];

export default function Sidebar({ open, onNavigate }) {
  const { activeView, setActiveView, selectedIds, contacts, unreadCount } = useApp();

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <nav className="sidebar-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${activeView === n.key ? 'active' : ''}`}
            onClick={() => { setActiveView(n.key); onNavigate?.(); }}
            type="button"
          >
            <span className="nav-ico">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
            {n.key === 'contacts' && contacts.length > 0 && (
              <span className="nav-badge">{contacts.length}</span>
            )}
            {n.key === 'inbox' && unreadCount > 0 && (
              <span className="nav-badge nav-badge-red">{unreadCount}</span>
            )}
            {n.key === 'broadcast' && selectedIds.size > 0 && (
              <span className="nav-badge nav-badge-violet">{selectedIds.size}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <p className="small faint">⚠️ Use a secondary number — automated messaging carries a ban risk.</p>
      </div>
    </aside>
  );
}
