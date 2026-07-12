'use client';

import { useEffect, useRef } from 'react';

export default function LogConsole({ logs }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div className="card col-span-2">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">📡</span> Live Activity
        </div>
        <span className="badge">{logs.length} events</span>
      </div>
      <div className="console" ref={ref}>
        {logs.length === 0 ? (
          <div className="faint">Waiting for activity…</div>
        ) : (
          logs.map((l, i) => (
            <div className={`log-line log-${l.level || 'info'}`} key={i}>
              <span className="log-time">{formatTime(l.time)}</span>
              <span className="log-msg">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false });
  } catch (_) {
    return '';
  }
}
