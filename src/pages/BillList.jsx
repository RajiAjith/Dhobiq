import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateBillPDF } from '../utils/pdfGenerator';
import { Download, Edit, Trash2, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

const MONTHS = [
  { value: '', label: 'All Months' },
  { value: '0', label: 'January' }, { value: '1', label: 'February' },
  { value: '2', label: 'March' }, { value: '3', label: 'April' },
  { value: '4', label: 'May' }, { value: '5', label: 'June' },
  { value: '6', label: 'July' }, { value: '7', label: 'August' },
  { value: '8', label: 'September' }, { value: '9', label: 'October' },
  { value: '10', label: 'November' }, { value: '11', label: 'December' },
];

const YEARS = ['2025', '2026', '2027', '2028'];

export default function BillList() {
  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const [filters, setFilters] = useState({
    customerId: '',
    month: '',
    year: new Date().getFullYear().toString(),
    status: '',
  });

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setIsOfflineError(false);
    try {
      const [billSnap, custSnap] = await Promise.all([
        getDocs(collection(db, 'bills')),
        getDocs(collection(db, 'customers')),
      ]);

      const billData = [];
      billSnap.forEach(d => billData.push({ id: d.id, ...d.data() }));
      billData.sort((a, b) => b.date - a.date);
      setBills(billData);
      setFilteredBills(billData);

      const custData = [];
      custSnap.forEach(d => custData.push({ id: d.id, ...d.data() }));
      setCustomers(custData);
      clearWasOffline();
    } catch (error) {
      console.error('Error fetching data:', error);
      reportError(error);
      if (isNetworkError(error)) setIsOfflineError(true);
    } finally {
      setLoading(false);
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOnline && wasOffline) fetchData();
  }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtering ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let result = [...bills];
    if (filters.customerId) {
      result = result.filter(b => b.customerId === filters.customerId);
    }
    if (filters.year) {
      result = result.filter(b => new Date(b.date).getFullYear().toString() === filters.year);
    }
    if (filters.month !== '') {
      result = result.filter(b => new Date(b.date).getMonth().toString() === filters.month);
    }
    if (filters.status) {
      result = result.filter(b => {
        if (filters.status === 'pending') return !b.invoiceId;
        if (filters.status === 'invoiced') return !!b.invoiceId;
        return true;
      });
    }
    setFilteredBills(result);
  }, [filters, bills]);

  const handleFilterChange = e => setFilters({ ...filters, [e.target.name]: e.target.value });

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleDownloadPDF = async (bill) => {
    try {
      const custRef = doc(db, 'customers', bill.customerId);
      const custSnap = await getDoc(custRef);
      const customer = custSnap.exists() ? { id: custSnap.id, ...custSnap.data() } : null;
      await generateBillPDF(bill, customer);
    } catch (err) {
      console.error('Error generating PDF', err);
      alert('Error generating PDF');
    }
  };

  const handleDelete = async (billId) => {
    const bill = bills.find(b => b.id === billId);
    if (bill?.invoiceId) {
      alert('This bill is already linked to an invoice and cannot be deleted.');
      return;
    }
    if (!window.confirm('Delete this bill? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'bills', billId));
      setBills(bills.filter(b => b.id !== billId));
    } catch (error) {
      console.error('Error deleting bill:', error);
      reportError(error);
      alert('Failed to delete bill.');
    }
  };

  // ── Status badge ───────────────────────────────────────────────────────────
  const renderStatusBadge = (bill) => {
    if (bill.invoiceId) {
      return <span className="badge badge-invoiced">Invoiced</span>;
    }
    return <span className="badge badge-pending">Pending</span>;
  };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const pendingCount = filteredBills.filter(b => !b.invoiceId).length;
  const pendingTotal = filteredBills.filter(b => !b.invoiceId).reduce((s, b) => s + (b.totalAmount || 0), 0);

  if (!loading && isOfflineError) return <OfflineScreen onRetry={fetchData} />;

  return (
    <div>
      {/* Sticky Filters */}
      <div className="filters-section">
        <div className="filter-item">
          <label>Customer</label>
          <select name="customerId" value={filters.customerId} onChange={handleFilterChange} className="form-control">
            <option value="">All Customers</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label>Month</label>
          <select name="month" value={filters.month} onChange={handleFilterChange} className="form-control">
            {MONTHS.map(m => <option key={m.label} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label>Year</label>
          <select name="year" value={filters.year} onChange={handleFilterChange} className="form-control">
            <option value="">All Years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label>Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="form-control">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="invoiced">Invoiced</option>
          </select>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && pendingCount > 0 && (
        <div className="summary-bar">
          <span>📋 <strong>{pendingCount}</strong> uninvoiced bill{pendingCount > 1 ? 's' : ''}</span>
          <span>Total pending: <strong>₹{pendingTotal.toFixed(2)}</strong></span>
          <Link to="/invoices/new" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
            Generate Invoice
          </Link>
        </div>
      )}

      {/* Bills Table */}
      <div className="card">
        <div className="flex-between mb-2">
          <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Bill History</h2>
          <Link to="/bills/new" className="btn btn-primary">+ New Bill</Link>
        </div>

        {loading ? (
          <div className="loading-pulse">
            <div className="loading-pulse__bar" />
            <div className="loading-pulse__bar" style={{ width: '80%' }} />
            <div className="loading-pulse__bar" style={{ width: '60%' }} />
          </div>
        ) : filteredBills.length > 0 ? (
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(bill => (
                  <tr key={bill.id}>
                    <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                      {bill.billNumber || bill.id}
                    </td>
                    <td>{bill.customerName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {bill.date ? format(new Date(bill.date), 'dd MMM yy') : ''}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: '500' }}>
                      ₹{Number(bill.totalAmount).toFixed(2)}
                    </td>
                    <td>{renderStatusBadge(bill)}</td>
                    <td>
                      <div style={{ display: 'inline-block', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => handleDownloadPDF(bill)} className="btn-icon" title="Download Bill PDF">
                          <Download size={18} />
                        </button>
                        {!bill.invoiceId && (
                          <Link to={`/bills/${bill.id}/edit`} className="btn-icon" title="Edit Bill">
                            <Edit size={18} />
                          </Link>
                        )}
                        {bill.invoiceId && (
                          <Link to={`/invoices/${bill.invoiceId}`} className="btn-icon" title="View Invoice" style={{ color: 'var(--primary)' }}>
                            <Receipt size={18} />
                          </Link>
                        )}
                        {!bill.invoiceId && (
                          <button onClick={() => handleDelete(bill.id)} className="btn-icon" title="Delete Bill" style={{ color: '#dc3545', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No bills match the selected filters.</p>
        )}
      </div>
    </div>
  );
}
