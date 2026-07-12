'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function BroadcastView() {
  const { ready, notify, contacts, groupedContacts, selectedContacts } = useApp();

  const [recipientMode, setRecipientMode] = useState('all'); // all | selected | groups
  const [chosenGroups, setChosenGroups] = useState(() => new Set());
  const [mode, setMode] = useState('text'); // text | media
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [asVoice, setAsVoice] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const socket = getSocket();
    const onProgress = (p) => setProgress(p);
    const onStatus = (s) => { if (!s.broadcasting) setRunning(false); };
    socket.on('broadcast-progress', onProgress);
    socket.on('status', onStatus);
    return () => {
      socket.off('broadcast-progress', onProgress);
      socket.off('status', onStatus);
    };
  }, []);

  // Resolve the recipient phone numbers from the chosen mode.
  const recipientNumbers = useMemo(() => {
    let list = [];
    if (recipientMode === 'selected') list = selectedContacts;
    else if (recipientMode === 'groups') list = contacts.filter((c) => chosenGroups.has(c.group_id || '__none__'));
    else list = contacts;
    return [...new Set(list.map((c) => c.phone_number).filter(Boolean))];
  }, [recipientMode, selectedContacts, contacts, chosenGroups]);

  function toggleGroup(key) {
    setChosenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleBroadcast() {
    if (!recipientNumbers.length) return notify('No recipients selected.', 'error');
    if (mode === 'text' && !text.trim()) return notify('Write a message first.', 'error');
    if (mode === 'media' && !file) return notify('Choose a file to broadcast.', 'error');
    if (!confirm(
      `Send this ${mode === 'media' ? (asVoice ? 'voice note' : (viewOnce ? 'view-once media' : 'media')) : 'message'} to ${recipientNumbers.length} recipients?\n\nMessages are spaced with random delays to reduce spam-flag risk.`
    )) return;

    const fd = new FormData();
    fd.append('numbers', JSON.stringify(recipientNumbers));
    if (mode === 'media') {
      fd.append('file', file);
      if (asVoice) fd.append('asVoice', 'true');
      if (viewOnce && !asVoice) fd.append('viewOnce', 'true');
      if (text.trim()) fd.append('caption', text);
    } else {
      fd.append('text', text);
    }

    setRunning(true);
    setProgress({ processed: 0, total: recipientNumbers.length, sent: 0, failed: 0 });
    try {
      const res = await api.broadcast(fd);
      notify(`Broadcast started for ${res.recipients} recipients.`, 'info');
    } catch (e) {
      notify(e.message, 'error');
      setRunning(false);
      setProgress(null);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="view">
      <div className="view-head">
        <h2>Bulk Broadcast</h2>
        <p className="muted">Send a message or media to a chosen audience with human-like random delays.</p>
      </div>

      <div className="view-grid two">
        {/* Recipients */}
        <div className="card">
          <div className="card-head">
            <div className="card-title"><span className="ico">🎯</span> Recipients</div>
            <span className="badge badge-violet">{recipientNumbers.length} selected</span>
          </div>

          <div className="seg" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
            <button className={recipientMode === 'all' ? 'active' : ''} onClick={() => setRecipientMode('all')} type="button">
              Everyone ({contacts.length})
            </button>
            <button className={recipientMode === 'selected' ? 'active' : ''} onClick={() => setRecipientMode('selected')} type="button">
              Selected ({selectedContacts.length})
            </button>
            <button className={recipientMode === 'groups' ? 'active' : ''} onClick={() => setRecipientMode('groups')} type="button">
              By group
            </button>
          </div>

          {recipientMode === 'groups' && (
            <div className="group-picker">
              {groupedContacts.length === 0 && <p className="faint small">No groups yet — extract a group first.</p>}
              {groupedContacts.map((g) => {
                const key = g.groupId || '__none__';
                return (
                  <label className="check-label picker-row" key={key}>
                    <input type="checkbox" className="check" checked={chosenGroups.has(key)} onChange={() => toggleGroup(key)} />
                    <span className="group-name">{g.groupName}</span>
                    <span className="badge">{g.items.length}</span>
                  </label>
                );
              })}
            </div>
          )}

          {recipientMode === 'selected' && selectedContacts.length === 0 && (
            <p className="faint small">No contacts selected. Pick some in the Contacts view.</p>
          )}
        </div>

        {/* Message */}
        <div className="card">
          <div className="card-head">
            <div className="card-title"><span className="ico">📢</span> Message</div>
          </div>

          <div className="seg" style={{ marginBottom: 14 }}>
            <button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')} type="button">💬 Text</button>
            <button className={mode === 'media' ? 'active' : ''} onClick={() => setMode('media')} type="button">🎬 Media / Voice</button>
          </div>

          {mode === 'media' && (
            <div className="stack" style={{ marginBottom: 14 }}>
              <label className="file-drop">
                <input type="file" accept={asVoice ? 'audio/*' : 'image/*,video/*,audio/*'} onChange={(e) => setFile(e.target.files[0] || null)} />
                <span style={{ fontSize: 18 }}>📎</span>
                <span className={file ? 'file-name' : ''}>{file ? file.name : 'Choose media or audio file'}</span>
              </label>
              <label className="spread toggle-row">
                <span className="small muted">🎤 Send audio as a native voice note</span>
                <button type="button" className={`switch ${asVoice ? 'on' : ''}`} onClick={() => setAsVoice((v) => !v)} aria-pressed={asVoice} />
              </label>
              <label className="spread toggle-row">
                <span className="small muted">👁️ Send media as “View Once”</span>
                <button type="button" className={`switch ${viewOnce ? 'on' : ''}`} onClick={() => setViewOnce((v) => !v)} aria-pressed={viewOnce} disabled={asVoice} />
              </label>
            </div>
          )}

          <textarea
            className="textarea"
            placeholder={mode === 'media' ? 'Optional caption…' : 'Broadcast message…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <button className="btn btn-violet btn-block mt-2" onClick={handleBroadcast} disabled={!ready || running || !recipientNumbers.length}>
            {running ? <span className="spinner" /> : '📢'} {running ? 'Broadcasting…' : `Send to ${recipientNumbers.length}`}
          </button>

          {progress && (
            <div className="mt-3">
              <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
              <div className="progress-meta">
                <span>✅ {progress.sent} sent · ❌ {progress.failed} failed</span>
                <span>{progress.processed}/{progress.total}</span>
              </div>
            </div>
          )}
          {!ready && <p className="small faint center mt-2" style={{ margin: '10px 0 0' }}>Connect WhatsApp to broadcast.</p>}
        </div>
      </div>
    </div>
  );
}
