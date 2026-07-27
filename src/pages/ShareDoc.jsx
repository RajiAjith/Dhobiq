import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Store, Phone, MapPin, User, Calendar, Hash, FileText } from 'lucide-react';
import { generateBillPDF, generateInvoicePDF } from '../utils/pdfGenerator';
import { formatCurrency } from '../utils/currencyFormatter';
import { format } from 'date-fns';

export default function ShareDoc() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const rawData = searchParams.get('d');
    if (!rawData) {
      setError('No document data found in this link.');
      return;
    }

    try {
      // Safely decode base64 utf-8 string
      const jsonStr = decodeURIComponent(escape(atob(rawData)));
      const parsed = JSON.parse(jsonStr);
      setData(parsed);
    } catch (e) {
      console.error('Error decoding share link:', e);
      setError('Invalid or corrupted document link.');
    }
  }, [searchParams]);

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-app)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '24px', borderRadius: '20px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FileText size={24} />
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Unable to Open Link</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-app)' }}>
        <div className="loading-pulse" style={{ width: '120px' }}>
          <div className="loading-pulse__bar" />
        </div>
      </div>
    );
  }

  const { type, customer } = data;
  const isInvoice = type === 'invoice';
  const docObj = isInvoice ? data.invoice : data.bill;
  const docNumber = isInvoice ? (docObj.invoiceNumber || docObj.id) : (docObj.billNumber || docObj.id);
  const docDate = isInvoice ? docObj.invoiceDate : docObj.date;

  const handleDownload = async () => {
    try {
      if (isInvoice) {
        await generateInvoicePDF(docObj, customer, data.bills || [], true);
      } else {
        await generateBillPDF(docObj, customer, true);
      }
    } catch (e) {
      alert('Failed to generate PDF: ' + e.message);
    }
  };

  const renderStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    const styleMap = {
      paid: { bg: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: 'rgba(16, 185, 129, 0.15)' },
      partial: { bg: 'rgba(245, 158, 11, 0.08)', color: '#d97706', border: 'rgba(245, 158, 11, 0.15)' },
      unpaid: { bg: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.15)' }
    };
    const style = styleMap[s] || { bg: 'rgba(100, 116, 139, 0.08)', color: '#64748b', border: 'rgba(100, 116, 139, 0.15)' };
    return (
      <span style={{
        fontSize: '0.66rem',
        fontWeight: 800,
        padding: '3px 8px',
        borderRadius: '6px',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        textTransform: 'uppercase',
        letterSpacing: '0.02em'
      }}>
        {s || 'PENDING'}
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', padding: '16px 12px 30px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
      
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', width: '100%', maxWidth: '500px' }}>
        <div style={{ background: 'var(--primary)', color: '#ffffff', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Store size={18} />
        </div>
        <div>
          <h1 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Dhobiq Laundry</h1>
          <p style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', margin: 0 }}>Online Invoice Portal</p>
        </div>
      </div>

      {/* Main Document Card */}
      <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '14px', margin: 0 }}>
        
        {/* Document Meta Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {docNumber}
              </span>
              {renderStatusBadge(isInvoice ? (docObj.paymentStatus || docObj.status) : 'unpaid')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Date: <strong>{docDate ? format(new Date(docDate), 'dd MMM yyyy') : ''}</strong>
            </div>
            {isInvoice && docObj.periodFrom && docObj.periodTo && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Billing Period: <strong>{format(new Date(docObj.periodFrom), 'dd MMM yyyy')} – {format(new Date(docObj.periodTo), 'dd MMM yyyy')}</strong>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', display: 'block' }}>
              {isInvoice ? 'Total Invoice Amount' : 'Bill Total'}
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary)' }}>
              {formatCurrency(docObj.totalAmount)}
            </span>
          </div>
        </div>

        {/* Customer Information Block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--surface-overlay)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <User size={13} style={{ color: 'var(--primary)' }} />
            <span>Customer: {customer?.name}</span>
          </div>
          {customer?.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <Phone size={12} style={{ color: 'var(--text-muted)' }} />
              <span>Phone: {customer.phone}</span>
            </div>
          )}
          {customer?.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
              <span>Address: {customer.address}</span>
            </div>
          )}
        </div>

        {/* Pricing Table (Items List) */}
        <div>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Services Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(docObj.items || []).map((item, index) => (
              <div 
                key={`${item.id}-${index}`}
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
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</span>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Qty: <strong>{item.quantity}</strong> @ {formatCurrency(item.unitPrice)}
                  </div>
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatCurrency(item.total)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Summary Breakdown */}
        {isInvoice && (
          <div className="amount-grid" style={{ margin: 0 }}>
            <div className="amount-grid-cell">
              <div className="amount-grid-label">Total</div>
              <div className="amount-grid-value" style={{ color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                {formatCurrency(docObj.totalAmount)}
              </div>
            </div>
            <div className="amount-grid-cell">
              <div className="amount-grid-label">Paid</div>
              <div className="amount-grid-value" style={{ color: 'var(--success)', fontSize: '0.82rem' }}>
                {formatCurrency(docObj.amountPaid || 0)}
              </div>
            </div>
            <div className="amount-grid-cell">
              <div className="amount-grid-label">Balance Due</div>
              <div className="amount-grid-value" style={{ color: 'var(--danger)', fontSize: '0.82rem' }}>
                {formatCurrency(docObj.balanceAmount ?? docObj.totalAmount)}
              </div>
            </div>
          </div>
        )}

        {/* Download PDF CTA Button */}
        <button 
          onClick={handleDownload}
          className="btn btn-primary"
          style={{ 
            width: '100%', 
            padding: '12px', 
            fontSize: '0.8rem', 
            fontWeight: 800,
            borderRadius: '12px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '8px',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-premium)'
          }}
        >
          <Download size={16} /> Download Official PDF Bill
        </button>

      </div>
    </div>
  );
}
