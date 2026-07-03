import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF, generateBillPDF } from '../utils/pdfGenerator';
import { Download, ArrowLeft, Receipt, CreditCard, Edit3, Trash2 } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import InvoicePaymentModal from '../components/InvoicePaymentModal';
import { deleteInvoicePayment, getInvoicePaymentEntries, getInvoicePaymentSummary, persistInvoicePayment } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [includedBills, setIncludedBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalMode, setPaymentModalMode] = useState('add');
  const [editingPaymentIndex, setEditingPaymentIndex] = useState(null);
  const [activePayment, setActivePayment] = useState(null);

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
      const paymentSummary = getInvoicePaymentSummary(invData);
      const normalizedInvoice = {
        ...invData,
        payments: getInvoicePaymentEntries(invData),
        amountPaid: paymentSummary.amountPaid,
        balanceAmount: paymentSummary.balanceAmount,
        paymentStatus: paymentSummary.paymentStatus
      };

      const needsMigration = (!Array.isArray(invData.payments) || invData.payments.length === 0) && Number(invData.amountPaid || 0) > 0;
      if (needsMigration) {
        await updateDoc(doc(db, 'invoices', id), {
          payments: normalizedInvoice.payments,
          amountPaid: normalizedInvoice.amountPaid,
          balanceAmount: normalizedInvoice.balanceAmount,
          paymentStatus: normalizedInvoice.paymentStatus
        });
      }

      setInvoice(normalizedInvoice);

      const custSnap = await getDoc(doc(db, 'customers', invData.customerId));
      if (custSnap.exists()) setCustomer({ id: custSnap.id, ...custSnap.data() });

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
  }, [id, navigate, reportError, clearWasOffline]);

  useEffect(() => { loadData(); }, [id]);
  useEffect(() => { if (isOnline && wasOffline) loadData(); }, [isOnline, wasOffline]);

  const handleDownloadInvoicePDF = () => {
    if (invoice && customer) generateInvoicePDF(invoice, customer, includedBills);
  };

  const handleDownloadBillPDF = (bill) => {
    if (customer) generateBillPDF(bill, customer);
  };

  const openAddPaymentModal = () => {
    setActivePayment(null);
    setEditingPaymentIndex(null);
    setPaymentModalMode('add');
    setPaymentModalOpen(true);
  };

  const openEditPaymentModal = (payment, index) => {
    setActivePayment(payment);
    setEditingPaymentIndex(index);
    setPaymentModalMode('edit');
    setPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setActivePayment(null);
    setEditingPaymentIndex(null);
    setPaymentModalMode('add');
  };

  const handleSavePayment = async ({ paymentForm }) => {
    if (!invoice) return;

    try {
      const updatedSummary = await persistInvoicePayment({
        dbInstance: db,
        invoice,
        paymentForm,
        mode: paymentModalMode,
        editingPaymentIndex,
        invoiceId: invoice.id
      });

      setInvoice({
        ...invoice,
        payments: updatedSummary.payments,
        amountPaid: updatedSummary.amountPaid,
        balanceAmount: updatedSummary.balanceAmount,
        paymentStatus: updatedSummary.paymentStatus
      });
    } catch (error) {
      console.error('Error saving payment:', error);
      reportError(error);
      throw error;
    }
  };

  const handleDeletePayment = async (index) => {
    if (!invoice) return;
    if (!window.confirm('Delete this payment entry?')) return;

    try {
      const updatedSummary = await deleteInvoicePayment({
        dbInstance: db,
        invoice,
        paymentIndex: index,
        invoiceId: invoice.id
      });

      setInvoice({
        ...invoice,
        payments: updatedSummary.payments,
        amountPaid: updatedSummary.amountPaid,
        balanceAmount: updatedSummary.balanceAmount,
        paymentStatus: updatedSummary.paymentStatus
      });
    } catch (error) {
      console.error('Error deleting payment:', error);
      reportError(error);
      alert('Failed to delete payment.');
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
  const periodTo = invoice.periodTo ? format(new Date(invoice.periodTo), 'dd MMM yyyy') : '';
  const paymentHistory = Array.isArray(invoice.payments) ? invoice.payments : [];

  return (
    <div>
      <div className="flex-between mb-2">
        <button className="btn btn-secondary" onClick={() => navigate('/invoices')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={handleDownloadInvoicePDF}>
          <Download size={16} /> Download Invoice PDF
        </button>
      </div>

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
              {formatCurrency(Number(invoice.totalAmount))}
            </span>
          </div>
        </div>

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
                  <td style={{ textAlign: 'right' }}>{formatCurrency(Number(item.unitPrice))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(Number(item.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="total-section">
          <div className="total-row">
            <span>Total Amount:</span>
            <span>{formatCurrency(Number(invoice.totalAmount))}</span>
          </div>
          <div className="total-row" style={{ color: 'var(--success)' }}>
            <span>Amount Paid:</span>
            <span>{formatCurrency(Number(invoice.amountPaid || 0))}</span>
          </div>
          <div className="total-row grand-total" style={{ color: 'var(--danger)' }}>
            <span>Balance Due:</span>
            <span>{formatCurrency(Number(invoice.balanceAmount ?? invoice.totalAmount))}</span>
          </div>

          {(invoice.balanceAmount ?? invoice.totalAmount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button onClick={openAddPaymentModal} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={16} /> Add Payment
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex-between mb-2">
          <h3 className="card-title" style={{ margin: 0 }}>Payment History</h3>
          <button onClick={openAddPaymentModal} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CreditCard size={16} /> Record Payment
          </button>
        </div>

        {paymentHistory.length === 0 ? (
          <p className="text-muted">No payment history recorded yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment, index) => (
                  <tr key={`${payment.createdAt || index}-${index}`}>
                    <td>{payment.paymentDate ? format(new Date(payment.paymentDate), 'dd MMM yyyy') : ''}</td>
                    <td>{formatCurrency(Number(payment.amount || 0))}</td>
                    <td>{payment.paymentMode || 'Unknown'}</td>
                    <td>{payment.referenceNumber || '—'}</td>
                    <td style={{ maxWidth: '220px', whiteSpace: 'normal' }}>{payment.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => openEditPaymentModal(payment, index)} className="btn-icon" title="Edit Payment">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => handleDeletePayment(index)} className="btn-icon delete" title="Delete Payment">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                      {formatCurrency(Number(bill.totalAmount))}
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

      <InvoicePaymentModal
        isOpen={paymentModalOpen}
        invoice={invoice}
        payment={activePayment}
        paymentIndex={editingPaymentIndex}
        mode={paymentModalMode}
        onClose={closePaymentModal}
        onSave={handleSavePayment}
      />
    </div>
  );
}
