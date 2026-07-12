'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function KeywordsCard({ notify }) {
  const [keywords, setKeywords] = useState([]);
  const [autoReply, setAutoReply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [reply, setReply] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ keywords }, { settings }] = await Promise.all([api.getKeywords(), api.getSettings()]);
      setKeywords(keywords);
      setAutoReply(!!settings.auto_reply_enabled);
    } catch (e) {
      notify?.(`Could not load auto-reply data: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function toggle() {
    setToggling(true);
    const next = !autoReply;
    try {
      await api.setAutoReply(next);
      setAutoReply(next);
      notify?.(`Auto-reply turned ${next ? 'ON' : 'OFF'}.`, next ? 'ok' : 'info');
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setToggling(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!keyword.trim() || !reply.trim()) return notify?.('Both keyword and reply are required.', 'error');
    setSaving(true);
    try {
      if (editingId) {
        await api.updateKeyword(editingId, keyword.trim(), reply);
        notify?.('Keyword updated.', 'ok');
      } else {
        await api.addKeyword(keyword.trim(), reply);
        notify?.('Keyword added.', 'ok');
      }
      resetForm();
      load();
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function edit(k) {
    setEditingId(k.id);
    setKeyword(k.keyword);
    setReply(k.reply);
  }

  function resetForm() {
    setEditingId(null);
    setKeyword('');
    setReply('');
  }

  async function remove(id) {
    if (!confirm('Delete this keyword-reply pair?')) return;
    try {
      await api.deleteKeyword(id);
      notify?.('Keyword deleted.', 'info');
      load();
    } catch (e) {
      notify?.(e.message, 'error');
    }
  }

  return (
    <div className="card col-span-2">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">🤖</span> Auto-Reply Keywords
        </div>
        <label className="spread" style={{ gap: 10, cursor: 'pointer' }}>
          <span className={`small ${autoReply ? 'status-ready' : 'muted'}`} style={{ fontWeight: 600 }}>
            {autoReply ? 'ON' : 'OFF'}
          </span>
          <button
            type="button"
            className={`switch ${autoReply ? 'on' : ''}`}
            onClick={toggle}
            disabled={toggling}
            aria-pressed={autoReply}
          />
        </label>
      </div>
      <p className="card-sub">
        When ON, incoming messages containing a keyword get the matching reply automatically.
      </p>

      <form className="row" onSubmit={submit} style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, flex: '0 0 30%' }}>
          <label className="label">Keyword (contains)</label>
          <input className="input" placeholder="e.g. price" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label className="label">Auto reply</label>
          <input className="input" placeholder="e.g. Our price list is…" value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving} style={{ flex: 'none' }}>
          {saving ? <span className="spinner" /> : editingId ? '✓' : '+'} {editingId ? 'Update' : 'Add'}
        </button>
        {editingId && (
          <button className="btn btn-ghost" type="button" onClick={resetForm} style={{ flex: 'none' }}>Cancel</button>
        )}
      </form>

      {loading ? (
        <div className="empty-state"><span className="spinner" style={{ width: 22, height: 22 }} /></div>
      ) : keywords.length === 0 ? (
        <div className="empty-state">
          <div className="big">💬</div>
          No keywords yet. Add your first keyword-reply pair above.
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 300 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Keyword</th>
                <th>Reply</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((k) => (
                <tr key={k.id}>
                  <td><span className="badge badge-green">{k.keyword}</span></td>
                  <td className="cell-dim">{k.reply}</td>
                  <td>
                    <div className="cell-actions">
                      <button className="btn btn-sm btn-icon" onClick={() => edit(k)} title="Edit">✎</button>
                      <button className="btn btn-sm btn-icon btn-danger" onClick={() => remove(k.id)} title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
