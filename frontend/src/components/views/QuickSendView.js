'use client';

import { useApp } from '@/context/AppContext';
import QuickSendCard from '@/components/QuickSendCard';

export default function QuickSendView() {
  const { status, notify } = useApp();
  return (
    <div className="view">
      <div className="view-head">
        <h2>One-Tap Quick Send</h2>
        <p className="muted">Fire off a text, video/image or native voice note to any number instantly.</p>
      </div>
      <div className="view-grid narrow">
        <QuickSendCard status={status} notify={notify} />
      </div>
    </div>
  );
}
