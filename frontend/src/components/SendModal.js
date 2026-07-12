'use client';

import SendComposer from './SendComposer';

export default function SendModal({ contact, disabled, notify, onClose }) {
  if (!contact) return null;
  const label = contact.name || contact.pushname || `+${contact.phone_number}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>
              <span className="ico">⚡</span> Quick Send
            </div>
            <div className="small muted">
              To <b>{label}</b> · <span className="cell-mono">+{contact.phone_number}</span>
            </div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <SendComposer
          number={contact.phone_number}
          disabled={disabled}
          notify={notify}
          onSent={onClose}
          compact
        />
      </div>
    </div>
  );
}
