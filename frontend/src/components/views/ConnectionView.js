'use client';

import { useApp } from '@/context/AppContext';
import ConnectionCard from '@/components/ConnectionCard';
import LogConsole from '@/components/LogConsole';

export default function ConnectionView() {
  const { status, qr, me, notify, logs } = useApp();
  return (
    <div className="view">
      <div className="view-head">
        <h2>Connection</h2>
        <p className="muted">Link your WhatsApp account by scanning the QR code, and watch live activity.</p>
      </div>
      <div className="view-grid two">
        <ConnectionCard status={status} qr={qr} me={me} notify={notify} />
        <LogConsole logs={logs} />
      </div>
    </div>
  );
}
