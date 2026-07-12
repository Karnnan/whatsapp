'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import ConnectionCard from '@/components/ConnectionCard';
import GroupsCard from '@/components/GroupsCard';
import ContactsCard from '@/components/ContactsCard';
import QuickSendCard from '@/components/QuickSendCard';
import BroadcastCard from '@/components/BroadcastCard';
import KeywordsCard from '@/components/KeywordsCard';
import LogConsole from '@/components/LogConsole';

let toastSeq = 0;

export default function Dashboard() {
  const [status, setStatus] = useState('INITIALIZING');
  const [qr, setQr] = useState(null);
  const [me, setMe] = useState(null);
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [online, setOnline] = useState(false);

  const notify = useCallback((message, type = 'info') => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { contacts } = await api.getContacts();
      setContacts(contacts);
    } catch (e) {
      // Surface only once — avoids toast spam if DB isn't configured yet.
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const readyRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));

    socket.on('status', (s) => {
      setStatus(s.status);
      setMe(s.me);
      if (s.qr) setQr(s.qr);
      if (s.status === 'READY' && !readyRef.current) {
        readyRef.current = true;
        loadContacts();
      }
      if (s.status !== 'READY') readyRef.current = s.status === 'READY';
    });
    socket.on('qr', (dataUrl) => setQr(dataUrl));
    socket.on('log', (entry) => setLogs((l) => [...l.slice(-199), entry]));

    // Prime initial state via REST in case we connect after events fired.
    api.getStatus()
      .then((s) => {
        setStatus(s.status);
        setMe(s.me);
        if (s.qr) setQr(s.qr);
        if (s.status === 'READY') { readyRef.current = true; loadContacts(); }
      })
      .catch(() => {});

    loadContacts();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('status');
      socket.off('qr');
      socket.off('log');
    };
  }, [loadContacts]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">🟢</div>
          <div className="brand-text">
            <h1>WhatsApp Control</h1>
            <p>Extraction · Broadcast · Auto-reply command center</p>
          </div>
        </div>
        <span className={`status-pill ${online ? 'status-ready' : 'status-off'}`}>
          <span className={`dot ${online ? 'pulse' : ''}`} />
          {online ? 'Backend connected' : 'Backend offline'}
        </span>
      </header>

      <div className="grid">
        <ConnectionCard status={status} qr={qr} me={me} notify={notify} />
        <GroupsCard status={status} notify={notify} onExtracted={loadContacts} />

        <QuickSendCard status={status} notify={notify} />
        <BroadcastCard status={status} notify={notify} contactsCount={contacts.length} />

        <ContactsCard
          contacts={contacts}
          loading={contactsLoading}
          ready={status === 'READY'}
          notify={notify}
          onRefresh={loadContacts}
        />

        <KeywordsCard notify={notify} />

        <LogConsole logs={logs} />
      </div>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type === 'ok' ? 'ok' : t.type === 'error' ? 'error' : 'info'}`}>
            <span>{t.type === 'ok' ? '✅' : t.type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
