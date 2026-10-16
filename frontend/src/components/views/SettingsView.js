'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const PRESETS = [
  {
    id: 'ultra',
    title: '🛡️ Ultra Safe',
    tag: 'Recommended for 100+ Contacts',
    desc: 'High pacing to minimize spam detection risk. Perfect for large broadcasts.',
    minDelay: 10,
    maxDelay: 25,
    batchSize: 20,
    batchDelayMinutes: 10,
  },
  {
    id: 'balanced',
    title: '⚖️ Balanced',
    tag: 'Standard Use',
    desc: 'Good balance of speed and account protection. Recommended for verified contacts.',
    minDelay: 5,
    maxDelay: 15,
    batchSize: 25,
    batchDelayMinutes: 5,
  },
  {
    id: 'fast',
    title: '⚡ Fast Dispatch',
    tag: 'Small Lists Only (< 50)',
    desc: 'Faster dispatch for urgent announcements or small, highly familiar groups.',
    minDelay: 3,
    maxDelay: 8,
    batchSize: 50,
    batchDelayMinutes: 2,
  },
];

export default function SettingsView() {
  const { notify } = useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [autoReply, setAutoReply] = useState(false);
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(15);
  const [batchSize, setBatchSize] = useState(25);
  const [batchDelayMinutes, setBatchDelayMinutes] = useState(5);

  // Simulation test input
  const [simContacts, setSimContacts] = useState(1000);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const { settings } = await api.getSettings();
      if (settings) {
        setAutoReply(!!settings.auto_reply_enabled);
        if (settings.broadcast_min_delay != null) setMinDelay(Number(settings.broadcast_min_delay));
        if (settings.broadcast_max_delay != null) setMaxDelay(Number(settings.broadcast_max_delay));
        if (settings.batch_size != null) setBatchSize(Number(settings.batch_size));
        if (settings.batch_delay_minutes != null) setBatchDelayMinutes(Number(settings.batch_delay_minutes));
      }
    } catch (e) {
      notify?.(`Could not load settings: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(p) {
    setMinDelay(p.minDelay);
    setMaxDelay(p.maxDelay);
    setBatchSize(p.batchSize);
    setBatchDelayMinutes(p.batchDelayMinutes);
    notify?.(`Applied "${p.title}" preset. Click "Save Settings" to confirm.`, 'info');
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    if (minDelay < 1) return notify?.('Minimum delay must be at least 1 second.', 'error');
    if (maxDelay < minDelay) return notify?.('Maximum delay cannot be less than minimum delay.', 'error');
    if (batchSize < 1) return notify?.('Batch size must be at least 1 contact.', 'error');
    if (batchDelayMinutes < 0) return notify?.('Batch rest pause cannot be negative.', 'error');

    setSaving(true);
    try {
      await api.updateSettings({
        auto_reply_enabled: autoReply,
        broadcast_min_delay: minDelay,
        broadcast_max_delay: maxDelay,
        batch_size: batchSize,
        batch_delay_minutes: batchDelayMinutes,
      });
      notify?.('Settings saved and activated successfully!', 'ok');
    } catch (e) {
      notify?.(`Failed to save settings: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Simulator calculations
  const totalBatches = Math.max(1, Math.ceil(simContacts / Math.max(1, batchSize)));
  const totalBatchPauses = Math.max(0, totalBatches - 1);
  const avgDelaySec = (minDelay + maxDelay) / 2;
  const sendingTimeSec = Math.max(0, simContacts - 1) * avgDelaySec;
  const restTimeSec = totalBatchPauses * (batchDelayMinutes * 60);
  const totalEstSec = sendingTimeSec + restTimeSec;
  const estHours = Math.floor(totalEstSec / 3600);
  const estMinutes = Math.round((totalEstSec % 3600) / 60);

  const isSafeRating = minDelay >= 8 && batchSize <= 30 && batchDelayMinutes >= 5;
  const isModerateRating = minDelay >= 4 && batchSize <= 50;

  return (
    <div className="view">
      <div className="view-head">
        <h2>Anti-Ban & Broadcast Configuration</h2>
        <p className="muted">
          Configure safety delays and batch-wise dispatch to protect your WhatsApp number from spam filters and bans.
        </p>
      </div>

      {loading ? (
        <div className="card center-card" style={{ padding: 40 }}>
          <span className="spinner" /> Loading configuration…
        </div>
      ) : (
        <form onSubmit={handleSave} className="stack" style={{ gap: 20 }}>
          {/* Quick Presets */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="ico">⚡</span> Safety Presets
              </div>
              <span className="badge badge-violet">Quick Setup</span>
            </div>
            <p className="small muted" style={{ marginTop: 0, marginBottom: 14 }}>
              Choose a tested profile based on your messaging volume:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {PRESETS.map((p) => {
                const isSelected =
                  minDelay === p.minDelay &&
                  maxDelay === p.maxDelay &&
                  batchSize === p.batchSize &&
                  batchDelayMinutes === p.batchDelayMinutes;
                return (
                  <div
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    style={{
                      cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--panel-border)'}`,
                      background: isSelected ? 'rgba(37, 211, 102, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      padding: 14,
                      borderRadius: 'var(--radius-sm)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{p.title}</strong>
                      {isSelected && <span className="badge badge-ok">Active</span>}
                    </div>
                    <span className="small badge badge-violet" style={{ fontSize: 11, margin: '6px 0' }}>
                      {p.tag}
                    </span>
                    <p className="small faint" style={{ margin: '6px 0 10px' }}>
                      {p.desc}
                    </p>
                    <div className="small muted" style={{ fontSize: 12 }}>
                      ⏱️ {p.minDelay}–{p.maxDelay}s delay · 📦 {p.batchSize}/batch · ☕ {p.batchDelayMinutes}m rest
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="view-grid two">
            {/* Delay Settings */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">
                  <span className="ico">⏳</span> Message Spacing (Human Delays)
                </div>
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>
                Every single message is separated by a randomized pause to mimic natural human typing.
              </p>

              <div className="field">
                <div className="spread">
                  <label className="label">Minimum Delay between messages</label>
                  <span className="badge badge-ok">{minDelay} seconds</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="45"
                  step="1"
                  value={minDelay}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMinDelay(v);
                    if (maxDelay < v) setMaxDelay(v + 5);
                  }}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="60"
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                />
              </div>

              <div className="field">
                <div className="spread">
                  <label className="label">Maximum Delay between messages</label>
                  <span className="badge badge-ok">{maxDelay} seconds</span>
                </div>
                <input
                  type="range"
                  min={minDelay}
                  max="90"
                  step="1"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <input
                  type="number"
                  className="input"
                  min={minDelay}
                  max="120"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                />
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)' }}>
                <p className="small faint" style={{ margin: 0 }}>
                  💡 <strong>How it works:</strong> Before sending to each recipient, the bot generates a random number between <strong>{minDelay}s</strong> and <strong>{maxDelay}s</strong>. This prevents WhatsApp's detection models from detecting robotic periodic pulses.
                </p>
              </div>
            </div>

            {/* Batching Settings */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">
                  <span className="ico">📦</span> Batch-Wise Dispatch
                </div>
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>
                Split large recipient lists into small batches with mandatory resting periods between each batch.
              </p>

              <div className="field">
                <div className="spread">
                  <label className="label">Batch Size (Contacts per batch)</label>
                  <span className="badge badge-violet">{batchSize} contacts</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--violet)' }}
                />
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="500"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                />
                <span className="small faint">Recommended: 15–30 contacts per batch.</span>
              </div>

              <div className="field">
                <div className="spread">
                  <label className="label">Rest Period between Batches</label>
                  <span className="badge badge-violet">{batchDelayMinutes} minutes</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={batchDelayMinutes}
                  onChange={(e) => setBatchDelayMinutes(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--violet)' }}
                />
                <input
                  type="number"
                  className="input"
                  min="0"
                  max="120"
                  value={batchDelayMinutes}
                  onChange={(e) => setBatchDelayMinutes(Number(e.target.value))}
                />
                <span className="small faint">Recommended: 5–15 minutes rest. Set to 0 to disable resting.</span>
              </div>
            </div>
          </div>

          {/* Interactive Calculator */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="ico">🧮</span> Broadcast Safety Simulator
              </div>
              <span className={`badge ${isSafeRating ? 'badge-ok' : isModerateRating ? 'badge-warn' : 'badge-danger'}`}>
                {isSafeRating ? '🟢 High Safety' : isModerateRating ? '🟡 Moderate Safety' : '🔴 High Ban Risk'}
              </span>
            </div>
            <p className="small muted" style={{ marginTop: 0 }}>
              Test how your settings perform with large contact lists:
            </p>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <span className="small">If I broadcast to:</span>
              <input
                type="number"
                className="input"
                style={{ width: 140 }}
                value={simContacts}
                onChange={(e) => setSimContacts(Math.max(1, Number(e.target.value)))}
              />
              <span className="small">contacts:</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                padding: 14,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--panel-border)',
              }}
            >
              <div>
                <span className="small faint">Total Batches:</span>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--violet-2)' }}>
                  {totalBatches} batches
                </div>
                <span className="small faint">{batchSize} contacts per batch</span>
              </div>

              <div>
                <span className="small faint">Total Rest Pauses:</span>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--cyan)' }}>
                  {totalBatchPauses} pauses
                </div>
                <span className="small faint">{batchDelayMinutes} min rest each</span>
              </div>

              <div>
                <span className="small faint">Est. Total Duration:</span>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
                  {estHours > 0 ? `${estHours}h ` : ''}{estMinutes}m
                </div>
                <span className="small faint">Paced over time</span>
              </div>

              <div>
                <span className="small faint">Anti-Ban Verdict:</span>
                <div style={{ fontSize: 15, fontWeight: 600, color: isSafeRating ? 'var(--ok)' : isModerateRating ? 'var(--warn)' : 'var(--danger)' }}>
                  {isSafeRating ? 'Safe Pacing' : isModerateRating ? 'Acceptable' : 'Too Aggressive'}
                </div>
                <span className="small faint">
                  {isSafeRating ? 'Low risk of report bans' : isModerateRating ? 'Keep eye on number' : 'Increase delays'}
                </span>
              </div>
            </div>
          </div>

          {/* Auto Reply Setting */}
          <div className="card">
            <div className="spread">
              <div>
                <div className="card-title">
                  <span className="ico">🤖</span> Keyword Auto-Reply
                </div>
                <p className="small muted" style={{ margin: '4px 0 0' }}>
                  Enable automatic replies to 1:1 incoming messages based on your keyword list.
                </p>
              </div>
              <button
                type="button"
                className={`switch ${autoReply ? 'on' : ''}`}
                onClick={() => setAutoReply((a) => !a)}
                aria-pressed={autoReply}
              />
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadSettings}
              disabled={saving}
            >
              Reset to Saved
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ minWidth: 160 }}
            >
              {saving ? <span className="spinner" /> : '💾'} {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
