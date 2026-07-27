import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { Edit, Trash2, User, Phone, MapPin, Search } from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import { SkeletonList } from '../components/DhobiqLoader';
import { useConfirm } from '../components/ConfirmDialog';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();
  const [ConfirmUI, confirm] = useConfirm();

  const getIconBg = (name) => {
    if (!name) return 'var(--brand-50)';
    const code = name.charCodeAt(0) % 4;
    return ['var(--brand-50)', 'var(--success-bg)', 'var(--purple-bg)', 'var(--orange-bg)'][code];
  };

  const getIconColor = (name) => {
    if (!name) return 'var(--primary)';
    const code = name.charCodeAt(0) % 4;
    return ['var(--primary)', 'var(--success)', 'var(--purple)', 'var(--orange)'][code];
  };

  const fetchCustomers = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setIsOfflineError(false);

    try {
      const querySnapshot = await getDocs(collection(db, 'customers'));
      const custData = [];
      querySnapshot.forEach((doc) => {
        custData.push({ id: doc.id, ...doc.data() });
      });
      setCustomers(custData);
      clearWasOffline();
    } catch (error) {
      console.error('Error fetching customers:', error);
      reportError(error);
      if (isNetworkError(error)) {
        setIsOfflineError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [reportError, clearWasOffline]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Auto-reload on reconnect
  useEffect(() => {
    if (isOnline && wasOffline) {
      fetchCustomers();
    }
  }, [isOnline, wasOffline]);

  const handleDelete = async (customerId) => {
    const ok = await confirm({
      title: 'Delete Customer?',
      message: 'This customer and all their related invoices will be permanently deleted.',
      confirmLabel: 'Delete Customer',
    });
    if (!ok) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'customers', customerId));

      const q = query(collection(db, 'invoices'), where('customerId', '==', customerId));
      const invoiceSnap = await getDocs(q);

      const batch = writeBatch(db);
      invoiceSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      setCustomers(customers.filter(c => c.id !== customerId));
    } catch (error) {
      console.error('Error deleting customer:', error);
      reportError(error);
      alert('Failed to delete customer');
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const queryStr = searchQuery.toLowerCase().trim();
    if (!queryStr) return true;
    return (
      (customer.name || '').toLowerCase().includes(queryStr) ||
      (customer.phone || '').toLowerCase().includes(queryStr) ||
      (customer.id || '').toLowerCase().includes(queryStr) ||
      (customer.address || '').toLowerCase().includes(queryStr)
    );
  });

  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={fetchCustomers} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Customers</h2>
          <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: '2px', margin: 0 }}>Manage client registry details and profiles</p>
        </div>
        <Link to="/customers/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Add Customer</Link>
      </div>

      {/* Search Input Box */}
      {customers.length > 0 && (
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', display: 'flex', alignItems: 'center' }}>
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search by name, phone, address, or customer ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-control"
            style={{
              paddingLeft: '38px',
              fontSize: '0.82rem',
              height: '38px',
              borderRadius: '12px',
              border: '1.5px solid var(--border-light)',
              background: '#ffffff',
              boxShadow: 'none',
              width: '100%',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-light)',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Customer List Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <SkeletonList count={3} />
        ) : customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff' }}>
            <p className="text-muted" style={{ marginBottom: '16px', fontSize: '0.82rem' }}>No customers found. Add a new customer to get started.</p>
            <Link to="/customers/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Add Customer</Link>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff', color: 'var(--text-light)', fontSize: '0.8rem' }}>
            No customers match your search criteria.
          </div>
        ) : (
          filteredCustomers.map(customer => (
            <div 
              key={customer.id} 
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
                {/* Initial Avatar */}
                <div style={{ 
                  backgroundColor: getIconBg(customer.name), 
                  color: getIconColor(customer.name),
                  width: '36px',
                  height: '36px',
                  minWidth: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                    {customer.name ? customer.name.charAt(0).toUpperCase() : 'C'}
                  </span>
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                        {customer.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                        ID: {customer.id}
                      </div>
                    </div>
                    {customer.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <Phone size={12} style={{ color: 'var(--primary)', opacity: 0.7 }} />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {customer.address && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', marginTop: '8px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  <MapPin size={12} style={{ marginTop: '2px', color: 'var(--text-light)', flexShrink: 0 }} />
                  <span style={{ lineHeight: 1.3 }}>{customer.address}</span>
                </div>
              )}
              
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'flex-end', 
                marginTop: '10px', 
                paddingTop: '8px', 
                borderTop: '1px solid rgba(0, 61, 130, 0.04)' 
              }}>
                {/* Actions Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link 
                    to={`/customers/${customer.id}`} 
                    className="btn-icon" 
                    style={{ 
                      width: '32px', 
                      height: '32px', 
                      minWidth: '32px', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      background: 'rgba(245, 158, 11, 0.06)',
                      border: '1px solid rgba(245, 158, 11, 0.15)',
                      color: '#d97706',
                      borderRadius: '8px'
                    }} 
                    title="Edit Customer"
                  >
                    <Edit size={14} />
                  </Link>
                  <button 
                    onClick={() => handleDelete(customer.id)} 
                    className="btn-icon" 
                    style={{ 
                      width: '32px', 
                      height: '32px', 
                      minWidth: '32px', 
                      background: 'rgba(239, 68, 68, 0.06)',
                      border: '1px solid rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      borderRadius: '8px',
                      cursor: 'pointer' 
                    }} 
                    title="Delete Customer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
