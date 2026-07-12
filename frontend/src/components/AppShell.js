'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import Header from './Header';
import Sidebar from './Sidebar';
import ToastStack from './ToastStack';
import ConnectionView from './views/ConnectionView';
import ExtractionView from './views/ExtractionView';
import ContactsView from './views/ContactsView';
import BroadcastView from './views/BroadcastView';
import QuickSendView from './views/QuickSendView';
import KeywordsView from './views/KeywordsView';
import InboxView from './views/InboxView';
import OutboxView from './views/OutboxView';

const VIEWS = {
  connection: ConnectionView,
  extraction: ExtractionView,
  contacts: ContactsView,
  inbox: InboxView,
  outbox: OutboxView,
  broadcast: BroadcastView,
  quicksend: QuickSendView,
  keywords: KeywordsView,
};

export default function AppShell() {
  const { activeView } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const View = VIEWS[activeView] || ConnectionView;

  return (
    <div className="layout">
      <Header onBurger={() => setDrawerOpen((o) => !o)} />
      <div className="layout-body">
        <Sidebar open={drawerOpen} onNavigate={() => setDrawerOpen(false)} />
        {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />}
        <main className="view-area">
          <View />
        </main>
      </div>
      <ToastStack />
    </div>
  );
}
