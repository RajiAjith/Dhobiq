import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { Download, Eye, Trash2, CreditCard } from 'lucide-react';
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

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const [filters, setFilters] = useState({
    customerId: '',
    month: '',
    year: new Date().getFullYear().toString(),
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!navigator.onLine) { setIsOfflineError(true); setLoading(false); return; }
    setLoading(true);
    setIsOfflineError(false);
    try {
      const [invSnap, custSnap] = await Promise.all([
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'customers')),
      ]);
      const invData = [];
      invSnap.forEach(d => invData.push({ id: d.id, ...d.data() }));
      invData.sort((a, b) => b.invoiceDate - a.invoiceDate);
      setInvoices(invData);
      setFilteredInvoices(invData);

      const custData = [];
      custSnap.forEach(d => custData.push({ id: d.id, ...d.data() }));
      setCustomers(custData);
      clearWasOffline();
    } catch (err) {
      console.error('Error fetching invoices:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setLoading(false);
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOnline && wasOffline) fetchData(); }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let result = [...invoices];
    if (filters.customerId) result = result.filter(inv => inv.customerId === filters.customerId);
    if (filters.year) result = result.filter(inv => {
      const d = new Date(inv.invoiceDate);
      return d.getFullYear().toString() === filters.year;
    });
    if (filters.month !== '') result = result.filter(inv => {
      const d = new Date(inv.invoiceDate);
      return d.getMonth().toString() === filters.month;
    });
    setFilteredInvoices(result);
  }, [filters, invoices]);

  const handleFilterChange = e => setFilters({ ...filters, [e.target.name]: e.target.value });

  // ── Download PDF ───────────────────────────────────────────────────────────
  const handleDownloadPDF = async (invoice) => {
    try {
      const [custSnap, billsData] = await Promise.all([
        getDoc(doc(db, 'customers', invoice.customerId)),
        Promise.all((invoice.billIds || []).map(bid => getDoc(doc(db, 'bills', bid)))),
      ]);
      const customer = custSnap.exists() ? { id: custSnap.id, ...custSnap.data() } : null;
      const bills = billsData.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));
      await generateInvoicePDF(invoice, customer, bills);
    } catch (err) {
      console.error('Error generating PDF', err);
      alert('Error generating PDF');
    }
  };

  // ── Payment Modal ──────────────────────────────────────────────────────────
  const handleOpenPayment = (inv) => {
    setPaymentInvoice(inv);
    setPaymentAmount('');
    setPaymentModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!paymentInvoice || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    const currentPaid = paymentInvoice.amountPaid || 0;
    const newPaid = currentPaid + amount;
    const total = paymentInvoice.totalAmount;

    if (newPaid > total) {
      alert('Payment amount cannot exceed total balance.');
      return;
    }

    const balanceAmount = total - newPaid;
    let paymentStatus = 'unpaid';
    if (newPaid > 0) {
      paymentStatus = newPaid >= total ? 'paid' : 'partial';
    }

    try {
      await writeBatch(db).commit(); // Just for dummy batch, but we can use doc update
      await getDoc(doc(db, 'invoices', paymentInvoice.id)); // Dummy fetch

      const invRef = doc(db, 'invoices', paymentInvoice.id);
      await writeBatch(db).update(invRef, {
        amountPaid: newPaid,
        balanceAmount,
        paymentStatus
      }).commit();

      setInvoices(invoices.map(inv =>
        inv.id === paymentInvoice.id
          ? { ...inv, amountPaid: newPaid, balanceAmount, paymentStatus }
          : inv
      ));

      setPaymentModalOpen(false);
      setPaymentInvoice(null);
      setPaymentAmount('');
    } catch (error) {
      console.error('Error saving payment:', error);
      reportError(error);
      alert('Failed to save payment.');
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#d4edda', color: '#155724', fontSize: '0.75rem', fontWeight: 'bold' }}>Paid</span>;
      case 'partial':
        return <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#fff3cd', color: '#856404', fontSize: '0.75rem', fontWeight: 'bold' }}>Partial</span>;
      case 'unpaid':
      default:
        return <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#f8d7da', color: '#721c24', fontSize: '0.75rem', fontWeight: 'bold' }}>Unpaid</span>;
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (invoiceId) => {
    if (!window.confirm('Delete this invoice? The associated bills will become uninvoiced again.')) return;
    try {
      // Un-mark bills as invoiced first
      const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
      if (invSnap.exists()) {
        const { billIds = [] } = invSnap.data();
        const batch = writeBatch(db);
        billIds.forEach(bid => {
          batch.update(doc(db, 'bills', bid), { invoiceId: null, status: 'pending' });
        });
        await batch.commit();
      }
      await deleteDoc(doc(db, 'invoices', invoiceId));
      setInvoices(invoices.filter(inv => inv.id !== invoiceId));
    } catch (err) {
      console.error('Error deleting invoice:', err);
      reportError(err);
      alert('Failed to delete invoice.');
    }
  };

  if (!loading && isOfflineError) return <OfflineScreen onRetry={fetchData} />;

  return (
    <div>
      {/* Filters */}
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
      </div>

      {/* Invoice List */}
      <div className="card">
        <div className="flex-between mb-2">
          <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Monthly Invoices</h2>
          <Link to="/invoices/new" className="btn btn-primary">+ Generate Invoice</Link>
        </div>

        {loading ? (
          <div className="loading-pulse">
            <div className="loading-pulse__bar" />
            <div className="loading-pulse__bar" style={{ width: '80%' }} />
            <div className="loading-pulse__bar" style={{ width: '60%' }} />
          </div>
        ) : filteredInvoices.length > 0 ? (
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Bills</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {inv.invoiceNumber || inv.id}
                    </td>
                    <td>{inv.customerName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yy') : ''}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-pending" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                        {(inv.billIds || []).length}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                      ₹{Number(inv.totalAmount).toFixed(2)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--success)' }}>
                      ₹{Number(inv.amountPaid || 0).toFixed(2)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--danger)' }}>
                      ₹{Number(inv.balanceAmount ?? inv.totalAmount).toFixed(2)}
                    </td>
                    <td>
                      {renderStatusBadge(inv.paymentStatus || inv.status)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleOpenPayment(inv)} className="btn-icon" title="Add Payment" style={{ color: 'var(--primary)' }}>
                          <CreditCard size={18} />
                        </button>
                        <Link to={`/invoices/${inv.id}`} className="btn-icon" title="View Invoice">
                          <Eye size={18} />
                        </Link>
                        <button onClick={() => handleDownloadPDF(inv)} className="btn-icon" title="Download PDF">
                          <Download size={18} />
                        </button>
                        <button onClick={() => handleDelete(inv.id)} className="btn-icon" title="Delete Invoice" style={{ color: '#dc3545' }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p className="text-muted" style={{ marginBottom: '16px' }}>No invoices found. Generate your first consolidated invoice from the Bills page.</p>
            <Link to="/invoices/new" className="btn btn-primary">+ Generate Invoice</Link>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModalOpen && paymentInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: 0 }}>
            <h3 className="card-title">Add Payment</h3>
            <p><strong>Invoice:</strong> {paymentInvoice.invoiceNumber || paymentInvoice.id}</p>
            <p><strong>Customer:</strong> {paymentInvoice.customerName}</p>
            <p><strong>Balance:</strong> ₹{Number(paymentInvoice.balanceAmount ?? paymentInvoice.totalAmount).toFixed(2)}</p>

            <div className="form-group" style={{ marginTop: '15px' }}>
              <label>Payment Amount (₹)</label>
              <input
                type="number"
                min="1"
                max={paymentInvoice.balanceAmount ?? paymentInvoice.totalAmount}
                step="0.01"
                className="form-control"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                autoFocus
              />
            </div>

            <div className="action-row" style={{ marginTop: '20px' }}>
              <button onClick={handleSavePayment} className="btn btn-primary" style={{ width: '100%' }}>Save Payment</button>
              <button onClick={() => setPaymentModalOpen(false)} className="btn btn-secondary" style={{ width: '100%' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
