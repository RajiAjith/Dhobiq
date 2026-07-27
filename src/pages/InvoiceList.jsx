import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { Download, Eye, Trash2, CreditCard, Store, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import InvoicePaymentModal from '../components/InvoicePaymentModal';
import { getInvoicePaymentEntries, getInvoicePaymentSummary, persistInvoicePayment } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';
import { SkeletonList } from '../components/DhobiqLoader';
import { useConfirm } from '../components/ConfirmDialog';

const WhatsAppIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.436 2.5 1.173 3.493l-.765 2.793 2.859-.75c.95.518 2.034.814 3.19.814 3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.586-5.766-5.767-5.766zm3.361 8.358c-.143.402-.71.74-1.077.782-.321.037-.738.058-1.189-.086-.282-.09-1.238-.482-2.355-1.478-.89-.794-1.492-1.776-1.666-2.078-.175-.302-.018-.465.132-.614.135-.133.3-.347.45-.522.115-.133.155-.227.233-.378.077-.152.039-.284-.02-.402-.058-.118-.517-1.246-.709-1.707-.186-.448-.377-.387-.517-.394-.133-.007-.286-.008-.439-.008-.153 0-.402.057-.613.284-.211.227-.806.787-.806 1.919s.819 2.228.932 2.381c.115.153 1.611 2.46 3.902 3.45.545.235.97.375 1.302.48.547.174 1.045.15 1.439.091.439-.066 1.353-.553 1.543-1.087.19-.533.19-1.002.133-1.097-.058-.095-.212-.152-.469-.28zM12 .003C5.373.003 0 5.376 0 12c0 2.112.551 4.16 1.597 5.973L.103 23.473l5.698-1.494C7.525 23.107 9.725 23.997 12 23.997c6.627 0 12-5.373 12-11.997C24 5.376 18.627.003 12 .003zM12 22.083c-1.921 0-3.805-.515-5.455-1.488l-.391-.232-3.315.869.885-3.226-.255-.406C2.392 15.748 1.88 13.91 1.88 12c0-5.58 4.54-10.12 10.12-10.12 5.58 0 10.12 4.54 10.12 10.12 0 5.58-4.54 10.12-10.12 10.12z" />
  </svg>
);





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
  const [ConfirmUI, confirm] = useConfirm();

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

  const getIconBg = (id) => {
    if (!id) return 'var(--brand-50)';
    const code = id.charCodeAt(id.length - 1) % 4;
    return ['var(--brand-50)', 'var(--success-bg)', 'var(--purple-bg)', 'var(--orange-bg)'][code];
  };

  const getIconColor = (id) => {
    if (!id) return 'var(--primary)';
    const code = id.charCodeAt(id.length - 1) % 4;
    return ['var(--primary)', 'var(--success)', 'var(--purple)', 'var(--orange)'][code];
  };

  const formatCurrencyNoDecimals = (val) => {
    const rounded = Math.round(Number(val) || 0);
    return formatCurrency(rounded).replace(/\.00$/, '');
  };

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
  }, [reportError, clearWasOffline]);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (isOnline && wasOffline) fetchData(); }, [isOnline, wasOffline]);

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
        return <span className="badge badge-paid">Paid</span>;
      case 'partial':
        return <span className="badge" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>Partial</span>;
      case 'unpaid':
      default:
        return <span className="badge badge-unpaid">Unpaid</span>;
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (invoiceId) => {
    const ok = await confirm({
      title: 'Delete Invoice?',
      message: 'The associated bills will become uninvoiced again. This cannot be undone.',
      confirmLabel: 'Delete Invoice',
    });
    if (!ok) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      {/* Filters Grid */}
      <div className="filters-section">
        <div className="filter-item">
          <label className="filter-label">Customer</label>
          <select name="customerId" value={filters.customerId} onChange={handleFilterChange} className="form-control">
            <option value="">All Customers</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label className="filter-label">Month</label>
          <select name="month" value={filters.month} onChange={handleFilterChange} className="form-control">
            {MONTHS.map(m => <option key={m.label} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label className="filter-label">Year</label>
          <select name="year" value={filters.year} onChange={handleFilterChange} className="form-control">
            <option value="">All Years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label className="filter-label">Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="form-control">
            <option value="">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Invoice List Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Monthly Invoices</h2>
          <Link to="/invoices/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Generate Invoice</Link>
        </div>

        {loading ? (
          <SkeletonList count={3} />
        ) : filteredInvoices.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredInvoices.map(inv => {
              const isPaid = (inv.paymentStatus || inv.status) === 'paid';
              return (
                <div 
                  key={inv.id} 
                  className="list-card" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    padding: '14px', 
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid rgba(0, 61, 130, 0.04)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.01)',
                    margin: 0
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                    <div className="icon-box" style={{ 
                      backgroundColor: getIconBg(inv.id), 
                      color: getIconColor(inv.id),
                      width: '34px',
                      height: '34px',
                      minWidth: '34px',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Store size={16} />
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                            {inv.customerName}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                            {inv.invoiceNumber || inv.id}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrencyNoDecimals(inv.totalAmount)}
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            {renderStatusBadge(inv.paymentStatus || inv.status)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shading breakdown values grid */}
                  <div className="amount-grid" style={{ marginTop: '10px' }}>
                    <div className="amount-grid-cell">
                      <div className="amount-grid-label">Total</div>
                      <div className="amount-grid-value" style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {formatCurrencyNoDecimals(inv.totalAmount)}
                      </div>
                    </div>
                    <div className="amount-grid-cell">
                      <div className="amount-grid-label">Paid</div>
                      <div className="amount-grid-value" style={{ color: 'var(--success)', fontSize: '0.85rem' }}>
                        {formatCurrencyNoDecimals(inv.amountPaid || 0)}
                      </div>
                    </div>
                    <div className="amount-grid-cell">
                      <div className="amount-grid-label">Balance</div>
                      <div className="amount-grid-value" style={{ color: inv.balanceAmount > 0 ? 'var(--danger)' : 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {formatCurrencyNoDecimals(inv.balanceAmount ?? inv.totalAmount)}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    marginTop: '10px', 
                    paddingTop: '8px', 
                    borderTop: '1px solid rgba(0, 61, 130, 0.04)' 
                  }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yyyy') : ''} &nbsp;•&nbsp; {(inv.billIds || []).length} bill{ (inv.billIds || []).length !== 1 ? 's' : '' }
                    </span>
                    
                    {/* Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => !isPaid && handleOpenPayment(inv)}
                        className="btn-icon"
                        title={isPaid ? 'Invoice fully paid' : 'Add Payment'}
                        disabled={isPaid}
                        style={{
                          width: '32px', 
                          height: '32px', 
                          minWidth: '32px',
                          background: isPaid ? 'rgba(0, 0, 0, 0.02)' : 'rgba(16, 185, 129, 0.06)',
                          border: isPaid ? '1px solid rgba(0, 0, 0, 0.05)' : '1px solid rgba(16, 185, 129, 0.15)',
                          color: isPaid ? 'var(--text-light)' : '#10b981',
                          borderRadius: '8px',
                          opacity: isPaid ? 0.4 : 1,
                          cursor: isPaid ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <CreditCard size={14} />
                      </button>
                      <Link 
                        to={`/invoices/${inv.id}`} 
                        className="btn-icon" 
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          minWidth: '32px', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          background: 'rgba(139, 92, 246, 0.06)',
                          border: '1px solid rgba(139, 92, 246, 0.15)',
                          color: '#8b5cf6',
                          borderRadius: '8px'
                        }} 
                        title="View Invoice"
                      >
                        <Eye size={14} />
                      </Link>
                      <button 
                        onClick={() => handleDownloadPDF(inv)} 
                        className="btn-icon" 
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          minWidth: '32px',
                          background: 'rgba(2, 132, 199, 0.06)',
                          border: '1px solid rgba(2, 132, 199, 0.15)',
                          color: '#0284c7',
                          borderRadius: '8px'
                        }} 
                        title="Download PDF"
                      >
                        <Download size={14} />
                      </button>

                      {(() => {
                        const customer = customers.find(c => c.id === inv.customerId);
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
                        const formattedStatus = String(inv.paymentStatus || inv.status || 'unpaid').toUpperCase();

                        if (isPhoneValid) {
                          return (
                            <button 
                              onClick={() => {
                                // Encode invoice & customer payload in base64 URL query parameter
                                const payload = {
                                  type: 'invoice',
                                  invoice: {
                                    id: inv.id,
                                    invoiceNumber: inv.invoiceNumber || inv.id,
                                    invoiceDate: inv.invoiceDate,
                                    periodFrom: inv.periodFrom || '',
                                    periodTo: inv.periodTo || '',
                                    totalAmount: inv.totalAmount,
                                    amountPaid: inv.amountPaid || 0,
                                    balanceAmount: inv.balanceAmount ?? inv.totalAmount,
                                    paymentStatus: inv.paymentStatus || inv.status || 'unpaid',
                                    items: inv.items || []
                                  },
                                  customer: {
                                    name: customer?.name || '',
                                    phone: customer?.phone || '',
                                    address: customer?.address || ''
                                  },
                                  bills: (inv.billIds || []).map(id => ({ id }))
                                };
                                const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                                const shareUrl = `${window.location.origin}/share?d=${base64}`;
                                const text = `*Dhobiq Laundry*\n\nHello, your invoice *${inv.invoiceNumber || inv.id}* has been generated.\n*Date:* ${inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yyyy') : ''}\n*Total Amount:* ${formatCurrency(inv.totalAmount).replace(/\.00$/, '')}\n*Amount Paid:* ${formatCurrency(inv.amountPaid || 0).replace(/\.00$/, '')}\n*Balance:* ${formatCurrency(inv.balanceAmount ?? inv.totalAmount).replace(/\.00$/, '')}\n*Status:* ${formattedStatus}\n\n*View PDF Invoice:* ${shareUrl}\n\nThank you for choosing Dhobiq!`;
                                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                              }}
                              className="btn-icon" 
                              style={{ 
                                width: '32px', 
                                height: '32px', 
                                minWidth: '32px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(37, 211, 102, 0.06)',
                                border: '1px solid rgba(37, 211, 102, 0.15)',
                                color: '#15803d',
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }} 
                              title="Send Invoice via WhatsApp"
                            >
                              <WhatsAppIcon size={14} />
                            </button>
                          );
                        } else {
                          return (
                            <button 
                              disabled
                              className="btn-icon" 
                              style={{ 
                                width: '32px', 
                                height: '32px', 
                                minWidth: '32px',
                                background: 'rgba(0, 0, 0, 0.02)',
                                border: '1px solid rgba(0, 0, 0, 0.05)',
                                color: 'var(--text-disabled)',
                                borderRadius: '8px',
                                opacity: 0.45,
                                cursor: 'not-allowed'
                              }} 
                              title="No customer contact number added"
                            >
                              <WhatsAppIcon size={14} />
                            </button>
                          );
                        }
                      })()}
                      <button 
                        onClick={() => handleDelete(inv.id)} 
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
                        title="Delete Invoice"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff' }}>
            <p className="text-muted" style={{ marginBottom: '16px', fontSize: '0.82rem' }}>No invoices found. Generate your first consolidated invoice from the Bills page.</p>
            <Link to="/invoices/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Generate Invoice</Link>
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
