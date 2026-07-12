'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const TYPE_ICON = { text: '💬', media: '🎬', voice: '🎤' };

export default function OutboxView() {
  const { notify, ready } = useApp();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getSent();
      setMessages(res.messages || []);
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

  // A message can be revoked only if it isn't already deleted and we stored its id.
  const revocable = (m) => !m.revoked && !!m.whatsapp_message_id;

  // Group by message content (one card per broadcast / distinct message).
  const groups = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const key = `${m.media_type || 'text'}||${m.message_body || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: m.message_body || `[${m.media_type || 'media'}]`,
          mediaType: m.media_type || 'text',
          items: [],
          latest: m.created_at,
        });
      }
      const g = map.get(key);
      g.items.push(m);
      if ((m.created_at || '') > (g.latest || '')) g.latest = m.created_at;
    }
    return Array.from(map.values()).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
  }, [messages]);

  const allRevocable = useMemo(() => messages.filter(revocable), [messages]);
  const allSelected = allRevocable.length > 0 && allRevocable.every((m) => selected.has(m.id));
  const someSelected = selected.size > 0;

  const setMany = (ids, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSel = () => setSelected(new Set());

  async function revoke(m) {
    if (!m.whatsapp_message_id) return notify('No WhatsApp id was stored for this message.', 'error');
    if (!confirm('Delete this message for everyone? Recipients will see "This message was deleted."')) return;
    setBusy(true);
    try {
      await api.deleteMessage(m.whatsapp_message_id);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, revoked: true } : x)));
      notify('Deleted for everyone.', 'ok');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = messages.filter((m) => selected.has(m.id) && revocable(m)).map((m) => m.whatsapp_message_id);
    if (!ids.length) return notify('Select messages that can still be deleted.', 'error');
    if (!confirm(`Delete ${ids.length} message${ids.length === 1 ? '' : 's'} for everyone?`)) return;
    setBusy(true);
    try {
      const res = await api.deleteMessages(ids);
      notify(`Deleted ${res.revoked} for everyone${res.failed ? ` · ${res.failed} failed` : ''}.`, 'ok');
      clearSel();
      await load();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2>Sent History <span className="badge">{messages.length}</span></h2>
          <p className="muted">Messages sent via Quick Send and Broadcast. Select any to bulk-revoke within WhatsApp&apos;s deletion window.</p>
        </div>
        <div className="row" style={{ flex: 'none', alignItems: 'center' }}>
          <label className="check-label" style={{ marginRight: 4 }}>
            <input
              type="checkbox"
              className="check"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
              onChange={(e) => setMany(allRevocable.map((m) => m.id), e.target.checked)}
              disabled={!allRevocable.length || busy}
            />
            <span className="small muted">Select all</span>
          </label>
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '⟳'} Refresh
          </button>
        </div>
      </div>

      {needsSetup && (
        <div className="card setup-note">
          ⚠️ The <b>sent_messages</b> table doesn&apos;t exist yet. Run the latest <code>backend/db/schema.sql</code> in Supabase to enable sent history.
        </div>
      )}

      {someSelected && (
        <div className="selection-bar">
          <span><b>{selected.size}</b> selected</span>
          <div className="row" style={{ flex: 'none' }}>
            <button className="btn btn-sm btn-danger" onClick={bulkDelete} disabled={busy || !ready}>
              {busy ? <span className="spinner" /> : '🗑'} Delete selected for everyone
            </button>
            <button className="btn btn-sm btn-ghost" onClick={clearSel} disabled={busy}>Clear</button>
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="big">📤</div>No sent messages yet. Anything you Quick Send or Broadcast is logged here.</div></div>
      ) : (
        groups.map((g) => {
          const gIds = g.items.filter(revocable).map((m) => m.id);
          const gSel = gIds.filter((id) => selected.has(id)).length;
          const gAll = gIds.length > 0 && gSel === gIds.length;
          const label = g.label.length > 64 ? `${g.label.slice(0, 64)}…` : g.label;
          return (
            <div className="card group-card" key={g.key}>
              <div className="group-head">
                <label className="check-label">
                  <input
                    type="checkbox"
                    className="check"
                    checked={gAll}
                    disabled={!gIds.length || busy}
                    ref={(el) => { if (el) el.indeterminate = gSel > 0 && !gAll; }}
                    onChange={(e) => setMany(gIds, e.target.checked)}
                  />
                  <span className="group-name">{TYPE_ICON[g.mediaType] || '💬'} {label}</span>
                </label>
                <div className="group-meta">
                  <span className="badge">{g.items.length} sent</span>
                  {gSel > 0 && <span className="badge badge-violet">{gSel} selected</span>}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Recipient</th>
                      <th>Sent</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((m) => (
                      <tr key={m.id} className={selected.has(m.id) ? 'row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            className="check"
                            checked={selected.has(m.id)}
                            disabled={!revocable(m) || busy}
                            onChange={() => toggle(m.id)}
                          />
                        </td>
                        <td className="cell-mono">+{m.recipient_number}</td>
                        <td className="cell-dim small">{fmt(m.created_at)}</td>
                        <td>
                          <div className="cell-actions">
                            {m.revoked ? (
                              <span className="badge">🗑 deleted</span>
                            ) : (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => revoke(m)}
                                disabled={!ready || busy || !m.whatsapp_message_id}
                                title={m.whatsapp_message_id ? 'Delete for everyone' : 'No message id stored'}
                              >🗑 Delete for everyone</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
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
