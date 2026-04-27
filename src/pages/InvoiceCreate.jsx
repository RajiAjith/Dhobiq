import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_SERVICES } from '../utils/constants';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

async function fetchServicesFromDB() {
  const snapshot = await getDocs(collection(db, 'services'));
  const data = [];
  snapshot.forEach(d => data.push({ id: d.id, ...d.data() }));
  if (data.length === 0) return FALLBACK_SERVICES;
  return data.sort((a, b) => a.name.localeCompare(b.name));
}

export default function InvoiceCreate() {
  const [customers,          setCustomers]          = useState([]);
  const [services,           setServices]           = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [items,              setItems]              = useState([]);
  const [loading,            setLoading]            = useState(false);
  const [dataLoading,        setDataLoading]        = useState(true);
  const navigate = useNavigate();

  // Load customers + services on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [custSnapshot, svcList] = await Promise.all([
          getDocs(collection(db, 'customers')),
          fetchServicesFromDB(),
        ]);
        const custData = [];
        custSnapshot.forEach(d => custData.push({ id: d.id, ...d.data() }));
        setCustomers(custData);
        setServices(svcList);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, []);

  // Re-build line items whenever customer or services change
  useEffect(() => {
    if (!selectedCustomerId || services.length === 0) {
      setItems([]);
      return;
    }
    const customer = customers.find(c => c.id === selectedCustomerId);
    const initialItems = services.map(svc => {
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
  }, [selectedCustomerId, customers, services]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = Number(value);
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
    }
    setItems(newItems);
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + item.total, 0);

  const generateInvoiceNumber = async () => {
    const today   = new Date();
    const dateStr = format(today, 'yyyyMMdd');
    const counterRef = doc(db, 'counters', `invoice_${dateStr}`);
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

    return `DL-${dateStr}-${String(newSequence).padStart(3, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const activeItems = items.filter(item => item.quantity > 0);
    if (activeItems.length === 0) {
      alert('Please add at least one item with a quantity greater than 0');
      return;
    }
    setLoading(true);
    try {
      const invoiceNumber = await generateInvoiceNumber();
      const customer      = customers.find(c => c.id === selectedCustomerId);
      await setDoc(doc(db, 'invoices', invoiceNumber), {
        invoiceNumber,
        customerId:   customer.id,
        customerName: customer.name,
        date:         Date.now(),
        items:        activeItems,
        totalAmount:  calculateTotal(),
      });
      navigate('/invoices');
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice.');
    }
    setLoading(false);
  };

  if (dataLoading) {
    return (
      <div className="card">
        <p className="text-muted">Loading data...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="card-title">Create New Invoice</h2>

      {/* Customer Selector */}
      <div className="form-group">
        <label htmlFor="invoice-customer">Select Customer</label>
        <select
          id="invoice-customer"
          className="form-control"
          value={selectedCustomerId}
          onChange={e => setSelectedCustomerId(e.target.value)}
        >
          <option value="">-- Choose a customer --</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
          ))}
        </select>
      </div>

      {selectedCustomerId && (
        <form onSubmit={handleSubmit}>
          {/* Invoice Items Table */}
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Qty</th>
                  <th>Price (₹)</th>
                  <th>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="Service" style={{ minWidth: '100px' }}>{item.name}</td>
                    <td data-label="Qty" style={{ minWidth: '72px' }}>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={item.quantity || ''}
                        onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </td>
                    <td data-label="Price" style={{ minWidth: '86px' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-control"
                        value={item.unitPrice}
                        onChange={e => handleItemChange(index, 'unitPrice', e.target.value)}
                        inputMode="decimal"
                      />
                    </td>
                    <td data-label="Total" style={{ whiteSpace: 'nowrap', fontWeight: '500', textAlign: 'right', minWidth: '72px' }}>
                      ₹{item.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="total-section">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>₹{calculateTotal().toFixed(2)}</span>
            </div>
            <div className="total-row grand-total">
              <span>Total:</span>
              <span>₹{calculateTotal().toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-row">
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Generating Invoice...' : 'Save Invoice'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
