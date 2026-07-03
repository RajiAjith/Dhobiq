import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, setDoc, getDoc, updateDoc, runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { fetchServicesSorted } from '../utils/serviceHelpers';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';

export default function BillCreate() {
  const [customers,          setCustomers]          = useState([]);
  const [services,           setServices]           = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [items,              setItems]              = useState([]);
  const [notes,              setNotes]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [dataLoading,        setDataLoading]        = useState(true);
  const [isOfflineError,     setIsOfflineError]     = useState(false);
  const [saveAsCustomPricing, setSaveAsCustomPricing] = useState(true);
  const [billDate,           setBillDate]           = useState(format(new Date(), 'yyyy-MM-dd'));

  const { id } = useParams();
  const isEditing = Boolean(id);
  const [existingBill, setExistingBill] = useState(null);
  const navigate = useNavigate();

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  // ── Load customers, services, and existing bill (edit mode) ────────────────
  const loadData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setIsOfflineError(false);
    try {
      const promises = [
        getDocs(collection(db, 'customers')),
        fetchServicesSorted(),
      ];
      if (isEditing) {
        promises.push(getDoc(doc(db, 'bills', id)));
      }

      const results = await Promise.all(promises);
      const custSnapshot = results[0];
      const svcList      = results[1];

      const custData = [];
      custSnapshot.forEach(d => custData.push({ id: d.id, ...d.data() }));
      setCustomers(custData);
      setServices(svcList);

      if (isEditing && results[2] && results[2].exists()) {
        const bill = results[2].data();
        setExistingBill(bill);
        setSelectedCustomerId(bill.customerId);
        setNotes(bill.notes || '');
        if (bill.date) {
          setBillDate(format(new Date(bill.date), 'yyyy-MM-dd'));
        }
      }
      clearWasOffline();
    } catch (err) {
      console.error('Error loading data:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataLoading(false);
    }
  }, [id, isEditing, reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [id, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build line items whenever customer or services change ──────────────────
  useEffect(() => {
    if (!selectedCustomerId || services.length === 0) {
      setItems([]);
      return;
    }
    const customer = customers.find(c => c.id === selectedCustomerId);
    const initialItems = services.map(svc => {
      // In edit mode, restore existing item quantities
      if (isEditing && existingBill && existingBill.customerId === selectedCustomerId) {
        const existingItem = existingBill.items.find(i => i.id === svc.id);
        if (existingItem) return { ...existingItem };
      }
      // Apply custom pricing for customer if available
      let price = svc.defaultPrice;
      if (
        customer?.customPrices &&
        customer.customPrices[svc.id] !== undefined &&
        customer.customPrices[svc.id] !== ''
      ) {
        price = customer.customPrices[svc.id];
      }
      return { id: svc.id, name: svc.name, quantity: 0, unitPrice: price, total: 0 };
    });
    setItems(initialItems);
  }, [selectedCustomerId, customers, services, isEditing, existingBill]);

  // ── Expression evaluator for quantity field ────────────────────────────────
  const evaluateExpr = (expr) => {
    if (!expr) return 0;
    if (typeof expr === 'number') return expr;
    const clean = expr.toString().replace(/[^0-9+\-*/.()]/g, '');
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`return ${clean}`)();
      return (typeof result === 'number' && isFinite(result)) ? result : 0;
    } catch {
      return 0;
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    if (field === 'quantity') {
      if (/[^0-9+\-*/.() ]/.test(value)) return;
      newItems[index].quantity = value;
      const numericQty = evaluateExpr(value);
      newItems[index].total = numericQty * newItems[index].unitPrice;
    } else {
      newItems[index][field] = Number(value);
      if (field === 'unitPrice') {
        const numericQty = evaluateExpr(newItems[index].quantity);
        newItems[index].total = numericQty * newItems[index].unitPrice;
      }
    }
    setItems(newItems);
  };

  const finalizeQuantity = (index) => {
    const newItems = [...items];
    const result = evaluateExpr(newItems[index].quantity);
    newItems[index].quantity = result || 0;
    newItems[index].total    = (result || 0) * newItems[index].unitPrice;
    setItems(newItems);
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + item.total, 0);

  // ── Bill number generation ─────────────────────────────────────────────────
  const generateBillNumber = async () => {
    const today   = new Date();
    const dateStr = format(today, 'yyyyMMdd');
    const counterRef = doc(db, 'counters', `bill_${dateStr}`);
    let newSequence = 1;

    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { seq: 1 });
      } else {
        newSequence = counterDoc.data().seq + 1;
        transaction.update(counterRef, { seq: newSequence });
      }
    });

    return `BILL-${dateStr}-${String(newSequence).padStart(3, '0')}`;
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const activeItems = items.filter(item => item.quantity > 0);
    if (activeItems.length === 0) {
      alert('Please add at least one item with a quantity greater than 0');
      return;
    }

    // Block editing an already-invoiced bill
    if (isEditing && existingBill?.invoiceId) {
      alert('This bill has already been included in an invoice and cannot be edited.');
      return;
    }

    setLoading(true);
    try {
      const customer  = customers.find(c => c.id === selectedCustomerId);
      const newTotal  = calculateTotal();
      
      const [year, month, day] = billDate.split('-');
      const finalTimestamp = new Date(year, month - 1, day, 12, 0, 0).getTime();

      if (isEditing) {
        await updateDoc(doc(db, 'bills', id), {
          customerId:   customer.id,
          customerName: customer.name,
          items:        activeItems,
          totalAmount:  newTotal,
          notes:        notes.trim(),
          date:         finalTimestamp,
        });
      } else {
        const billNumber = await generateBillNumber();
        const billId     = billNumber; // use bill number as doc ID
        await setDoc(doc(db, 'bills', billId), {
          billNumber,
          customerId:   customer.id,
          customerName: customer.name,
          date:         finalTimestamp,
          items:        activeItems,
          totalAmount:  newTotal,
          notes:        notes.trim(),
          invoiceId:    null,
          status:       'pending',
        });
      }

      // Optionally save changed prices as customer custom pricing
      if (saveAsCustomPricing) {
        const currentCustomPrices = { ...(customer.customPrices || {}) };
        let hasChanges = false;
        activeItems.forEach(item => {
          const service = services.find(s => s.id === item.id);
          const currentPrice = currentCustomPrices[item.id] !== undefined
            ? currentCustomPrices[item.id]
            : service?.defaultPrice;
          if (item.unitPrice !== currentPrice) {
            currentCustomPrices[item.id] = item.unitPrice;
            hasChanges = true;
          }
        });
        if (hasChanges) {
          await updateDoc(doc(db, 'customers', customer.id), {
            customPrices: currentCustomPrices
          });
        }
      }

      navigate('/bills');
    } catch (error) {
      console.error('Error saving bill:', error);
      reportError(error);
      if (isNetworkError(error)) {
        alert('No internet connection. Please check your network and try again.');
      } else {
        alert('Failed to save bill.');
      }
    }
    setLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!dataLoading && isOfflineError) return <OfflineScreen onRetry={loadData} />;

  if (dataLoading) {
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

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="card">
      <h2 className="card-title">{isEditing ? 'Edit Bill' : 'Create New Bill'}</h2>

      {isEditing && existingBill?.invoiceId && (
        <div className="alert-warning mb-2">
          ⚠️ This bill is already linked to invoice <strong>{existingBill.invoiceId}</strong>. Editing is disabled.
        </div>
      )}

      {/* Customer Selector */}
      <div className="form-group">
        <label htmlFor="bill-customer">Select Customer</label>
        <select
          id="bill-customer"
          className="form-control"
          value={selectedCustomerId}
          onChange={e => setSelectedCustomerId(e.target.value)}
          disabled={isEditing}
        >
          <option value="">-- Choose a customer --</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
          ))}
        </select>
      </div>

      {/* Date Selector */}
      <div className="form-group">
        <label htmlFor="bill-date">Bill Date</label>
        <input
          id="bill-date"
          type="date"
          className="form-control"
          value={billDate}
          onChange={e => setBillDate(e.target.value)}
          disabled={isEditing && existingBill?.invoiceId}
        />
      </div>

      {selectedCustomerId && (
        <form onSubmit={handleSubmit}>
          {/* Bill Items Table */}
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Qty</th>
                  <th>Rate (₹)</th>
                  <th>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="Service" style={{ minWidth: '100px' }}>{item.name}</td>
                    <td data-label="Qty" style={{ minWidth: '72px' }}>
                      <input
                        type="text"
                        className="form-control"
                        value={item.quantity || ''}
                        onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                        onBlur={() => finalizeQuantity(index)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            finalizeQuantity(index);
                          }
                        }}
                        placeholder="0"
                        title="Enter quantity or expression (e.g. 5+10)"
                        disabled={isEditing && existingBill?.invoiceId}
                      />
                    </td>
                    <td data-label="Rate" style={{ minWidth: '86px' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-control"
                        value={item.unitPrice}
                        onChange={e => handleItemChange(index, 'unitPrice', e.target.value)}
                        inputMode="decimal"
                        disabled={isEditing && existingBill?.invoiceId}
                      />
                    </td>
                    <td data-label="Amount" style={{ whiteSpace: 'nowrap', fontWeight: '500', textAlign: 'right', minWidth: '72px' }}>
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="total-section sticky-mobile-total">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
            <div className="total-row grand-total">
              <span>Total:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginTop: '14px' }}>
            <label htmlFor="bill-notes">Notes (optional)</label>
            <input
              id="bill-notes"
              type="text"
              className="form-control"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. urgent, pickup date..."
              disabled={isEditing && existingBill?.invoiceId}
            />
          </div>

          {/* Save custom pricing toggle */}
          {!existingBill?.invoiceId && (
            <div className="form-group" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="save-custom-pricing"
                checked={saveAsCustomPricing}
                onChange={e => setSaveAsCustomPricing(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="save-custom-pricing" style={{ fontSize: '0.88rem', color: 'var(--text-dark)', cursor: 'pointer', fontWeight: '500' }}>
                Save these prices as default for {selectedCustomer?.name || 'this customer'}
              </label>
            </div>
          )}

          {/* Action Buttons */}
          {!existingBill?.invoiceId && (
            <div className="action-row">
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Saving...' : (isEditing ? 'Update Bill' : 'Save Bill')}
              </button>
              <button type="button" onClick={() => navigate('/bills')} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
