import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { format } from 'date-fns';
import { generateBillPDF } from '../utils/pdfGenerator';
import { Download, Edit, Trash2, Receipt, Store, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
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

export default function BillList() {
  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();
  const [ConfirmUI, confirm] = useConfirm();

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
  }, [reportError, clearWasOffline]);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (isOnline && wasOffline) fetchData();
  }, [isOnline, wasOffline]);

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
    const ok = await confirm({
      title: 'Delete Bill?',
      message: 'This bill will be permanently removed. This action cannot be undone.',
      confirmLabel: 'Delete Bill',
    });
    if (!ok) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      {/* Sticky Filters Grid */}
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
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="invoiced">Invoiced</option>
          </select>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && pendingCount > 0 && (
        <div className="summary-bar" style={{ margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '18px', background: 'var(--primary-light)', border: '1px solid rgba(0, 61, 130, 0.08)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              📋 <strong>{pendingCount}</strong> uninvoiced bill{pendingCount > 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              Total pending: {formatCurrencyNoDecimals(pendingTotal)}
            </span>
          </div>
          <Link to="/invoices/new" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>
            Generate Invoice
          </Link>
        </div>
      )}

      {/* Bills Feed List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Bill History</h2>
          <Link to="/bills/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ New Bill</Link>
        </div>

        {loading ? (
          <SkeletonList count={3} />
        ) : filteredBills.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredBills.map(bill => (
              <div 
                key={bill.id} 
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
                  <div className="icon-box" style={{ 
                    backgroundColor: getIconBg(bill.id), 
                    color: getIconColor(bill.id),
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
                          {bill.customerName}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                          {bill.billNumber || bill.id}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {formatCurrencyNoDecimals(bill.totalAmount)}
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          {renderStatusBadge(bill)}
                        </div>
                      </div>
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
                    {bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''} &nbsp;•&nbsp; {bill.items ? bill.items.length : 0} items
                  </span>
                  
                  {/* Actions Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                      onClick={() => handleDownloadPDF(bill)} 
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
                      title="Download Bill PDF"
                    >
                      <Download size={14} />
                    </button>

                      {(() => {
                        const customer = customers.find(c => c.id === bill.customerId);
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

                        if (isPhoneValid) {
                          return (
                            <button 
                              onClick={() => {
                                // Encode bill & customer payload in base64 URL query parameter
                                const payload = {
                                  type: 'bill',
                                  bill: {
                                    id: bill.id,
                                    billNumber: bill.billNumber || bill.id,
                                    date: bill.date,
                                    totalAmount: bill.totalAmount,
                                    items: bill.items || [],
                                    notes: bill.notes || ''
                                  },
                                  customer: {
                                    name: customer?.name || '',
                                    phone: customer?.phone || '',
                                    address: customer?.address || ''
                                  }
                                };
                                const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                                const shareUrl = `${window.location.origin}/share?d=${base64}`;
                                const text = `*Dhobiq Laundry*\n\nHello, your laundry bill *${bill.billNumber || bill.id}* has been recorded.\n*Date:* ${bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''}\n*Total Amount:* ${formatCurrency(bill.totalAmount).replace(/\.00$/, '')}\n*Items:* ${bill.items ? bill.items.length : 0} items\n\n*View PDF Bill:* ${shareUrl}\n\nThank you for choosing Dhobiq!`;
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
                              title="Send Bill via WhatsApp"
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
                    {!bill.invoiceId && (
                      <Link 
                        to={`/bills/${bill.id}/edit`} 
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
                        title="Edit Bill"
                      >
                        <Edit size={14} />
                      </Link>
                    )}
                    {bill.invoiceId && (
                      <Link 
                        to={`/invoices/${bill.invoiceId}`} 
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
                        <Receipt size={14} />
                      </Link>
                    )}
                    {!bill.invoiceId && (
                      <button 
                        onClick={() => handleDelete(bill.id)} 
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
                        title="Delete Bill"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ fontSize: '0.82rem', textAlign: 'center', marginTop: '16px' }}>No bills match the selected filters.</p>
        )}
      </div>
    </div>
  );
}
