'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function BroadcastCard({ status, notify, contactsCount }) {
  const [mode, setMode] = useState('text'); // text | media
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [asVoice, setAsVoice] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  const ready = status === 'READY';

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

  async function handleBroadcast() {
    if (!contactsCount) return notify?.('No saved contacts to broadcast to.', 'error');
    if (mode === 'text' && !text.trim()) return notify?.('Write a message first.', 'error');
    if (mode === 'media' && !file) return notify?.('Choose a file to broadcast.', 'error');
    if (
      !confirm(
        `Send this ${mode === 'media' ? (asVoice ? 'voice note' : 'media') : 'message'} to ${contactsCount} contacts?\n\nMessages are spaced with random delays to reduce spam-flag risk.`
      )
    )
      return;

    const fd = new FormData();
    if (mode === 'media') {
      fd.append('file', file);
      if (asVoice) fd.append('asVoice', 'true');
      if (text.trim()) fd.append('caption', text);
    } else {
      fd.append('text', text);
    }

    setRunning(true);
    setProgress({ processed: 0, total: contactsCount, sent: 0, failed: 0 });
    try {
      const res = await api.broadcast(fd);
      notify?.(`Broadcast started for ${res.recipients} recipients.`, 'info');
    } catch (e) {
      notify?.(e.message, 'error');
      setRunning(false);
      setProgress(null);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">📢</span> Bulk Broadcast
        </div>
        <span className="badge badge-violet">{contactsCount} recipients</span>
      </div>
      <p className="card-sub">Send a message or media to every saved contact, with human-like random delays.</p>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')} type="button">💬 Text</button>
        <button className={mode === 'media' ? 'active' : ''} onClick={() => setMode('media')} type="button">🎬 Media / Voice</button>
      </div>

      {mode === 'media' && (
        <div className="stack" style={{ marginBottom: 14 }}>
          <label className="file-drop">
            <input
              type="file"
              accept={asVoice ? 'audio/*' : 'image/*,video/*,audio/*'}
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
            <span style={{ fontSize: 18 }}>📎</span>
            <span className={file ? 'file-name' : ''}>{file ? file.name : 'Choose media or audio file'}</span>
          </label>
          <label className="spread" style={{ cursor: 'pointer' }}>
            <span className="small muted">🎤 Send audio as a native voice note</span>
            <button
              type="button"
              className={`switch ${asVoice ? 'on' : ''}`}
              onClick={() => setAsVoice((v) => !v)}
              aria-pressed={asVoice}
            />
          </label>
        </div>
      )}

      <textarea
        className="textarea"
        placeholder={mode === 'media' ? 'Optional caption…' : 'Broadcast message…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button
        className="btn btn-violet btn-block mt-2"
        onClick={handleBroadcast}
        disabled={!ready || running || !contactsCount}
      >
        {running ? <span className="spinner" /> : '📢'} {running ? 'Broadcasting…' : 'Start broadcast'}
      </button>

      {progress && (
        <div className="mt-3">
          <div className="progress">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-meta">
            <span>✅ {progress.sent} sent · ❌ {progress.failed} failed</span>
            <span>{progress.processed}/{progress.total}</span>
          </div>
        </div>
      )}

      {!ready && <p className="small faint center mt-2" style={{ margin: '10px 0 0' }}>Connect WhatsApp to broadcast.</p>}
    </div>
  );
}
