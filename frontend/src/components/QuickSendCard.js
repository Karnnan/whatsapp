'use client';

import SendComposer from './SendComposer';

export default function QuickSendCard({ status, notify }) {
  const ready = status === 'READY';
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">⚡</span> One-Tap Quick Send
        </div>
      </div>
      <p className="card-sub">Fire off a text, video/image or native voice note to any number instantly.</p>
      <SendComposer disabled={!ready} notify={notify} />
    </div>
  );
}
