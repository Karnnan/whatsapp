'use client';

import { useApp } from '@/context/AppContext';
import KeywordsCard from '@/components/KeywordsCard';

export default function KeywordsView() {
  const { notify } = useApp();
  return (
    <div className="view">
      <div className="view-head">
        <h2>Auto-Reply</h2>
        <p className="muted">Reply automatically to incoming direct messages that match your keywords.</p>
      </div>
      <div className="view-grid">
        <KeywordsCard notify={notify} />
      </div>
    </div>
  );
}
