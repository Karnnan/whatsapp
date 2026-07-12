'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function GroupsCard({ status, notify, onExtracted }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(null);

  const ready = status === 'READY';

  useEffect(() => {
    const socket = getSocket();
    const onProgress = (p) => setProgress(p);
    socket.on('extract-progress', onProgress);
    return () => socket.off('extract-progress', onProgress);
  }, []);

  async function loadGroups() {
    if (!ready) return notify?.('Connect WhatsApp first.', 'error');
    setLoading(true);
    try {
      const { groups } = await api.getGroups();
      setGroups(groups);
      if (groups.length && !selected) setSelected(groups[0].id);
      notify?.(`Found ${groups.length} groups.`, 'ok');
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleExtract() {
    if (!selected) return notify?.('Choose a group first.', 'error');
    setExtracting(true);
    setProgress({ processed: 0, total: 0 });
    try {
      const result = await api.extract(selected);
      notify?.(`Extracted & saved ${result.saved} contacts from "${result.groupName}".`, 'ok');
      onExtracted?.();
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setExtracting(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">👥</span> Groups & Extraction
        </div>
        <button className="btn btn-sm" onClick={loadGroups} disabled={!ready || loading}>
          {loading ? <span className="spinner" /> : '⟳'} {groups.length ? 'Refresh' : 'Load groups'}
        </button>
      </div>
      <p className="card-sub">
        Pull every participant&apos;s number, saved name, public name and “About” status into the database.
      </p>

      <div className="field">
        <label className="label">Select a group</label>
        <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!groups.length}>
          {!groups.length && <option value="">— load groups to begin —</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.participantCount})
            </option>
          ))}
        </select>
      </div>

      <button className="btn btn-violet btn-block" onClick={handleExtract} disabled={!ready || !selected || extracting}>
        {extracting ? <span className="spinner" /> : '⇩'} {extracting ? 'Extracting…' : 'Extract participants'}
      </button>

      {progress && (
        <div className="mt-3">
          <div className="progress">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-meta">
            <span>{progress.number ? `Processing +${progress.number}` : 'Preparing…'}</span>
            <span>{progress.total ? `${progress.processed}/${progress.total}` : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
