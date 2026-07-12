'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import SendModal from '@/components/SendModal';
import ImportContactsModal from '@/components/ImportContactsModal';

export default function ContactsView() {
  const {
    contacts, contactsLoading, loadContacts, groupedContacts,
    selectedIds, selectedContacts, toggleContact, setManySelected, clearSelection,
    ready, notify, setActiveView,
  } = useApp();

  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [target, setTarget] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  // Apply the group dropdown + search filters, then drop empty groups.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c) =>
      !q ||
      [c.phone_number, c.name, c.pushname, c.about_text, c.group_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    return groupedContacts
      .filter((g) => groupFilter === 'all' || (g.groupId || '__none__') === groupFilter)
      .map((g) => ({ ...g, items: g.items.filter(match) }))
      .filter((g) => g.items.length > 0);
  }, [groupedContacts, query, groupFilter]);

  const visibleCount = filteredGroups.reduce((n, g) => n + g.items.length, 0);

  async function exportExcel() {
    const list = selectedContacts.length ? selectedContacts : contacts;
    if (!list.length) return notify('No contacts to export.', 'error');
    setExporting(true);
    try {
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
      list.forEach((c) => ws.addRow(c));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      notify(`Exported ${list.length} contact${list.length === 1 ? '' : 's'} to Excel.`, 'ok');
    } catch (e) {
      notify(`Export failed: ${e.message}`, 'error');
    } finally {
      setExporting(false);
    }
  }

  async function deleteOne(id) {
    try {
      await api.deleteContact(id);
      await loadContacts();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected contact${ids.length === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    try {
      await api.deleteContacts(ids);
      clearSelection();
      await loadContacts();
      notify(`Deleted ${ids.length} contacts.`, 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function clearGroup(g) {
    if (!confirm(`Clear all contacts from "${g.groupName}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.clearContacts(g.groupId);
      await loadContacts();
      notify(`Cleared "${g.groupName}".`, 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!contacts.length) return;
    if (!confirm(`Delete ALL ${contacts.length} saved contacts? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.clearContacts();
      clearSelection();
      await loadContacts();
      notify('All contacts cleared.', 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const toggleGroup = (g, on) => setManySelected(g.items.map((c) => c.id), on);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2>Saved Contacts <span className="badge badge-green">{contacts.length}</span></h2>
          <p className="muted">Grouped by source group. Filter, select, import or export — custom groups work everywhere too.</p>
        </div>
        <div className="row" style={{ flex: 'none' }}>
          <button className="btn btn-sm" onClick={loadContacts} disabled={contactsLoading}>
            {contactsLoading ? <span className="spinner" /> : '⟳'} Refresh
          </button>
          <button className="btn btn-sm btn-violet" onClick={() => setShowImport(true)}>➕ Add / Import</button>
          <button className="btn btn-primary btn-sm" onClick={exportExcel} disabled={exporting || !contacts.length}>
            {exporting ? <span className="spinner" /> : '⬇'} Export {selectedContacts.length ? `Selected (${selectedContacts.length})` : 'All'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={clearAll} disabled={busy || !contacts.length}>🗑 Clear all</button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <input
            className="input"
            style={{ flex: 3 }}
            placeholder="🔍  Search by number, name, status or group…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="select"
            style={{ flex: 2 }}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">All groups ({groupedContacts.length})</option>
            {groupedContacts.map((g) => (
              <option key={g.groupId || '__none__'} value={g.groupId || '__none__'}>
                {g.groupName} ({g.items.length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span><b>{selectedIds.size}</b> selected</span>
          <div className="row" style={{ flex: 'none' }}>
            <button className="btn btn-sm btn-violet" onClick={() => setActiveView('broadcast')}>📢 Broadcast to selected</button>
            <button className="btn btn-sm btn-danger" onClick={deleteSelected} disabled={busy}>✕ Delete selected</button>
            <button className="btn btn-sm btn-ghost" onClick={clearSelection}>Clear selection</button>
          </div>
        </div>
      )}

      {visibleCount === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="big">📭</div>
            {contacts.length === 0
              ? 'No contacts yet. Extract a group, or use “Add / Import” to enter them manually.'
              : 'No contacts match your filters.'}
          </div>
        </div>
      ) : (
        filteredGroups.map((g) => {
          const groupIds = g.items.map((c) => c.id);
          const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
          const allSelected = selectedInGroup === groupIds.length;
          const isCustom = String(g.groupId || '').startsWith('custom:');
          return (
            <div className="card group-card" key={g.groupId || '__none__'}>
              <div className="group-head">
                <label className="check-label">
                  <input
                    type="checkbox"
                    className="check"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = selectedInGroup > 0 && !allSelected; }}
                    onChange={(e) => toggleGroup(g, e.target.checked)}
                  />
                  <span className="group-name">{g.groupName}</span>
                  {isCustom && <span className="badge badge-violet">custom</span>}
                </label>
                <div className="group-meta">
                  <span className="badge">{g.items.length} contacts</span>
                  {selectedInGroup > 0 && <span className="badge badge-violet">{selectedInGroup} selected</span>}
                  <button className="btn btn-sm btn-danger" onClick={() => clearGroup(g)} disabled={busy}>Clear group</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Number</th>
                      <th>Saved Name</th>
                      <th>Public Name</th>
                      <th>About</th>
                      <th>Group</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((c) => (
                      <tr key={c.id} className={selectedIds.has(c.id) ? 'row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            className="check"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleContact(c.id)}
                          />
                        </td>
                        <td className="cell-mono">+{c.phone_number}</td>
                        <td>{c.name || <span className="faint">—</span>}</td>
                        <td className="cell-dim">{c.pushname || <span className="faint">—</span>}</td>
                        <td className="cell-dim" style={{ maxWidth: 220 }}>{c.about_text || <span className="faint">—</span>}</td>
                        <td><span className="badge">{c.group_name || '—'}</span></td>
                        <td>
                          <div className="cell-actions">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => setTarget(c)}
                              disabled={!ready}
                              title={ready ? 'Quick send' : 'Connect WhatsApp first'}
                            >⚡ Send</button>
                            <button className="btn btn-sm btn-icon btn-danger" onClick={() => deleteOne(c.id)} title="Delete">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      <SendModal contact={target} disabled={!ready} notify={notify} onClose={() => setTarget(null)} />
      {showImport && (
        <ImportContactsModal onClose={() => setShowImport(false)} onDone={loadContacts} notify={notify} />
      )}
    </div>
  );
}
