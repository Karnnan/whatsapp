'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

let toastSeq = 0;

export function AppProvider({ children }) {
  // Connection
  const [status, setStatus] = useState('INITIALIZING');
  const [qr, setQr] = useState(null);
  const [me, setMe] = useState(null);
  const [online, setOnline] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  // UX
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [activeView, setActiveView] = useState('connection');

  // Data
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const notify = useCallback((message, type = 'info') => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { contacts } = await api.getContacts();
      setContacts(contacts);
      // Drop selections for contacts that no longer exist.
      setSelectedIds((prev) => {
        const ids = new Set(contacts.map((c) => c.id));
        const next = new Set();
        prev.forEach((id) => { if (ids.has(id)) next.add(id); });
        return next;
      });
    } catch (_) {
      // Silent — surfaced elsewhere; avoids toast spam if the DB isn't ready.
    } finally {
      setContactsLoading(false);
    }
  }, []);

  // ---- Selection helpers -------------------------------------------------
  const toggleContact = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setManySelected = useCallback((ids, on) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Contacts grouped by their source WhatsApp group.
  const groupedContacts = useMemo(() => {
    const map = new Map();
    for (const c of contacts) {
      const key = c.group_id || '__none__';
      if (!map.has(key)) {
        map.set(key, { groupId: c.group_id, groupName: c.group_name || 'Ungrouped', items: [] });
      }
      map.get(key).items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [contacts]);

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );

  // ---- Socket lifecycle --------------------------------------------------
  const readyRef = useRef(false);
  const socketStatusRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    setOnline(socket.connected);

    const applyStatus = (s) => {
      setStatus(s.status);
      setMe(s.me);
      if (typeof s.extracting === 'boolean') setExtracting(s.extracting);
      if (typeof s.broadcasting === 'boolean') setBroadcasting(s.broadcasting);
      if (s.qr) setQr(s.qr);
      if (s.status === 'READY' && !readyRef.current) {
        readyRef.current = true;
        loadContacts();
      }
      if (s.status !== 'READY') readyRef.current = false;
    };

    const onConnect = () => setOnline(true);
    const onDisconnect = () => {
      setOnline(false);
      // Force loadContacts to re-run when the session returns to READY after a
      // socket blip (the server re-emits READY without an intervening state).
      readyRef.current = false;
    };
    const onStatus = (s) => { socketStatusRef.current = true; applyStatus(s); };
    const onQr = (dataUrl) => setQr(dataUrl);
    const onLog = (entry) => setLogs((l) => [...l.slice(-249), entry]);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('status', onStatus);
    socket.on('qr', onQr);
    socket.on('log', onLog);

    api.getStatus()
      .then((s) => {
        if (socketStatusRef.current) return;
        applyStatus(s);
      })
      .catch(() => {});

    loadContacts();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('status', onStatus);
      socket.off('qr', onQr);
      socket.off('log', onLog);
    };
  }, [loadContacts]);

  const value = {
    // connection
    status, qr, me, online, extracting, broadcasting, ready: status === 'READY',
    // ux
    logs, toasts, notify, dismissToast, activeView, setActiveView,
    // data
    contacts, contactsLoading, loadContacts, groupedContacts,
    selectedIds, selectedContacts, toggleContact, setManySelected, clearSelection,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
