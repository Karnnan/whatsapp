'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const TYPE_ICON = { text: '💬', media: '🎬', voice: '🎤' };

export default function OutboxView() {
  const { notify, ready } = useApp();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getSent();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(m) {
    if (!m.whatsapp_message_id) return notify('No WhatsApp id was stored for this message.', 'error');
    if (!confirm('Delete this message for everyone? Recipients will see "This message was deleted."')) return;
    setBusyId(m.id);
    try {
      await api.deleteMessage(m.whatsapp_message_id);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, revoked: true } : x)));
      notify('Deleted for everyone.', 'ok');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2>Sent History <span className="badge">{messages.length}</span></h2>
          <p className="muted">Messages sent via Quick Send and Broadcast. Revoke within WhatsApp&apos;s deletion window.</p>
        </div>
        <button className="btn btn-sm" onClick={load} disabled={loading} style={{ flex: 'none' }}>
          {loading ? <span className="spinner" /> : '⟳'} Refresh
        </button>
      </div>

      {needsSetup && (
        <div className="card setup-note">
          ⚠️ The <b>sent_messages</b> table doesn&apos;t exist yet. Run the latest <code>backend/db/schema.sql</code> in Supabase to enable sent history.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="big">📤</div>No sent messages yet. Anything you Quick Send or Broadcast will be logged here.</div></div>
      ) : (
        <div className="card group-card">
          <div className="table-wrap" style={{ maxHeight: 560 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Recipient</th>
                  <th>Message</th>
                  <th>Sent</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td title={m.media_type}>{TYPE_ICON[m.media_type] || '💬'}</td>
                    <td className="cell-mono">+{m.recipient_number}</td>
                    <td className="cell-dim" style={{ maxWidth: 320 }}>{m.message_body || <span className="faint">[{m.media_type || 'media'}]</span>}</td>
                    <td className="cell-dim small">{fmt(m.created_at)}</td>
                    <td>
                      <div className="cell-actions">
                        {m.revoked ? (
                          <span className="badge">🗑 deleted</span>
                        ) : (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => revoke(m)}
                            disabled={!ready || busyId === m.id || !m.whatsapp_message_id}
                            title={m.whatsapp_message_id ? 'Delete for everyone' : 'No message id stored'}
                          >
                            {busyId === m.id ? <span className="spinner" /> : '🗑'} Delete for everyone
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
