import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF, generateBillPDF } from '../utils/pdfGenerator';
import { Download, ArrowLeft, Receipt, CreditCard, Edit3, Trash2, Calendar, Phone, MapPin, Hash, Wallet, ArrowRight, User, Plus } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import InvoicePaymentModal from '../components/InvoicePaymentModal';
import { deleteInvoicePayment, getInvoicePaymentEntries, getInvoicePaymentSummary, persistInvoicePayment } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';
import { useConfirm } from '../components/ConfirmDialog';

const WhatsAppIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.436 2.5 1.173 3.493l-.765 2.793 2.859-.75c.95.518 2.034.814 3.19.814 3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.586-5.766-5.767-5.766zm3.361 8.358c-.143.402-.71.74-1.077.782-.321.037-.738.058-1.189-.086-.282-.09-1.238-.482-2.355-1.478-.89-.794-1.492-1.776-1.666-2.078-.175-.302-.018-.465.132-.614.135-.133.3-.347.45-.522.115-.133.155-.227.233-.378.077-.152.039-.284-.02-.402-.058-.118-.517-1.246-.709-1.707-.186-.448-.377-.387-.517-.394-.133-.007-.286-.008-.439-.008-.153 0-.402.057-.613.284-.211.227-.806.787-.806 1.919s.819 2.228.932 2.381c.115.153 1.611 2.46 3.902 3.45.545.235.97.375 1.302.48.547.174 1.045.15 1.439.091.439-.066 1.353-.553 1.543-1.087.19-.533.19-1.002.133-1.097-.058-.095-.212-.152-.469-.28zM12 .003C5.373.003 0 5.376 0 12c0 2.112.551 4.16 1.597 5.973L.103 23.473l5.698-1.494C7.525 23.107 9.725 23.997 12 23.997c6.627 0 12-5.373 12-11.997C24 5.376 18.627.003 12 .003zM12 22.083c-1.921 0-3.805-.515-5.455-1.488l-.391-.232-3.315.869.885-3.226-.255-.406C2.392 15.748 1.88 13.91 1.88 12c0-5.58 4.54-10.12 10.12-10.12 5.58 0 10.12 4.54 10.12 10.12 0 5.58-4.54 10.12-10.12 10.12z" />
  </svg>
);





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
  const [ConfirmUI, confirm] = useConfirm();

  const formatCurrencyNoDecimals = (val) => {
    return formatCurrency(Math.round(Number(val) || 0)).replace(/\.00$/, '');
  };

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
      // Known validation errors (e.g. overpayment) are surfaced in the UI modal.
      // Only log unexpected/network errors to the console.
      const isValidationError = error?.message?.toLowerCase().includes('exceed') ||
                                error?.message?.toLowerCase().includes('invalid') ||
                                error?.message?.toLowerCase().includes('overpay');
      if (!isValidationError) {
        console.error('Error saving payment:', error);
        reportError(error);
      }
      throw error;
    }
  };

  const handleDeletePayment = async (index) => {
    if (!invoice) return;
    const ok = await confirm({
      title: 'Delete Payment?',
      message: 'This payment entry will be permanently removed from the invoice.',
      confirmLabel: 'Delete Payment',
    });
    if (!ok) return;

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
        return <span className="badge badge-paid" style={{ fontSize: '0.66rem', padding: '2px 8px' }}>Paid</span>;
      case 'partial':
        return <span className="badge badge-partial" style={{ fontSize: '0.66rem', padding: '2px 8px' }}>Partial</span>;
      case 'unpaid':
      default:
        return <span className="badge badge-unpaid" style={{ fontSize: '0.66rem', padding: '2px 8px' }}>Unpaid</span>;
    }
  };

  if (!loading && isOfflineError) return <OfflineScreen onRetry={loadData} />;

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
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
  const isFullyPaid = (invoice.balanceAmount ?? invoice.totalAmount) <= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      {/* Top Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          className="btn btn-secondary" 
          onClick={() => navigate('/invoices')}
          style={{ padding: '8px 14px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleDownloadInvoicePDF}
            style={{ padding: '8px 14px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(2, 132, 199, 0.06)', color: 'var(--primary)', border: '1px solid rgba(2, 132, 199, 0.15)' }}
          >
            <Download size={14} /> PDF
          </button>
          
          {(() => {
            const rawPhone = customer?.phone || '';
            const hasPhone = !!rawPhone.trim();
            
            // Clean phone digits function
            const cleanPhone = (phone) => {
              const firstPhone = phone.split(',')[0].trim();
              const digits = firstPhone.replace(/\D/g, '');
              if (!digits) return '';
              if (digits.length === 10) return '91' + digits;
              return digits;
            };

            const phone = hasPhone ? cleanPhone(rawPhone) : '';
            const isPhoneValid = !!phone;
            const formattedStatus = String(invoice.paymentStatus || invoice.status || 'unpaid').toUpperCase();

            if (isPhoneValid) {
              return (
                <button 
                  onClick={() => {
                    // Encode invoice & customer payload in base64 URL query parameter
                    const payload = {
                      type: 'invoice',
                      invoice: {
                        id: invoice.id,
                        invoiceNumber: invoice.invoiceNumber || invoice.id,
                        invoiceDate: invoice.invoiceDate,
                        periodFrom: invoice.periodFrom || '',
                        periodTo: invoice.periodTo || '',
                        totalAmount: invoice.totalAmount,
                        amountPaid: invoice.amountPaid || 0,
                        balanceAmount: invoice.balanceAmount ?? invoice.totalAmount,
                        paymentStatus: invoice.paymentStatus || invoice.status || 'unpaid',
                        items: invoice.items || []
                      },
                      customer: {
                        name: customer?.name || '',
                        phone: customer?.phone || '',
                        address: customer?.address || ''
                      },
                      bills: (invoice.billIds || []).map(id => ({ id }))
                    };
                    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                    const shareUrl = `${window.location.origin}/share?d=${base64}`;
                    const text = `*Dhobiq Laundry*\n\nHello, your invoice *${invoice.invoiceNumber || invoice.id}* has been generated.\n*Date:* ${invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd MMM yyyy') : ''}\n*Total Amount:* ${formatCurrency(invoice.totalAmount).replace(/\.00$/, '')}\n*Amount Paid:* ${formatCurrency(invoice.amountPaid || 0).replace(/\.00$/, '')}\n*Balance:* ${formatCurrency(invoice.balanceAmount ?? invoice.totalAmount).replace(/\.00$/, '')}\n*Status:* ${formattedStatus}\n\nThank you for choosing Dhobiq!\n\n*Click to view/download PDF:* ${shareUrl}`;
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                  }}
                  className="btn btn-primary" 
                  style={{ 
                    padding: '8px 14px', 
                    fontSize: '0.78rem', 
                    minHeight: '34px', 
                    borderRadius: '10px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    background: 'rgba(37, 211, 102, 0.06)', 
                    color: '#15803d', 
                    border: '1px solid rgba(37, 211, 102, 0.15)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Send Invoice via WhatsApp"
                >
                  <WhatsAppIcon size={14} /> Send
                </button>
              );
            } else {
              return (
                <button 
                  disabled
                  className="btn btn-primary" 
                  style={{ 
                    padding: '8px 14px', 
                    fontSize: '0.78rem', 
                    minHeight: '34px', 
                    borderRadius: '10px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    background: 'rgba(0, 0, 0, 0.02)', 
                    color: 'var(--text-disabled)', 
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    opacity: 0.45,
                    cursor: 'not-allowed'
                  }}
                  title="No customer contact number added"
                >
                  <WhatsAppIcon size={14} /> Send
                </button>
              );
            }
          })()}
        </div>
      </div>

      {/* Invoice Overview Card */}
      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {invoice.invoiceNumber || invoice.id}
              </span>
              {renderStatusBadge(invoice.paymentStatus || invoice.status)}
            </div>
            
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Invoice Date: <strong>{invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd MMM yyyy') : ''}</strong>
            </div>
            {periodFrom && periodTo && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Billing Period: <strong>{periodFrom} – {periodTo}</strong>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="text-muted" style={{ fontSize: '0.68rem', display: 'block' }}>Total Amount</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
              {formatCurrency(Number(invoice.totalAmount))}
            </span>
          </div>
        </div>

        {/* Customer Information Drawer Block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--surface-overlay)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '10px 12px', marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <User size={13} style={{ color: 'var(--primary)' }} />
            <span>Customer: {customer?.name || invoice.customerName}</span>
          </div>
          {customer?.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <Phone size={11} style={{ color: 'var(--text-muted)' }} />
              <span>Phone: {customer.phone}</span>
            </div>
          )}
          {customer?.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <MapPin size={11} style={{ color: 'var(--text-muted)' }} />
              <span>Address: {customer.address}</span>
            </div>
          )}
          {customer?.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <Hash size={11} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontFamily: 'monospace' }}>ID: {customer.id}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pricing Summary Columns & payment CTAs */}
      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px', border: 'none' }}>
          Invoice Summary
        </h3>

        <div className="amount-grid" style={{ marginBottom: '14px' }}>
          <div className="amount-grid-cell">
            <div className="amount-grid-label">Total</div>
            <div className="amount-grid-value" style={{ color: 'var(--primary)' }}>
              {formatCurrencyNoDecimals(invoice.totalAmount)}
            </div>
          </div>
          <div className="amount-grid-cell">
            <div className="amount-grid-label">Paid</div>
            <div className="amount-grid-value" style={{ color: 'var(--success)' }}>
              {formatCurrencyNoDecimals(invoice.amountPaid || 0)}
            </div>
          </div>
          <div className="amount-grid-cell">
            <div className="amount-grid-label">Balance</div>
            <div className="amount-grid-value" style={{ color: 'var(--danger)' }}>
              {formatCurrencyNoDecimals(invoice.balanceAmount ?? invoice.totalAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Consolidated Services List */}
      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px', border: 'none' }}>
          Consolidated Services
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(invoice.items || []).map((item, i) => (
            <div 
              key={`${item.id}-${item.unitPrice}`}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '8px 10px', 
                background: 'var(--surface-overlay)', 
                border: '1px solid var(--border-light)',
                borderRadius: '10px' 
              }}
            >
              <div>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>{item.name}</span>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Qty: <strong>{item.quantity}</strong> @ {formatCurrency(Number(item.unitPrice))} each
                </div>
              </div>
              <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatCurrency(Number(item.total))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Payout History Cards */}
      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Payment History
          </h3>
          <button 
            onClick={isFullyPaid ? undefined : openAddPaymentModal}
            disabled={isFullyPaid}
            title={isFullyPaid ? 'Invoice is fully paid' : 'Add a payment'}
            style={{ 
              background: isFullyPaid ? 'rgba(0,0,0,0.04)' : 'rgba(2, 132, 199, 0.06)', 
              border: `1px solid ${isFullyPaid ? 'transparent' : 'rgba(2, 132, 199, 0.15)'}`, 
              color: isFullyPaid ? 'var(--text-disabled)' : 'var(--primary)',
              fontSize: '0.74rem', 
              fontWeight: 700, 
              padding: '4px 10px', 
              borderRadius: '8px',
              cursor: isFullyPaid ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: isFullyPaid ? 0.45 : 1,
            }}
          >
            <Plus size={12} /> Add Payment
          </button>
        </div>

        {paymentHistory.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'center', margin: '10px 0' }}>
            No payment payouts recorded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {paymentHistory.map((payment, index) => (
              <div 
                key={`${payment.createdAt || index}-${index}`}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  padding: '10px 12px',
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid rgba(0, 61, 130, 0.04)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.06)', color: '#10b981', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justify: 'center', flexShrink: 0, justifyContent: 'center' }}>
                      <Wallet size={14} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {payment.paymentMode || 'Payment'}
                      </span>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Date: {payment.paymentDate ? format(new Date(payment.paymentDate), 'dd MMM yyyy') : ''}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--success)' }}>
                      +{formatCurrency(Number(payment.amount || 0))}
                    </span>
                    {payment.referenceNumber && (
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Ref: {payment.referenceNumber}
                      </div>
                    )}
                  </div>
                </div>

                {payment.notes && (
                  <div style={{ marginTop: '8px', background: 'var(--surface-overlay)', padding: '6px 8px', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {payment.notes}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(0,61,130,0.03)', marginTop: '8px', paddingTop: '6px' }}>
                  <button 
                    onClick={() => openEditPaymentModal(payment, index)} 
                    className="btn-icon" 
                    style={{ 
                      width: '26px', height: '26px', minWidth: '26px',
                      background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)', color: '#d97706', borderRadius: '6px'
                    }} 
                    title="Edit Payment"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button 
                    onClick={() => handleDeletePayment(index)} 
                    className="btn-icon" 
                    style={{ 
                      width: '26px', height: '26px', minWidth: '26px',
                      background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '6px'
                    }} 
                    title="Delete Payment"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Linked Bills Cards */}
      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px', border: 'none' }}>
          Included Bills ({includedBills.length})
        </h3>
        
        {includedBills.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>No bills linked.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {includedBills.map(bill => (
              <div 
                key={bill.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 12px',
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid rgba(0, 61, 130, 0.04)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {bill.billNumber || bill.id}
                    </span>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Date: {bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatCurrency(Number(bill.totalAmount))}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(bill.items || []).filter(i => i.quantity > 0).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(0,61,130,0.03)', marginTop: '8px', paddingTop: '6px' }}>
                  <button 
                    onClick={() => handleDownloadBillPDF(bill)} 
                    className="btn-icon" 
                    style={{ 
                      width: '28px', height: '28px', minWidth: '28px',
                      background: 'rgba(2, 132, 199, 0.06)', border: '1px solid rgba(2, 132, 199, 0.15)', color: '#0284c7', borderRadius: '8px'
                    }} 
                    title="Download Bill PDF"
                  >
                    <Download size={13} />
                  </button>
                  <Link 
                    to={`/bills/${bill.id}/edit`} 
                    className="btn-icon" 
                    style={{ 
                      width: '28px', height: '28px', minWidth: '28px',
                      background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.15)', color: '#8b5cf6', borderRadius: '8px',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                    }} 
                    title="View Bill Details"
                  >
                    <Receipt size={13} />
                  </Link>
                </div>
              </div>
            ))}
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
