'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

const TYPES = [
  { key: 'text', label: 'Text', icon: '💬' },
  { key: 'media', label: 'Video / Image', icon: '🎬' },
  { key: 'voice', label: 'Voice Note', icon: '🎤' },
];

export default function SendComposer({ number: fixedNumber, disabled, notify, onSent, compact }) {
  const [type, setType] = useState('text');
  const [number, setNumber] = useState(fixedNumber || '');
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [sending, setSending] = useState(false);

  const targetNumber = fixedNumber || number;

  async function handleSend() {
    if (!targetNumber) return notify?.('Enter a phone number first.', 'error');
    if (type === 'text' && !text.trim()) return notify?.('Type a message first.', 'error');
    if (type !== 'text' && !file) return notify?.('Choose a file to send.', 'error');

    const fd = new FormData();
    fd.append('number', targetNumber);
    fd.append('type', type);
    if (type === 'text') {
      fd.append('text', text);
    } else {
      fd.append('file', file);
      if (caption) fd.append('caption', caption);
      if (type === 'media' && viewOnce) fd.append('viewOnce', 'true');
    }

    setSending(true);
    try {
      await api.send(fd);
      notify?.(`${labelFor(type)} sent to ${targetNumber}.`, 'ok');
      setText('');
      setCaption('');
      setFile(null);
      onSent?.();
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setSending(false);
    }
  }

  const accept = type === 'voice' ? 'audio/*' : type === 'media' ? 'image/*,video/*' : '*/*';

  return (
    <div className="stack">
      <div className="seg" role="tablist">
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={type === t.key ? 'active' : ''}
            onClick={() => { setType(t.key); setFile(null); setCaption(''); setViewOnce(false); }}
            type="button"
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {!fixedNumber && (
        <div className="field" style={{ margin: 0 }}>
          <label className="label">Recipient number</label>
          <input
            className="input"
            placeholder="e.g. 14155552671 (country code, no +)"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
      )}

      {type === 'text' ? (
        <textarea
          className="textarea"
          placeholder="Write your message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <>
          <label className="file-drop">
            <input type="file" accept={accept} onChange={(e) => setFile(e.target.files[0] || null)} />
            <span style={{ fontSize: 18 }}>{type === 'voice' ? '🎤' : '📎'}</span>
            <span className={file ? 'file-name' : ''}>
              {file ? file.name : type === 'voice' ? 'Choose an audio file (mp3 / ogg / m4a)' : 'Choose an image or video'}
            </span>
          </label>
          {type === 'voice' && (
            <p className="small faint" style={{ margin: 0 }}>
              Sent as a native WhatsApp voice message (push-to-talk).
            </p>
          )}
          {type === 'media' && (
            <>
              <input
                className="input"
                placeholder="Optional caption…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <label className="spread toggle-row">
                <span className="small muted">👁️ Send as “View Once”</span>
                <button
                  type="button"
                  className={`switch ${viewOnce ? 'on' : ''}`}
                  onClick={() => setViewOnce((v) => !v)}
                  aria-pressed={viewOnce}
                />
              </label>
            </>
          )}
        </>
      )}

      <button
        className="btn btn-primary btn-block"
        onClick={handleSend}
        disabled={disabled || sending}
        type="button"
      >
        {sending ? <span className="spinner" /> : '➤'} {sending ? 'Sending…' : `Send ${labelFor(type)}`}
      </button>
      {disabled && !compact && (
        <p className="small faint center" style={{ margin: 0 }}>Connect WhatsApp to enable sending.</p>
      )}
    </div>
  );
}

function labelFor(type) {
  if (type === 'voice') return 'Voice Note';
  if (type === 'media') return 'Media';
  return 'Text';
}
