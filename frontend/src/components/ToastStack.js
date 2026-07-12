'use client';

import { useApp } from '@/context/AppContext';

export default function ToastStack() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type === 'ok' ? 'ok' : t.type === 'error' ? 'error' : 'info'}`}
          onClick={() => dismissToast(t.id)}
          role="status"
        >
          <span>{t.type === 'ok' ? '✅' : t.type === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
