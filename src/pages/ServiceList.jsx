import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_SERVICES } from '../utils/constants';
import { sortServices } from '../utils/serviceHelpers';
import { Edit, Trash2, Plus, Check, X, Download, ArrowUp, ArrowDown, Tag, AlertTriangle } from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';
import { SkeletonList } from '../components/DhobiqLoader';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Services Menu</h2>
          <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: '2px', margin: 0 }}>Manage laundry types and rates</p>
        </div>
        {!showAddForm && (
          <button
            className="btn btn-primary"
            onClick={() => { setShowAddForm(true); setEditId(null); setDeleteId(null); }}
            style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} /> Add Service
          </button>
        )}
      </div>

      {/* Add Service Form */}
      {showAddForm && (
        <div className="card" style={{ borderTop: '4px solid var(--primary)', borderRadius: '16px', padding: '16px' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} style={{ color: 'var(--primary)' }} /> New Service
          </h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="svc-name">Service Name</label>
                <input
                  id="svc-name" type="text" className="form-control"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Saree" required autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="svc-price">Default Price (₹)</label>
                <input
                  id="svc-price" type="number" min="0" step="0.01"
                  className="form-control" value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  placeholder="e.g. 50" inputMode="decimal" required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="svc-order">Sort Order <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  id="svc-order" type="number" min="1" step="1"
                  className="form-control" value={newOrder}
                  onChange={e => setNewOrder(e.target.value)}
                  placeholder="e.g. 1"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '10px' }} onClick={() => { setShowAddForm(false); setNewName(''); setNewPrice(''); setNewOrder(''); }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '10px' }}>
                <Check size={14} /> {saving ? 'Saving...' : 'Save Service'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Services List Content Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <SkeletonList count={4} />
        ) : services.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff' }}>
            <p className="text-muted" style={{ marginBottom: '20px', fontSize: '0.85rem' }}>
              No services found. Start by adding a service or import our standard laundry defaults.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              {!showAddForm && (
                <button className="btn btn-primary w-100" style={{ maxWidth: '250px', borderRadius: '10px' }} onClick={() => setShowAddForm(true)}>
                  <Plus size={16} /> Add First Service
                </button>
              )}
              <button
                className="btn btn-secondary w-100" style={{ maxWidth: '250px', borderRadius: '10px', background: 'rgba(2, 132, 199, 0.06)', color: 'var(--primary)', border: '1px solid rgba(2, 132, 199, 0.15)' }}
                onClick={handleSeedDefaults} disabled={saving}
              >
                <Download size={16} /> {saving ? 'Importing...' : 'Import Defaults'}
              </button>
            </div>
          </div>
        ) : (
          services.map((svc, idx) => (
            <React.Fragment key={svc.id}>
              {editId === svc.id ? (
                /* INLINE EDIT FORM CARD */
                <div className="list-card" style={{ padding: '16px', background: '#ffffff', borderRadius: '16px', border: '1.5px solid var(--primary)', boxShadow: '0 4px 12px rgba(0,61,130,0.08)', margin: 0 }}>
                  <form onSubmit={handleUpdate}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                      <div>
                        <label className="filter-label">Service Name</label>
                        <input type="text" className="form-control" value={editName} onChange={e => setEditName(e.target.value)} autoFocus required />
                      </div>
                      <div>
                        <label className="filter-label">Price</label>
                        <input type="number" min="0" step="0.01" className="form-control" value={editPrice} onChange={e => setEditPrice(e.target.value)} inputMode="decimal" required />
                      </div>
                      <div>
                        <label className="filter-label">Order</label>
                        <input type="number" min="1" step="1" className="form-control" value={editOrder} onChange={e => setEditOrder(e.target.value)} placeholder="Opt" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px' }} onClick={cancelEdit}>Cancel</button>
                      <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px' }} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* STANDARD SERVICE CARD */
                <div 
                  className="list-card" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    padding: '12px 14px', 
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid rgba(0, 61, 130, 0.04)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.01)',
                    margin: 0
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                    {/* Circle Icon Box */}
                    <div style={{ 
                      backgroundColor: 'rgba(2, 132, 199, 0.06)', 
                      color: 'var(--primary)',
                      width: '36px',
                      height: '36px',
                      minWidth: '36px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Tag size={16} />
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                            {svc.name}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Order: <strong>{svc.sort_order != null ? svc.sort_order : '—'}</strong>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrency(Number(svc.defaultPrice))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delete Confirmation Block */}
                  {deleteId === svc.id && (
                    <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.04)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--danger)' }}>
                        <AlertTriangle size={14} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Delete {svc.name}?</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }} onClick={() => setDeleteId(null)}>Cancel</button>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }} onClick={() => handleDelete(svc.id)} disabled={saving}>
                          {saving ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Action Row */}
                  {!deleteId && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      marginTop: '12px', 
                      paddingTop: '10px', 
                      borderTop: '1px solid rgba(0, 61, 130, 0.04)' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          className="btn-icon" 
                          style={{ 
                            width: '28px', height: '28px', minWidth: '28px', 
                            background: 'rgba(0,0,0,0.03)', border: 'none', color: 'var(--text-secondary)', borderRadius: '6px' 
                          }}
                          onClick={() => moveService(idx, -1)} disabled={saving || idx === 0}
                          title="Move up"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="btn-icon" 
                          style={{ 
                            width: '28px', height: '28px', minWidth: '28px', 
                            background: 'rgba(0,0,0,0.03)', border: 'none', color: 'var(--text-secondary)', borderRadius: '6px' 
                          }}
                          onClick={() => moveService(idx, 1)} disabled={saving || idx === services.length - 1}
                          title="Move down"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => startEdit(svc)} 
                          className="btn-icon" 
                          style={{ 
                            width: '30px', height: '30px', minWidth: '30px', 
                            background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)', color: '#d97706', borderRadius: '8px'
                          }} 
                          title="Edit"
                        >
                          <Edit size={13} />
                        </button>
                        <button 
                          onClick={() => setDeleteId(deleteId === svc.id ? null : svc.id)} 
                          className="btn-icon" 
                          style={{ 
                            width: '30px', height: '30px', minWidth: '30px', 
                            background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '8px'
                          }} 
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>

      {/* Tip */}
      {services.length > 0 && (
        <div style={{ background: 'rgba(2, 132, 199, 0.04)', border: '1px dashed rgba(2, 132, 199, 0.2)', padding: '12px 14px', borderRadius: '12px', marginTop: '4px' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--primary)', margin: 0, lineHeight: 1.5 }}>
            <span style={{ fontSize: '0.9rem', marginRight: '4px' }}>💡</span>
            Use the <strong>↑↓ arrows</strong> to instantly reorder services for Bills and Invoices.
          </p>
        </div>
      )}
    </div>
  );
}
