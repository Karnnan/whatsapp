'use client';

import { AppProvider } from '@/context/AppContext';
import AppShell from '@/components/AppShell';

export default function Home() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
