'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function ExtractionView() {
  const { ready, notify, loadContacts, setActiveView } = useApp();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState(null);
  const progressTimer = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    const onProgress = (p) => setProgress(p);
    socket.on('extract-progress', onProgress);
    return () => {
      socket.off('extract-progress', onProgress);
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, []);

  async function loadGroups() {
    if (!ready) return notify('Connect WhatsApp first.', 'error');
    setLoading(true);
    try {
      const { groups } = await api.getGroups();
      setGroups(groups);
      if (groups.length && !selected) setSelected(groups[0].id);
      notify(`Found ${groups.length} groups.`, 'ok');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleExtract() {
    if (!selected) return notify('Choose a group first.', 'error');
    if (progressTimer.current) { clearTimeout(progressTimer.current); progressTimer.current = null; }
    setExtracting(true);
    setCancelling(false);
    setProgress({ processed: 0, total: 0 });
    try {
      const result = await api.extract(selected);
      if (result.cancelled) {
        notify(`Extraction cancelled — saved ${result.saved} of ${result.total}.`, 'info');
      } else {
        notify(`Extracted & saved ${result.saved} contacts from "${result.groupName}".`, 'ok');
      }
      loadContacts();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setExtracting(false);
      setCancelling(false);
      progressTimer.current = setTimeout(() => { setProgress(null); progressTimer.current = null; }, 2000);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.cancelExtract();
      notify('Cancelling — will stop after the current contact.', 'info');
    } catch (e) {
      notify(e.message, 'error');
      setCancelling(false);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="view">
      <div className="view-head">
        <h2>Groups &amp; Extraction</h2>
        <p className="muted">Pull every participant&apos;s number, saved name, public name and “About” status into the database.</p>
      </div>

      <div className="view-grid narrow">
        <div className="card">
          <div className="card-head">
            <div className="card-title"><span className="ico">👥</span> Select a group</div>
            <button className="btn btn-sm" onClick={loadGroups} disabled={!ready || loading}>
              {loading ? <span className="spinner" /> : '⟳'} {groups.length ? 'Refresh' : 'Load groups'}
            </button>
          </div>

          <div className="field">
            <select
              className="select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!groups.length}
            >
              {!groups.length && <option value="">— load groups to begin —</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.participantCount})</option>
              ))}
            </select>
          </div>

          <div className="row">
            <button className="btn btn-violet" onClick={handleExtract} disabled={!ready || !selected || extracting}>
              {extracting ? <span className="spinner" /> : '⇩'} {extracting ? 'Extracting…' : 'Extract participants'}
            </button>
            {extracting && (
              <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling} style={{ flex: 'none' }}>
                {cancelling ? 'Cancelling…' : '✕ Cancel'}
              </button>
            )}
          </div>

          {progress && (
            <div className="mt-3">
              <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
              <div className="progress-meta">
                <span>
                  {progress.done
                    ? (progress.cancelled ? 'Cancelled' : 'Done')
                    : (progress.number ? `Processing +${progress.number}` : 'Preparing…')}
                </span>
                <span>{progress.total ? `${progress.processed}/${progress.total}` : ''}</span>
              </div>
            </div>
          )}

          <p className="small faint mt-3" style={{ margin: '14px 0 0' }}>
            After extracting, open <button className="linklike" onClick={() => setActiveView('contacts')}>Contacts</button> to review, select and export.
          </p>
        </div>
      </div>
    </div>
  );
}
