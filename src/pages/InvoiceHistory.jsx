import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { Download, Edit, Trash2, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

const MONTHS = [
  { value: '', label: 'All Months' },
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
];

const YEARS = ['2025', '2026', '2027', '2028'];

export default function InvoiceHistory() {
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
    year: new Date().getFullYear().toString()
  });

  const fetchData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setIsOfflineError(false);
    try {
      const [invSnapshot, custSnapshot] = await Promise.all([
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'customers'))
      ]);

      const invData = [];
      invSnapshot.forEach(doc => invData.push({ id: doc.id, ...doc.data() }));
      invData.sort((a, b) => b.date - a.date);
      setInvoices(invData);
      setFilteredInvoices(invData);

      const custData = [];
      custSnapshot.forEach(doc => custData.push({ id: doc.id, ...doc.data() }));
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

  // Auto-reload when connection is restored
  useEffect(() => {
    if (isOnline && wasOffline) fetchData();
  }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let result = [...invoices];

    if (filters.customerId) {
      result = result.filter(inv => inv.customerId === filters.customerId);
    }
    if (filters.year) {
      result = result.filter(inv => {
        const date = new Date(inv.date);
        return date.getFullYear().toString() === filters.year;
      });
    }
    if (filters.month !== '') {
      result = result.filter(inv => {
        const date = new Date(inv.date);
        return date.getMonth().toString() === filters.month;
      });
    }

    setFilteredInvoices(result);
  }, [filters, invoices]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleDownloadPDF = async (invoice) => {
    try {
      const custRef = doc(db, 'customers', invoice.customerId);
      const custSnap = await getDoc(custRef);
      const customer = custSnap.exists() ? { id: custSnap.id, ...custSnap.data() } : null;
      generateInvoicePDF(invoice, customer, '/logo.png');
    } catch (err) {
      console.error("Error generating PDF", err);
      alert("Error generating PDF");
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (window.confirm("Delete this invoice?")) {
      try {
        await deleteDoc(doc(db, 'invoices', invoiceId));
        setInvoices(invoices.filter(inv => inv.id !== invoiceId));
        // filteredInvoices will update via useEffect as invoices change
      } catch (error) {
        console.error("Error deleting invoice:", error);
        reportError(error);
        alert("Failed to delete invoice.");
      }
    }
  };

  const handleOpenPayment = (inv) => {
    setPaymentInvoice(inv);
    setPaymentAmount('');
    setPaymentModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!paymentInvoice || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    const currentPaid = paymentInvoice.amountPaid || 0;
    const newPaid = currentPaid + amount;
    const total = paymentInvoice.totalAmount;

    if (newPaid > total) {
      alert("Payment amount cannot exceed total balance.");
      return;
    }

    const balanceAmount = total - newPaid;
    let status = 'unpaid';
    if (newPaid > 0) {
      status = newPaid >= total ? 'paid' : 'partial';
    }

    try {
      await updateDoc(doc(db, 'invoices', paymentInvoice.id), {
        amountPaid: newPaid,
        balanceAmount,
        status
      });

      setInvoices(invoices.map(inv => 
        inv.id === paymentInvoice.id 
          ? { ...inv, amountPaid: newPaid, balanceAmount, status }
          : inv
      ));

      setPaymentModalOpen(false);
      setPaymentInvoice(null);
      setPaymentAmount('');
    } catch (error) {
      console.error("Error saving payment:", error);
      reportError(error);
      alert("Failed to save payment.");
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

  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={fetchData} />;
  }

  return (
    <div>
      {/* Sticky Filters */}
      <div className="filters-section">
        <div className="filter-item">
          <label>Customer</label>
          <select
            name="customerId"
            value={filters.customerId}
            onChange={handleFilterChange}
            className="form-control"
          >
            <option value="">All Customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Month</label>
          <select
            name="month"
            value={filters.month}
            onChange={handleFilterChange}
            className="form-control"
          >
            {MONTHS.map(m => (
              <option key={m.label} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Year</label>
          <select
            name="year"
            value={filters.year}
            onChange={handleFilterChange}
            className="form-control"
          >
            <option value="">All Years</option>
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="card">
        <h2 className="card-title">Invoice History</h2>

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
                    <td data-label="Invoice #" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{inv.invoiceNumber}</td>
                    <td data-label="Customer">{inv.customerName}</td>
                    <td data-label="Date" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {inv.date ? format(new Date(inv.date), 'dd MMM yy') : ''}
                    </td>
                    <td data-label="Total" style={{ whiteSpace: 'nowrap', fontWeight: '500' }}>
                      ₹{Number(inv.totalAmount).toFixed(2)}
                    </td>
                    <td data-label="Paid" style={{ whiteSpace: 'nowrap', color: 'var(--success)' }}>
                      ₹{Number(inv.amountPaid || 0).toFixed(2)}
                    </td>
                    <td data-label="Balance" style={{ whiteSpace: 'nowrap', color: 'var(--danger)' }}>
                      ₹{Number(inv.balanceAmount ?? inv.totalAmount).toFixed(2)}
                    </td>
                    <td data-label="Status">
                      {renderStatusBadge(inv.status)}
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => handleOpenPayment(inv)} className="btn-icon" title="Add Payment" style={{ color: 'var(--primary)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          <CreditCard size={18} />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(inv)}
                          className="btn-icon"
                          title="Download PDF"
                        >
                          <Download size={18} />
                        </button>
                        <Link to={`/edit-invoice/${inv.id}`} className="btn-icon" title="Edit Invoice">
                          <Edit size={18} />
                        </Link>
                        <button onClick={() => handleDeleteInvoice(inv.id)} className="btn-icon" title="Delete Invoice" style={{ color: '#dc3545', border: 'none', background: 'transparent', cursor: 'pointer' }}>
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
          <p className="text-muted">No invoices match the selected filters.</p>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModalOpen && paymentInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: 0 }}>
            <h3 className="card-title">Add Payment</h3>
            <p><strong>Invoice:</strong> {paymentInvoice.invoiceNumber}</p>
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
