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
import { Plus, Minus, Check, X, Search, AlertCircle } from 'lucide-react';

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
  const [itemSearch,         setItemSearch]         = useState('');

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

  const handleIncrement = (index) => {
    const newItems = [...items];
    const currentVal = evaluateExpr(newItems[index].quantity);
    const newVal = currentVal + 1;
    newItems[index].quantity = newVal;
    newItems[index].total = newVal * newItems[index].unitPrice;
    setItems(newItems);
  };

  const handleDecrement = (index) => {
    const newItems = [...items];
    const currentVal = evaluateExpr(newItems[index].quantity);
    if (currentVal <= 0) return;
    const newVal = Math.max(0, currentVal - 1);
    newItems[index].quantity = newVal;
    newItems[index].total = newVal * newItems[index].unitPrice;
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
    const activeItems = items.filter(item => evaluateExpr(item.quantity) > 0);
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

      const finalActiveItems = activeItems.map(item => ({
        ...item,
        quantity: evaluateExpr(item.quantity)
      }));

      if (isEditing) {
        await updateDoc(doc(db, 'bills', id), {
          customerId:   customer.id,
          customerName: customer.name,
          items:        finalActiveItems,
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
          items:        finalActiveItems,
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
        finalActiveItems.forEach(item => {
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

  if (!dataLoading && isOfflineError) return <OfflineScreen onRetry={loadData} />;

  if (dataLoading) {
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

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  
  // Filter items matching search OR items already containing quantity > 0
  const visibleItems = items.map((item, idx) => ({ ...item, originalIndex: idx }))
    .filter(item => 
      item.name.toLowerCase().includes(itemSearch.toLowerCase()) || 
      evaluateExpr(item.quantity) > 0
    );

  return (
    <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', border: 'none' }}>
        {isEditing ? 'Edit Bill Details' : 'Create New Bill'}
      </h2>

      {isEditing && existingBill?.invoiceId && (
        <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '10px 12px', borderRadius: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706' }}>
          <AlertCircle size={15} />
          <span style={{ fontSize: '0.76rem', fontWeight: 700 }}>
            This bill is locked because it is linked to Invoice #{existingBill.invoiceId}
          </span>
        </div>
      )}

      {/* Customer & Date Selector Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="filter-label" htmlFor="bill-customer">Select Customer</label>
          <select
            id="bill-customer"
            className="form-control"
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value)}
            disabled={isEditing}
            style={{ fontSize: '0.8rem', height: '36px' }}
          >
            <option value="">-- Choose Customer --</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="filter-label" htmlFor="bill-date">Bill Date</label>
          <input
            id="bill-date"
            type="date"
            className="form-control"
            value={billDate}
            onChange={e => setBillDate(e.target.value)}
            disabled={isEditing && existingBill?.invoiceId}
            style={{ fontSize: '0.8rem', height: '36px' }}
          />
        </div>
      </div>

      {selectedCustomer && (
        <div style={{ background: 'rgba(2, 132, 199, 0.04)', border: '1px solid rgba(2, 132, 199, 0.1)', padding: '10px 12px', borderRadius: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)' }}>Customer Info:</span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            📞 Phone: <strong>{selectedCustomer.phone || 'N/A'}</strong>
            {selectedCustomer.customPrices && Object.keys(selectedCustomer.customPrices).length > 0 && (
              <span style={{ marginLeft: '10px', color: 'var(--success)', fontWeight: 700 }}>✓ Custom Prices Loaded</span>
            )}
          </span>
        </div>
      )}

      {selectedCustomerId && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Services Search Bar */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search services (e.g. Bedspread, Shirt)..."
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              className="form-control"
              style={{ fontSize: '0.8rem', height: '36px', paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            {itemSearch && (
              <button 
                type="button" 
                onClick={() => setItemSearch('')} 
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* List Cards for Services */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
            {visibleItems.length > 0 ? (
              visibleItems.map(item => (
                <div 
                  key={item.id} 
                  className="list-card" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    padding: '12px 14px', 
                    background: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid rgba(0, 61, 130, 0.04)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.01)',
                    margin: 0
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{item.name}</span>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--primary)' }}>
                      Total: {formatCurrency(item.total)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', borderTop: '1px solid rgba(0, 61, 130, 0.04)', paddingTop: '8px', marginTop: '6px' }}>
                    {/* Qty Field */}
                    <div>
                      <label className="filter-label" style={{ marginBottom: '4px', fontSize: '0.66rem' }}>Qty (or expression)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '28px', height: '28px', minWidth: '28px', padding: 0, borderRadius: '6px', background: 'rgba(0,0,0,0.03)', border: 'none' }}
                          onClick={() => handleDecrement(item.originalIndex)}
                          disabled={isEditing && existingBill?.invoiceId}
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="text"
                          className="form-control"
                          style={{ height: '28px', padding: '0 4px', textAlign: 'center', fontSize: '0.8rem', borderRadius: '6px' }}
                          value={item.quantity || ''}
                          onChange={e => handleItemChange(item.originalIndex, 'quantity', e.target.value)}
                          onBlur={() => finalizeQuantity(item.originalIndex)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              finalizeQuantity(item.originalIndex);
                            }
                          }}
                          placeholder="0"
                          disabled={isEditing && existingBill?.invoiceId}
                        />
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '28px', height: '28px', minWidth: '28px', padding: 0, borderRadius: '6px', background: 'rgba(0,0,0,0.03)', border: 'none' }}
                          onClick={() => handleIncrement(item.originalIndex)}
                          disabled={isEditing && existingBill?.invoiceId}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Unit Price Field */}
                    <div>
                      <label className="filter-label" style={{ marginBottom: '4px', fontSize: '0.66rem' }}>Rate (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-control"
                        style={{ height: '28px', fontSize: '0.8rem', padding: '0 8px', borderRadius: '6px' }}
                        value={item.unitPrice}
                        onChange={e => handleItemChange(item.originalIndex, 'unitPrice', e.target.value)}
                        inputMode="decimal"
                        disabled={isEditing && existingBill?.invoiceId}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No services match your search
              </div>
            )}
          </div>

          {/* Sticky Total Panel */}
          <div style={{ background: 'var(--surface-overlay)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <span>Subtotal:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
              <span>Grand Total:</span>
              <span style={{ color: 'var(--primary)' }}>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="filter-label" htmlFor="bill-notes">Notes (optional)</label>
            <input
              id="bill-notes"
              type="text"
              className="form-control"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. urgent delivery, iron only..."
              disabled={isEditing && existingBill?.invoiceId}
              style={{ fontSize: '0.8rem', height: '36px' }}
            />
          </div>

          {/* Save custom pricing checkbox */}
          {!existingBill?.invoiceId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-overlay)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <input
                type="checkbox"
                id="save-custom-pricing"
                checked={saveAsCustomPricing}
                onChange={e => setSaveAsCustomPricing(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="save-custom-pricing" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                Save updated prices as default for {selectedCustomer?.name || 'this customer'}
              </label>
            </div>
          )}

          {/* Action buttons */}
          {!existingBill?.invoiceId && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button 
                type="button" 
                onClick={() => navigate('/bills')} 
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px 16px', fontSize: '0.8rem', borderRadius: '12px' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={loading} 
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px 16px', fontSize: '0.8rem', borderRadius: '12px' }}
              >
                {loading ? 'Saving...' : (isEditing ? 'Update Bill' : 'Save Bill')}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
