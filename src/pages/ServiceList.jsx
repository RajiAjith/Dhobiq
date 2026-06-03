import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_SERVICES } from '../utils/constants';
import { sortServices } from '../utils/serviceHelpers';
import { Edit, Trash2, Plus, Check, X, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

export default function ServiceList() {
  const [services,       setServices]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  // Add form state
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newName,     setNewName]       = useState('');
  const [newPrice,    setNewPrice]      = useState('');
  const [newOrder,    setNewOrder]      = useState('');

  // Edit state
  const [editId,    setEditId]    = useState(null);
  const [editName,  setEditName]  = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editOrder, setEditOrder] = useState('');

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    if (!navigator.onLine) { setIsOfflineError(true); setLoading(false); return; }
    setLoading(true);
    setIsOfflineError(false);
    try {
      const snapshot = await getDocs(collection(db, 'services'));
      const data = [];
      snapshot.forEach(d => data.push({ id: d.id, ...d.data() }));
      setServices(sortServices(data));
      clearWasOffline();
    } catch (err) {
      console.error('Error fetching services:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setLoading(false);
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchServices(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOnline && wasOffline) fetchServices(); }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seed defaults ──────────────────────────────────────────────────────────
  const handleSeedDefaults = async () => {
    if (!window.confirm('Import default services (Bedsheet, Shirt, etc.)?')) return;
    setSaving(true);
    try {
      const promises = FALLBACK_SERVICES.map(svc =>
        addDoc(collection(db, 'services'), {
          name:         svc.name,
          defaultPrice: svc.defaultPrice,
          sort_order:   svc.sort_order ?? null,
        })
      );
      await Promise.all(promises);
      await fetchServices();
    } catch (err) {
      console.error('Error seeding services:', err);
      reportError(err);
      alert('Failed to import defaults');
    }
    setSaving(false);
  };

  // ── Add ────────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim() || newPrice === '') return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'services'), {
        name:         newName.trim(),
        defaultPrice: Number(newPrice),
        sort_order:   newOrder !== '' ? Number(newOrder) : null,
      });
      setNewName(''); setNewPrice(''); setNewOrder('');
      setShowAddForm(false);
      await fetchServices();
    } catch (err) {
      console.error('Error adding service:', err);
      reportError(err);
      alert('Failed to add service');
    }
    setSaving(false);
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const startEdit = (svc) => {
    setEditId(svc.id);
    setEditName(svc.name);
    setEditPrice(svc.defaultPrice);
    setEditOrder(svc.sort_order != null ? svc.sort_order : '');
    setDeleteId(null);
  };

  const cancelEdit = () => { setEditId(null); setEditName(''); setEditPrice(''); setEditOrder(''); };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editName.trim() || editPrice === '') return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'services', editId), {
        name:         editName.trim(),
        defaultPrice: Number(editPrice),
        sort_order:   editOrder !== '' ? Number(editOrder) : null,
      });
      cancelEdit();
      await fetchServices();
    } catch (err) {
      console.error('Error updating service:', err);
      reportError(err);
      alert('Failed to update service');
    }
    setSaving(false);
  };

  // ── Quick reorder helpers ──────────────────────────────────────────────────
  const moveService = async (idx, direction) => {
    const newServices = [...services];
    const swapIdx     = idx + direction;
    if (swapIdx < 0 || swapIdx >= newServices.length) return;

    setSaving(true);
    try {
      const aOrder = newServices[idx].sort_order    != null ? newServices[idx].sort_order    : idx + 1;
      const bOrder = newServices[swapIdx].sort_order != null ? newServices[swapIdx].sort_order : swapIdx + 1;

      await Promise.all([
        updateDoc(doc(db, 'services', newServices[idx].id),    { sort_order: bOrder }),
        updateDoc(doc(db, 'services', newServices[swapIdx].id), { sort_order: aOrder }),
      ]);
      await fetchServices();
    } catch (err) {
      console.error('Error reordering service:', err);
      reportError(err);
    }
    setSaving(false);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'services', id));
      setDeleteId(null);
      await fetchServices();
    } catch (err) {
      console.error('Error deleting service:', err);
      reportError(err);
      alert('Failed to delete service');
    }
    setSaving(false);
  };

  if (!loading && isOfflineError) return <OfflineScreen onRetry={fetchServices} />;

  return (
    <div>
      {/* Page Header */}
      <div className="flex-between mb-2">
        <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Services</h2>
        {!showAddForm && (
          <button
            className="btn btn-primary"
            onClick={() => { setShowAddForm(true); setEditId(null); setDeleteId(null); }}
          >
            <Plus size={16} /> Add Service
          </button>
        )}
      </div>

      {/* Add Service Form */}
      {showAddForm && (
        <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ color: 'var(--primary)', fontSize: '1rem', marginBottom: '12px' }}>New Service</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="svc-name">Service Name</label>
                <input
                  id="svc-name" type="text" className="form-control"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Saree" required autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="svc-price">Default Price (₹)</label>
                <input
                  id="svc-price" type="number" min="0" step="0.01"
                  className="form-control" value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  placeholder="e.g. 50" inputMode="decimal" required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="svc-order">Sort Order <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  id="svc-order" type="number" min="1" step="1"
                  className="form-control" value={newOrder}
                  onChange={e => setNewOrder(e.target.value)}
                  placeholder="e.g. 1"
                />
              </div>
            </div>
            <div className="action-row">
              <button type="submit" disabled={saving} className="btn btn-primary">
                <Check size={16} /> {saving ? 'Saving...' : 'Save Service'}
              </button>
              <button
                type="button" className="btn btn-secondary"
                onClick={() => { setShowAddForm(false); setNewName(''); setNewPrice(''); setNewOrder(''); }}
              >
                <X size={16} /> Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Services Table */}
      <div className="card">
        {loading ? (
          <div className="loading-pulse">
            <div className="loading-pulse__bar" />
            <div className="loading-pulse__bar" style={{ width: '70%' }} />
            <div className="loading-pulse__bar" style={{ width: '50%' }} />
          </div>
        ) : services.length === 0 ? (
          <div className="text-center" style={{ padding: '32px 16px' }}>
            <p className="text-muted" style={{ marginBottom: '16px' }}>
              No services found. Start by adding a service or import our standard laundry defaults.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              {!showAddForm && (
                <button className="btn btn-primary w-100" style={{ maxWidth: '250px' }} onClick={() => setShowAddForm(true)}>
                  <Plus size={18} /> Add First Service
                </button>
              )}
              <button
                className="btn btn-secondary w-100" style={{ maxWidth: '250px' }}
                onClick={handleSeedDefaults} disabled={saving}
              >
                <Download size={18} /> {saving ? 'Importing...' : 'Import Default Services'}
              </button>
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>Order</th>
                  <th>Service Name</th>
                  <th>Default Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc, idx) => (
                  <React.Fragment key={svc.id}>
                    <tr>
                      {/* Sort order + up/down buttons */}
                      <td data-label="Order">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--text-light)', fontSize: '0.82rem', minWidth: '18px' }}>
                            {svc.sort_order != null ? svc.sort_order : '—'}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              className="btn-icon" style={{ padding: '2px', minWidth: 'unset', minHeight: 'unset' }}
                              onClick={() => moveService(idx, -1)} disabled={saving || idx === 0}
                              title="Move up"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              className="btn-icon" style={{ padding: '2px', minWidth: 'unset', minHeight: 'unset' }}
                              onClick={() => moveService(idx, 1)} disabled={saving || idx === services.length - 1}
                              title="Move down"
                            >
                              <ArrowDown size={12} />
                            </button>
                          </div>
                        </div>
                      </td>

                      {editId === svc.id ? (
                        <>
                          <td data-label="Service Name">
                            <input type="text" className="form-control" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                          </td>
                          <td data-label="Default Price">
                            <input type="number" min="0" step="0.01" className="form-control" value={editPrice} onChange={e => setEditPrice(e.target.value)} inputMode="decimal" />
                          </td>
                          <td data-label="Actions" style={{ minWidth: '180px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <input
                                  type="number" min="1" step="1"
                                  className="form-control" style={{ maxWidth: '80px' }}
                                  value={editOrder} onChange={e => setEditOrder(e.target.value)}
                                  placeholder="Order"
                                />
                              </div>
                              <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem' }} onClick={handleUpdate} disabled={saving} title="Save">
                                <Check size={15} />
                              </button>
                              <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }} onClick={cancelEdit} title="Cancel">
                                <X size={15} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td data-label="Service Name" style={{ fontWeight: 500 }}>{svc.name}</td>
                          <td data-label="Default Price" style={{ whiteSpace: 'nowrap' }}>₹{Number(svc.defaultPrice).toFixed(2)}</td>
                          <td data-label="Actions">
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn-icon edit" title="Edit" onClick={() => startEdit(svc)}>
                                <Edit size={18} />
                              </button>
                              <button
                                className="btn-icon delete" title="Delete"
                                style={{ color: deleteId === svc.id ? 'var(--danger)' : undefined }}
                                onClick={() => setDeleteId(deleteId === svc.id ? null : svc.id)}
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>

                    {/* Delete Confirm Row */}
                    {deleteId === svc.id && (
                      <tr style={{ background: '#fff5f5' }}>
                        <td colSpan={4}>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '4px 0' }}>
                            <span style={{ fontSize: '0.88rem', color: 'var(--danger)', flex: 1 }}>
                              Delete <strong>{svc.name}</strong>? This cannot be undone.
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => handleDelete(svc.id)} disabled={saving}>
                                {saving ? 'Deleting...' : 'Yes, Delete'}
                              </button>
                              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => setDeleteId(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="card" style={{ background: 'var(--primary-light)', boxShadow: 'none', padding: '12px 16px' }}>
        <p style={{ fontSize: '0.83rem', color: 'var(--primary)', margin: 0, lineHeight: 1.6 }}>
          💡 <strong>Tip:</strong> Use <strong>Sort Order</strong> to control the display order in Bills, Invoices, and PDFs. 
          Use ↑↓ arrows for quick reordering, or type an order number when editing.
        </p>
      </div>
    </div>
  );
}
