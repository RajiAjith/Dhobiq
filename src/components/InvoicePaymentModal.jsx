import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { getPaymentModeOptions } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';
import { Check, X, CreditCard, Calendar, Tag, Hash, FileText } from 'lucide-react';

const getDefaultForm = () => ({
  amount: '',
  paymentDate: format(new Date(), 'yyyy-MM-dd'),
  paymentMode: 'Cash',
  referenceNumber: '',
  notes: ''
});

export default function InvoicePaymentModal({
  isOpen,
  invoice,
  payment = null,
  paymentIndex = null,
  mode = 'add',
  onClose,
  onSave
}) {
  const paymentModes = useMemo(() => getPaymentModeOptions(), []);
  const [paymentForm, setPaymentForm] = useState(getDefaultForm());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (payment) {
      setPaymentForm({
        amount: String(payment.amount || ''),
        paymentDate: format(new Date(payment.paymentDate || Date.now()), 'yyyy-MM-dd'),
        paymentMode: payment.paymentMode || 'Cash',
        referenceNumber: payment.referenceNumber || '',
        notes: payment.notes || ''
      });
    } else {
      setPaymentForm(getDefaultForm());
    }
    setError('');
  }, [isOpen, payment]);

  if (!isOpen || !invoice) return null;

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onSave({ paymentForm, mode, paymentIndex });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(13, 27, 42, 0.4)', 
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 1000, 
      padding: '16px' 
    }}>
      <div 
        className="card" 
        style={{ 
          width: '100%', 
          maxWidth: '460px', 
          margin: 0,
          borderRadius: '20px',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-light)',
          animation: 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        {/* Title */}
        <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CreditCard size={18} style={{ color: 'var(--primary)' }} />
          {mode === 'edit' ? 'Edit Payment Record' : 'Record New Payment'}
        </h3>

        {/* Invoice Info Banner Panel */}
        <div style={{ 
          background: 'var(--surface-overlay)', 
          border: '1px solid var(--border-light)', 
          padding: '10px 12px', 
          borderRadius: '12px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '4px',
          marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            <span>Invoice Ref:</span>
            <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{invoice.invoiceNumber || invoice.id}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            <span>Customer:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{invoice.customerName}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-light)', paddingTop: '4px', marginTop: '2px' }}>
            <span>Unpaid Balance:</span>
            <strong style={{ color: 'var(--danger)' }}>
              {formatCurrency(Number(invoice.balanceAmount ?? invoice.totalAmount))}
            </strong>
          </div>
        </div>

        {error && (
          <div className="alert-danger" style={{ marginBottom: '12px', fontSize: '0.76rem', padding: '8px 10px', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Amount & Date 2-Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '10px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label">Amount (₹)</label>
              <input
                type="number"
                min="1"
                max={invoice.balanceAmount ?? invoice.totalAmount}
                step="0.01"
                className="form-control"
                value={paymentForm.amount}
                onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                placeholder="₹ Amount"
                style={{ fontSize: '0.8rem', height: '36px' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label">Payment Date</label>
              <input
                type="date"
                className="form-control"
                value={paymentForm.paymentDate}
                onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>
          </div>

          {/* Mode & Reference Number 2-Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label">Payment Mode</label>
              <select
                className="form-control"
                value={paymentForm.paymentMode}
                onChange={e => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                style={{ fontSize: '0.8rem', height: '36px' }}
              >
                {paymentModes.map(modeOption => <option key={modeOption} value={modeOption}>{modeOption}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label">Reference ID</label>
              <input
                type="text"
                className="form-control"
                value={paymentForm.referenceNumber}
                onChange={e => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                placeholder="e.g. Transaction ID"
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="filter-label">Notes (Optional)</label>
            <textarea
              className="form-control"
              rows="2"
              value={paymentForm.notes}
              onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              placeholder="e.g. partial cash, bank transfer notes..."
              style={{ fontSize: '0.8rem', padding: '8px 10px', minHeight: '50px' }}
            />
          </div>
        </div>

        {/* Action Row buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button 
            type="button"
            onClick={onClose} 
            className="btn btn-secondary" 
            style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }} 
            disabled={submitting}
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={handleSubmit} 
            className="btn btn-primary" 
            style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }} 
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
