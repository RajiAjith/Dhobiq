import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF, generateBillPDF } from '../utils/pdfGenerator';
import { Download, ArrowLeft, Receipt, CreditCard } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { updateDoc } from 'firebase/firestore';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice,        setInvoice]        = useState(null);
  const [customer,       setCustomer]       = useState(null);
  const [includedBills,  setIncludedBills]  = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount,    setPaymentAmount]    = useState('');

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const loadData = useCallback(async () => {
    if (!navigator.onLine) { setIsOfflineError(true); setLoading(false); return; }
    setLoading(true);
    setIsOfflineError(false);
    try {
      const invSnap = await getDoc(doc(db, 'invoices', id));
      if (!invSnap.exists()) {
        navigate('/invoices');
        return;
      }
      const invData = { id: invSnap.id, ...invSnap.data() };
      setInvoice(invData);

      // Load customer
      const custSnap = await getDoc(doc(db, 'customers', invData.customerId));
      if (custSnap.exists()) setCustomer({ id: custSnap.id, ...custSnap.data() });

      // Load included bills
      const billIds = invData.billIds || [];
      const billDocs = await Promise.all(billIds.map(bid => getDoc(doc(db, 'bills', bid))));
      const bills = billDocs
        .filter(s => s.exists())
        .map(s => ({ id: s.id, ...s.data() }))
        .sort((a, b) => a.date - b.date);
      setIncludedBills(bills);

      clearWasOffline();
    } catch (err) {
      console.error('Error loading invoice:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOnline && wasOffline) loadData(); }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadInvoicePDF = () => {
    if (invoice && customer) generateInvoicePDF(invoice, customer, includedBills);
  };

  const handleDownloadBillPDF = (bill) => {
    if (customer) generateBillPDF(bill, customer);
  };

  const handleSavePayment = async () => {
    if (!invoice || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    const currentPaid = invoice.amountPaid || 0;
    const newPaid = currentPaid + amount;
    const total = invoice.totalAmount;

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
      await updateDoc(doc(db, 'invoices', invoice.id), {
        amountPaid: newPaid,
        balanceAmount,
        paymentStatus
      });

      setInvoice({ ...invoice, amountPaid: newPaid, balanceAmount, paymentStatus });
      setPaymentModalOpen(false);
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

  if (!loading && isOfflineError) return <OfflineScreen onRetry={loadData} />;

  if (loading) {
    return (
      <div className="card">
        <div className="loading-pulse">
          <div className="loading-pulse__bar" style={{ width: '40%' }} />
          <div className="loading-pulse__bar" />
          <div className="loading-pulse__bar" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const periodFrom = invoice.periodFrom ? format(new Date(invoice.periodFrom), 'dd MMM yyyy') : '';
  const periodTo   = invoice.periodTo   ? format(new Date(invoice.periodTo),   'dd MMM yyyy') : '';

  return (
    <div>
      {/* Back + Actions */}
      <div className="flex-between mb-2">
        <button className="btn btn-secondary" onClick={() => navigate('/invoices')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={handleDownloadInvoicePDF}>
          <Download size={16} /> Download Invoice PDF
        </button>
      </div>

      {/* Invoice Header */}
      <div className="card">
        <div className="invoice-detail-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {invoice.invoiceNumber || invoice.id}
              {renderStatusBadge(invoice.paymentStatus || invoice.status)}
            </h2>
            <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
              Date: <strong>{invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd MMM yyyy') : ''}</strong>
              {periodFrom && periodTo && (
                <> &nbsp;·&nbsp; Period: <strong>{periodFrom} – {periodTo}</strong></>
              )}
            </p>
          </div>
          <div className="invoice-detail-total">
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Total Amount</span>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)' }}>
              ₹{Number(invoice.totalAmount).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <div className="detail-info-grid">
          <div className="detail-info-block">
            <span className="detail-label">Customer</span>
            <span className="detail-value">{customer?.name || invoice.customerName}</span>
          </div>
          {customer?.phone && (
            <div className="detail-info-block">
              <span className="detail-label">Phone</span>
              <span className="detail-value">{customer.phone}</span>
            </div>
          )}
          {customer?.address && (
            <div className="detail-info-block">
              <span className="detail-label">Address</span>
              <span className="detail-value">{customer.address}</span>
            </div>
          )}
          {customer?.id && (
            <div className="detail-info-block">
              <span className="detail-label">Customer ID</span>
              <span className="detail-value" style={{ fontFamily: 'monospace' }}>{customer.id}</span>
            </div>
          )}
        </div>
      </div>

      {/* Consolidated Items */}
      <div className="card">
        <h3 className="card-title">Consolidated Items</h3>
        <div className="table-responsive">
          <table className="table card-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Service</th>
                <th>Qty</th>
                <th>Rate (₹)</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, i) => (
                <tr key={`${item.id}-${item.unitPrice}`}>
                  <td style={{ color: 'var(--text-light)', fontSize: '0.82rem' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>₹{Number(item.unitPrice).toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>₹{Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="total-section">
          <div className="total-row">
            <span>Total Amount:</span>
            <span>₹{Number(invoice.totalAmount).toFixed(2)}</span>
          </div>
          <div className="total-row" style={{ color: 'var(--success)' }}>
            <span>Amount Paid:</span>
            <span>₹{Number(invoice.amountPaid || 0).toFixed(2)}</span>
          </div>
          <div className="total-row grand-total" style={{ color: 'var(--danger)' }}>
            <span>Balance Due:</span>
            <span>₹{Number(invoice.balanceAmount ?? invoice.totalAmount).toFixed(2)}</span>
          </div>
          
          {(invoice.balanceAmount ?? invoice.totalAmount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button onClick={() => setPaymentModalOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={16} /> Add Payment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Included Bills */}
      <div className="card">
        <h3 className="card-title">Included Bills ({includedBills.length})</h3>
        {includedBills.length === 0 ? (
          <p className="text-muted">No bills linked.</p>
        ) : (
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {includedBills.map(bill => (
                  <tr key={bill.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {bill.billNumber || bill.id}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
                      {(bill.items || []).filter(i => i.quantity > 0).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                    </td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                      ₹{Number(bill.totalAmount).toFixed(2)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleDownloadBillPDF(bill)} className="btn-icon" title="Download Bill PDF">
                          <Download size={16} />
                        </button>
                        <Link to={`/bills/${bill.id}/edit`} className="btn-icon" title="View Bill" style={{ opacity: 0.6 }}>
                          <Receipt size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: 0 }}>
            <h3 className="card-title">Add Payment</h3>
            <p><strong>Invoice:</strong> {invoice.invoiceNumber || invoice.id}</p>
            <p><strong>Balance:</strong> ₹{Number(invoice.balanceAmount ?? invoice.totalAmount).toFixed(2)}</p>
            
            <div className="form-group" style={{ marginTop: '15px' }}>
              <label>Payment Amount (₹)</label>
              <input
                type="number"
                min="1"
                max={invoice.balanceAmount ?? invoice.totalAmount}
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
