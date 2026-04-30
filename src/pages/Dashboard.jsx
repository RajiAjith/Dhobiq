import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { FileText, Users, Settings } from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

export default function Dashboard() {
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const fetchRecentInvoices = useCallback(async () => {
    // If we know we're offline, don't even try — show the screen immediately
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setIsOfflineError(false);

    let isMounted = true;
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        setError('Connection is taking longer than expected. Please check your network.');
        setIsOfflineError(true);
        setLoading(false);
      }
    }, 15000);

    try {
      const q = query(
        collection(db, 'invoices'),
        orderBy('date', 'desc'),
        limit(5)
      );
      const querySnapshot = await getDocs(q);
      const invoices = [];
      querySnapshot.forEach(doc => invoices.push({ id: doc.id, ...doc.data() }));
      if (isMounted) {
        setRecentInvoices(invoices);
        setError(null);
        setIsOfflineError(false);
        clearWasOffline();
      }
    } catch (err) {
      console.error('Error fetching recent invoices:', err);
      // Report error to global network context
      reportError(err);
      
      if (isMounted) {
        if (isNetworkError(err)) {
          setIsOfflineError(true);
          setError(null);
        } else {
          setError('Failed to connect to database: ' + err.message);
        }
      }
    } finally {
      clearTimeout(timeout);
      if (isMounted) setLoading(false);
      isMounted = false;
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    fetchRecentInvoices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reload when connection is restored after an offline period
  useEffect(() => {
    if (isOnline && wasOffline) {
      fetchRecentInvoices();
    }
  }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Offline full-screen (replaces spinner) ──────────────────────────────────
  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={fetchRecentInvoices} />;
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex-between mb-2">
        <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Dashboard</h2>
        <Link to="/create-invoice" className="btn btn-primary">+ New Invoice</Link>
      </div>

      {/* Quick Action Cards — 3 cols on mobile, auto-fit */}
      <div className="dashboard-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="dashboard-card">
          <FileText size={32} color="var(--primary)" />
          <h3>Invoices</h3>
          <p>Track billing</p>
          <Link to="/invoices" className="btn btn-secondary">History</Link>
        </div>
        <div className="dashboard-card">
          <Users size={32} color="var(--primary)" />
          <h3>Customers</h3>
          <p>Manage clients</p>
          <Link to="/customers" className="btn btn-secondary">View</Link>
        </div>
        <div className="dashboard-card">
          <Settings size={32} color="var(--primary)" />
          <h3>Services</h3>
          <p>Edit pricing</p>
          <Link to="/services" className="btn btn-secondary">Manage</Link>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="card">
        <h3 className="card-title">Recent Invoices</h3>
        {loading ? (
          <div className="loading-pulse">
            <div className="loading-pulse__bar" />
            <div className="loading-pulse__bar" style={{ width: '75%' }} />
            <div className="loading-pulse__bar" style={{ width: '55%' }} />
          </div>
        ) : error ? (
          <div className="alert-danger mb-2">{error}</div>
        ) : recentInvoices.length > 0 ? (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontSize: '0.78rem' }}>{inv.invoiceNumber}</td>
                    <td>{inv.customerName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {inv.date ? format(new Date(inv.date), 'dd MMM yy') : ''}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      ₹{Number(inv.totalAmount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No recent invoices found.</p>
        )}
      </div>
    </div>
  );
}
