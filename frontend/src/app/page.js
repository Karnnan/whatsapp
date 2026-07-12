'use client';

import { useEffect, useState } from 'react';
import { AppProvider } from '@/context/AppContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { getToken, clearAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
    setChecked(true);
  }, []);

  function handleLogout() {
    api.authLogout();
    clearAuth();
    setAuthed(false);
  }

  if (!checked) return null; // avoid a login/dashboard flash before we read the token
  if (!authed) return <LoginPage onAuthed={() => setAuthed(true)} />;

  return (
    <AppProvider>
      <AppShell onLogout={handleLogout} />
    </AppProvider>
  );
}
