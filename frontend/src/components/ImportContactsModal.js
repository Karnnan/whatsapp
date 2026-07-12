'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

const HEADERS = ['Phone Number', 'Saved Name', 'Public Name', 'About / Status', 'Group'];

export default function ImportContactsModal({ onClose, onDone, notify }) {
  const [tab, setTab] = useState('manual'); // manual | excel
  const [groupName, setGroupName] = useState('');
  const [rows, setRows] = useState([{ phone: '', name: '' }]);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);

  const updateRow = (i, key, val) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const addRow = () => setRows((r) => [...r, { phone: '', name: '' }]);
  const removeRow = (i) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  async function downloadTemplate() {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Contacts');
      ws.columns = HEADERS.map((h) => ({ header: h, key: h, width: 24 }));
      ws.getRow(1).font = { bold: true };
      ws.addRow(['14155552671', 'Jane Doe', 'Jane', 'Available', 'VIP Customers']);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whatsapp-contacts-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      notify(`Template failed: ${e.message}`, 'error');
    }
  }

  async function handleFile(f) {
    setFile(f);
    setParsed(null);
    if (!f) return;
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('No worksheet found.');

      // Map columns by header text (order-independent, extra columns ignored).
      const idx = { phone: null, name: null, pushname: null, about: null, group: null };
      ws.getRow(1).eachCell((cell, col) => {
        const h = String(cellText(cell.value) || '').toLowerCase();
        if (!idx.phone && /(phone|number|mobile|msisdn|contact)/.test(h)) idx.phone = col;
        else if (!idx.pushname && /(public|push)/.test(h)) idx.pushname = col;
        else if (!idx.name && /name/.test(h)) idx.name = col;
        else if (!idx.about && /(about|status)/.test(h)) idx.about = col;
        else if (!idx.group && /group/.test(h)) idx.group = col;
      });
      if (!idx.phone) idx.phone = 1; // fall back to first column

      const contacts = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const cell = (c) => (c ? row.getCell(c).value : null);
        const phone = String(cellText(cell(idx.phone)) || '').replace(/\D/g, '');
        if (!phone) return;
        contacts.push({
          phone_number: phone,
          name: cellText(cell(idx.name)),
          pushname: cellText(cell(idx.pushname)),
          about_text: cellText(cell(idx.about)),
          group_name: cellText(cell(idx.group)) || null,
        });
      });

      setParsed(contacts);
      if (!contacts.length) notify('No rows with a valid phone number were found.', 'error');
    } catch (e) {
      notify(`Could not read file: ${e.message}`, 'error');
    }
  }

  async function submit() {
    let contacts = [];
    if (tab === 'manual') {
      contacts = rows
        .map((r) => ({ phone_number: r.phone.replace(/\D/g, ''), name: r.name.trim() || null }))
        .filter((r) => r.phone_number);
      if (!contacts.length) return notify('Add at least one valid phone number.', 'error');
    } else {
      if (!parsed || !parsed.length) return notify('Choose an Excel file with contacts first.', 'error');
      contacts = parsed;
    }

    setBusy(true);
    try {
      const res = await api.addContacts({ groupName: groupName.trim() || undefined, contacts });
      notify(`Added ${res.added} contact${res.added === 1 ? '' : 's'}${res.skipped ? ` · ${res.skipped} skipped` : ''}.`, 'ok');
      onDone?.();
      onClose?.();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div className="card-title"><span className="ico">➕</span> Add / Import Contacts</div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="seg" style={{ marginBottom: 16 }}>
          <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')} type="button">✍️ Manual</button>
          <button className={tab === 'excel' ? 'active' : ''} onClick={() => setTab('excel')} type="button">📄 Import Excel</button>
        </div>

        <div className="field">
          <label className="label">
            Group name{tab === 'excel' ? ' — fallback when a row has no Group column' : ''}
          </label>
          <input
            className="input"
            placeholder="e.g. VIP Customers"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        </div>

        {tab === 'manual' ? (
          <div className="stack">
            {rows.map((r, i) => (
              <div className="row" key={i} style={{ gap: 8 }}>
                <input className="input" placeholder="Phone (country code, no +)" value={r.phone} onChange={(e) => updateRow(i, 'phone', e.target.value)} style={{ flex: 2 }} />
                <input className="input" placeholder="Name (optional)" value={r.name} onChange={(e) => updateRow(i, 'name', e.target.value)} style={{ flex: 2 }} />
                <button className="btn btn-icon btn-danger" onClick={() => removeRow(i)} style={{ flex: 'none' }} type="button" aria-label="Remove row">✕</button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={addRow} type="button">+ Add row</button>
          </div>
        ) : (
          <div className="stack">
            <label className="file-drop">
              <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFile(e.target.files[0] || null)} />
              <span style={{ fontSize: 18 }}>📄</span>
              <span className={file ? 'file-name' : ''}>{file ? file.name : 'Choose an .xlsx file'}</span>
            </label>
            {parsed && <p className="small muted" style={{ margin: 0 }}>Detected <b>{parsed.length}</b> contact{parsed.length === 1 ? '' : 's'} ready to import.</p>}
            <button className="btn btn-sm btn-ghost" onClick={downloadTemplate} type="button">⬇ Download template</button>
          </div>
        )}

        <button className="btn btn-primary btn-block mt-3" onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : '✓'} {tab === 'manual' ? 'Add contacts' : 'Import contacts'}
        </button>
      </div>
    </div>
  );
}

// Normalize an ExcelJS cell value (string, number, hyperlink object, rich text,
// or formula result) to a trimmed string or null.
function cellText(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text).trim() || null;
    if (v.result != null) return String(v.result).trim() || null;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim() || null;
    if (v.hyperlink) return String(v.hyperlink).trim() || null;
    return null;
  }
  const s = String(v).trim();
  return s || null;
}
