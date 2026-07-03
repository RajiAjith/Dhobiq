import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { getPaymentModeOptions } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';

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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '480px', margin: 0 }}>
        <h3 className="card-title">{mode === 'edit' ? 'Edit Payment' : 'Add Payment'}</h3>
        <p><strong>Invoice:</strong> {invoice.invoiceNumber || invoice.id}</p>
        <p><strong>Customer:</strong> {invoice.customerName}</p>
        <p><strong>Balance:</strong> {formatCurrency(Number(invoice.balanceAmount ?? invoice.totalAmount))}</p>

        {error && <div className="alert-danger" style={{ marginBottom: '10px' }}>{error}</div>}

        <div className="form-group" style={{ marginTop: '15px' }}>
          <label>Payment Amount (₹)</label>
          <input
            type="number"
            min="1"
            max={invoice.balanceAmount ?? invoice.totalAmount}
            step="0.01"
            className="form-control"
            value={paymentForm.amount}
            onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Payment Date</label>
          <input
            type="date"
            className="form-control"
            value={paymentForm.paymentDate}
            onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Payment Mode</label>
          <select
            className="form-control"
            value={paymentForm.paymentMode}
            onChange={e => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
          >
            {paymentModes.map(modeOption => <option key={modeOption} value={modeOption}>{modeOption}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Reference Number</label>
          <input
            type="text"
            className="form-control"
            value={paymentForm.referenceNumber}
            onChange={e => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
            placeholder="Optional"
          />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            className="form-control"
            rows="3"
            value={paymentForm.notes}
            onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
            placeholder="Optional"
          />
        </div>

        <div className="action-row" style={{ marginTop: '20px' }}>
          <button onClick={handleSubmit} className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Payment'}
          </button>
          <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%' }} disabled={submitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
