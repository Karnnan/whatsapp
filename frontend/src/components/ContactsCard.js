'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import SendModal from './SendModal';

export default function ContactsCard({ contacts, loading, ready, notify, onRefresh }) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null); // contact for the send modal
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.phone_number, c.name, c.pushname, c.about_text, c.group_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [contacts, query]);

  async function exportExcel() {
    if (!contacts.length) return notify?.('No contacts to export.', 'error');
    setExporting(true);
    try {
      // exceljs is heavy; load it only when needed.
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'WhatsApp Control';
      const ws = wb.addWorksheet('Contacts');
      ws.columns = [
        { header: 'Phone Number', key: 'phone_number', width: 20 },
        { header: 'Saved Name', key: 'name', width: 24 },
        { header: 'Public Name', key: 'pushname', width: 24 },
        { header: 'About / Status', key: 'about_text', width: 40 },
        { header: 'Group', key: 'group_name', width: 26 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF25D366' } };
      contacts.forEach((c) => ws.addRow(c));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify?.(`Exported ${contacts.length} contacts to Excel.`, 'ok');
    } catch (e) {
      notify?.(`Export failed: ${e.message}`, 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteContact(id);
      onRefresh?.();
    } catch (e) {
      notify?.(e.message, 'error');
    }
  }

  async function handleClear() {
    if (!contacts.length) return;
    if (!confirm(`Delete all ${contacts.length} saved contacts? This cannot be undone.`)) return;
    try {
      await api.clearContacts();
      notify?.('All contacts cleared.', 'info');
      onRefresh?.();
    } catch (e) {
      notify?.(e.message, 'error');
    }
  }

  return (
    <div className="card col-span-2">
      <div className="card-head">
        <div className="card-title">
          <span className="ico">📇</span> Saved Contacts
          <span className="badge badge-green" style={{ marginLeft: 6 }}>{contacts.length}</span>
        </div>
        <div className="row" style={{ flex: 'none' }}>
          <button className="btn btn-sm" onClick={onRefresh} disabled={loading}>
            {loading ? <span className="spinner" /> : '⟳'} Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={exportExcel} disabled={exporting || !contacts.length}>
            {exporting ? <span className="spinner" /> : '⬇'} Export Excel
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={!contacts.length}>
            🗑 Clear
          </button>
        </div>
      </div>

      <div className="field">
        <input
          className="input"
          placeholder="🔍  Search by number, name, status or group…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="big">📭</div>
          {contacts.length === 0
            ? 'No contacts yet. Extract a group above to populate this table.'
            : 'No contacts match your search.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Saved Name</th>
                <th>Public Name</th>
                <th>About</th>
                <th>Group</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="cell-mono">+{c.phone_number}</td>
                  <td>{c.name || <span className="faint">—</span>}</td>
                  <td className="cell-dim">{c.pushname || <span className="faint">—</span>}</td>
                  <td className="cell-dim" style={{ maxWidth: 240 }}>
                    {c.about_text || <span className="faint">—</span>}
                  </td>
                  <td><span className="badge">{c.group_name || '—'}</span></td>
                  <td>
                    <div className="cell-actions">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setTarget(c)}
                        disabled={!ready}
                        title={ready ? 'Quick send' : 'Connect WhatsApp first'}
                      >
                        ⚡ Send
                      </button>
                      <button className="btn btn-sm btn-icon btn-danger" onClick={() => handleDelete(c.id)} title="Delete">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SendModal contact={target} disabled={!ready} notify={notify} onClose={() => setTarget(null)} />
    </div>
  );
}
