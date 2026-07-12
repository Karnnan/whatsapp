'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import SendModal from '@/components/SendModal';

export default function InboxView() {
  const { notify, ready, refreshUnread } = useApp();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getReceived(false);
      setMessages(res.messages);
      setNeedsSetup(!!res.needsSetup);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    const onNew = (m) => setMessages((list) => [m, ...list]);
    socket.on('new-message', onNew);
    return () => socket.off('new-message', onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAllRead() {
    try {
      await api.markReceivedRead();
      setMessages((list) => list.map((m) => ({ ...m, is_read: true })));
      refreshUnread();
      notify('Marked all as read.', 'ok');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  const unread = messages.filter((m) => !m.is_read).length;

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2>Inbox {unread > 0 && <span className="badge nav-badge-red" style={{ color: '#fff' }}>{unread} new</span>}</h2>
          <p className="muted">Incoming direct messages received while the bot is connected.</p>
        </div>
        <div className="row" style={{ flex: 'none' }}>
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '⟳'} Refresh
          </button>
          <button className="btn btn-sm btn-primary" onClick={markAllRead} disabled={!unread}>✓ Mark all read</button>
        </div>
      </div>

      {needsSetup && (
        <div className="card setup-note">
          ⚠️ The <b>received_messages</b> table doesn&apos;t exist yet. Run the latest <code>backend/db/schema.sql</code> in Supabase to enable the inbox.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="big">📭</div>No messages yet. Incoming direct messages will appear here in real time.</div></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="msg-list">
            {messages.map((m) => (
              <div className={`msg-item ${m.is_read ? '' : 'unread'}`} key={m.id}>
                <div className="msg-avatar">{(m.sender_name || m.sender_number || '?').slice(0, 1).toUpperCase()}</div>
                <div className="msg-body">
                  <div className="msg-top">
                    <span className="msg-name">
                      {!m.is_read && <span className="unread-dot" />}
                      {m.sender_name || `+${m.sender_number}`}
                    </span>
                    <span className="msg-time">{fmt(m.created_at)}</span>
                  </div>
                  <div className="msg-text">{m.message_body || <span className="faint">[no text]</span>}</div>
                  <div className="cell-mono small faint">+{m.sender_number}</div>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => setReplyTo({ phone_number: m.sender_number, name: m.sender_name })}
                  disabled={!ready}
                  title={ready ? 'Reply' : 'Connect WhatsApp first'}
                >↩ Reply</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <SendModal contact={replyTo} disabled={!ready} notify={notify} onClose={() => setReplyTo(null)} />
    </div>
  );
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}
