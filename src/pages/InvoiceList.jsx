import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { Download, Eye, Trash2, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import InvoicePaymentModal from '../components/InvoicePaymentModal';
import { getInvoicePaymentEntries, getInvoicePaymentSummary, persistInvoicePayment } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';

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
  const [paymentModalMode, setPaymentModalMode] = useState('add');
  const [editingPaymentIndex, setEditingPaymentIndex] = useState(null);
  const [activePayment, setActivePayment] = useState(null);

  // Default month to current month
  const [filters, setFilters] = useState({
    customerId: '',
    month: new Date().getMonth().toString(),
    year: new Date().getFullYear().toString(),
    status: '',
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
      const normalizedInvoices = invData
        .map(inv => {
          const summary = getInvoicePaymentSummary(inv);
          return {
            ...inv,
            payments: getInvoicePaymentEntries(inv),
            amountPaid: summary.amountPaid,
            balanceAmount: summary.balanceAmount,
            paymentStatus: summary.paymentStatus
          };
        })
        .sort((a, b) => b.invoiceDate - a.invoiceDate);
      setInvoices(normalizedInvoices);
      setFilteredInvoices(normalizedInvoices);

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
    if (filters.status) result = result.filter(inv => (inv.paymentStatus || inv.status || 'unpaid') === filters.status);
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
    setPaymentModalMode('add');
    setEditingPaymentIndex(null);
    setActivePayment(null);
    setPaymentModalOpen(true);
  };

  const handleSavePayment = async ({ paymentForm }) => {
    if (!paymentInvoice) return;

    try {
      const updatedSummary = await persistInvoicePayment({
        dbInstance: db,
        invoice: paymentInvoice,
        paymentForm,
        mode: paymentModalMode,
        editingPaymentIndex,
        invoiceId: paymentInvoice.id
      });

      setInvoices(prev => prev.map(inv =>
        inv.id === paymentInvoice.id
          ? {
              ...inv,
              payments: updatedSummary.payments,
              amountPaid: updatedSummary.amountPaid,
              balanceAmount: updatedSummary.balanceAmount,
              paymentStatus: updatedSummary.paymentStatus
            }
          : inv
      ));

      setPaymentModalOpen(false);
      setPaymentInvoice(null);
      setPaymentModalMode('add');
      setEditingPaymentIndex(null);
      setActivePayment(null);
    } catch (error) {
      console.error('Error saving payment:', error);
      reportError(error);
      throw error;
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
        <div className="filter-item">
          <label>Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="form-control">
            <option value="">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
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
                {filteredInvoices.map(inv => {
                  const isPaid = (inv.paymentStatus || inv.status) === 'paid';
                  return (
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
                        {formatCurrency(Number(inv.totalAmount))}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--success)' }}>
                        {formatCurrency(Number(inv.amountPaid || 0))}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--danger)' }}>
                        {formatCurrency(Number(inv.balanceAmount ?? inv.totalAmount))}
                      </td>
                      <td>
                        {renderStatusBadge(inv.paymentStatus || inv.status)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => !isPaid && handleOpenPayment(inv)}
                            className="btn-icon"
                            title={isPaid ? 'Invoice fully paid' : 'Add Payment'}
                            disabled={isPaid}
                            style={{
                              color: isPaid ? 'var(--text-light)' : 'var(--primary)',
                              opacity: isPaid ? 0.4 : 1,
                              cursor: isPaid ? 'not-allowed' : 'pointer',
                            }}
                          >
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
                  );
                })}
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

      <InvoicePaymentModal
        isOpen={paymentModalOpen && !!paymentInvoice}
        invoice={paymentInvoice}
        payment={activePayment}
        paymentIndex={editingPaymentIndex}
        mode={paymentModalMode}
        onClose={() => {
          setPaymentModalOpen(false);
          setPaymentInvoice(null);
          setPaymentModalMode('add');
          setEditingPaymentIndex(null);
          setActivePayment(null);
        }}
        onSave={handleSavePayment}
      />
    </div>
  );
}
