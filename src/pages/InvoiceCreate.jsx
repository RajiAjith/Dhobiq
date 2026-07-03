import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, setDoc, runTransaction, writeBatch, getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { fetchServicesSorted } from '../utils/serviceHelpers';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';

/**
 * Aggregate bill items by (serviceId + unitPrice).
 * Items with same service but different rates remain separate rows.
 */
function aggregateBillItems(selectedBills) {
  const map = {};
  for (const bill of selectedBills) {
    for (const item of (bill.items || [])) {
      const key = `${item.id}::${item.unitPrice}`;
      if (map[key]) {
        map[key].quantity += Number(item.quantity) || 0;
        map[key].total    += Number(item.total)    || 0;
      } else {
        map[key] = {
          id:        item.id,
          name:      item.name,
          unitPrice: item.unitPrice,
          quantity:  Number(item.quantity) || 0,
          total:     Number(item.total)    || 0,
        };
      }
    }
  }
  return Object.values(map);
}

export default function InvoiceCreate() {
  const [customers,      setCustomers]      = useState([]);
  const [services,       setServices]       = useState([]);
  const [customerId,     setCustomerId]     = useState('');
  const [periodFrom,     setPeriodFrom]     = useState('');
  const [periodTo,       setPeriodTo]       = useState('');
  const [availableBills, setAvailableBills] = useState([]);
  const [selectedBillIds, setSelectedBillIds] = useState(new Set());
  const [aggregatedItems, setAggregatedItems] = useState([]);
  const [billsLoading,   setBillsLoading]   = useState(false);
  const [dataLoading,    setDataLoading]    = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);
  const [fetched,        setFetched]        = useState(false);

  const navigate = useNavigate();
  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  // ── Initial data load ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!navigator.onLine) { setIsOfflineError(true); setDataLoading(false); return; }
    setDataLoading(true);
    setIsOfflineError(false);
    try {
      const [custSnap, svcList] = await Promise.all([
        getDocs(collection(db, 'customers')),
        fetchServicesSorted(),
      ]);
      const custData = [];
      custSnap.forEach(d => custData.push({ id: d.id, ...d.data() }));
      setCustomers(custData);
      setServices(svcList);

      // Default period = current month
      const now   = new Date();
      const from  = startOfMonth(now);
      const to    = endOfMonth(now);
      setPeriodFrom(format(from, 'yyyy-MM-dd'));
      setPeriodTo(format(to,   'yyyy-MM-dd'));

      clearWasOffline();
    } catch (err) {
      console.error('Error loading data:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataLoading(false);
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOnline && wasOffline) loadData(); }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch uninvoiced bills for selected customer + period ──────────────────
  const fetchBills = async () => {
    if (!customerId || !periodFrom || !periodTo) {
      alert('Please select a customer and date range first.');
      return;
    }
    setBillsLoading(true);
    setFetched(false);
    setAvailableBills([]);
    setSelectedBillIds(new Set());
    setAggregatedItems([]);
    try {
      const billSnap = await getDocs(collection(db, 'bills'));
      const allBills = [];
      billSnap.forEach(d => allBills.push({ id: d.id, ...d.data() }));

      const fromTs = new Date(periodFrom).setHours(0, 0, 0, 0);
      const toTs   = new Date(periodTo).setHours(23, 59, 59, 999);

      const filtered = allBills.filter(b =>
        b.customerId === customerId &&
        !b.invoiceId &&               // only uninvoiced
        b.date >= fromTs &&
        b.date <= toTs
      );
      filtered.sort((a, b) => a.date - b.date);
      setAvailableBills(filtered);
      // Auto-select all fetched bills
      setSelectedBillIds(new Set(filtered.map(b => b.id)));
      setFetched(true);
    } catch (err) {
      console.error('Error fetching bills:', err);
      reportError(err);
      alert('Failed to fetch bills.');
    } finally {
      setBillsLoading(false);
    }
  };

  // ── Re-aggregate whenever selection changes ────────────────────────────────
  useEffect(() => {
    const selected = availableBills.filter(b => selectedBillIds.has(b.id));
    const sortOrder = {};
    services.forEach((s, i) => { sortOrder[s.id] = i; });
    const agg = aggregateBillItems(selected).sort((a, b) => {
      const ao = sortOrder[a.id] ?? Infinity;
      const bo = sortOrder[b.id] ?? Infinity;
      return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
    });
    setAggregatedItems(agg);
  }, [selectedBillIds, availableBills, services]);

  const toggleBill = (billId) => {
    setSelectedBillIds(prev => {
      const next = new Set(prev);
      next.has(billId) ? next.delete(billId) : next.add(billId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedBillIds.size === availableBills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(availableBills.map(b => b.id)));
    }
  };

  const totalAmount = aggregatedItems.reduce((s, i) => s + i.total, 0);

  // ── Invoice number generation ──────────────────────────────────────────────
  const generateInvoiceNumber = async () => {
    const now     = new Date();
    const monthKey = format(now, 'yyyyMM');
    const counterRef = doc(db, 'counters', `invoice_${monthKey}`);
    let newSequence  = 1;

    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { seq: 1 });
      } else {
        newSequence = counterDoc.data().seq + 1;
        transaction.update(counterRef, { seq: newSequence });
      }
    });

    return `INV-${monthKey}-${String(newSequence).padStart(3, '0')}`;
  };

  // ── Save invoice ───────────────────────────────────────────────────────────
  const handleGenerateInvoice = async () => {
    if (selectedBillIds.size === 0) {
      alert('Please select at least one bill to include in the invoice.');
      return;
    }
    setSaving(true);
    try {
      const customer  = customers.find(c => c.id === customerId);
      const invoiceNumber = await generateInvoiceNumber();

      // Save invoice doc
      await setDoc(doc(db, 'invoices', invoiceNumber), {
        invoiceNumber,
        customerId:    customer.id,
        customerName:  customer.name,
        invoiceDate:   Date.now(),
        periodFrom:    new Date(periodFrom).setHours(0, 0, 0, 0),
        periodTo:      new Date(periodTo).setHours(23, 59, 59, 999),
        billIds:       [...selectedBillIds],
        items:         aggregatedItems,
        totalAmount,
        amountPaid:    0,
        balanceAmount: totalAmount,
        paymentStatus: 'unpaid',
        payments:      [],
      });

      // Mark each included bill as invoiced (batch)
      const batch = writeBatch(db);
      for (const billId of selectedBillIds) {
        batch.update(doc(db, 'bills', billId), {
          invoiceId: invoiceNumber,
          status:    'invoiced',
        });
      }
      await batch.commit();

      navigate(`/invoices/${invoiceNumber}`);
    } catch (err) {
      console.error('Error generating invoice:', err);
      reportError(err);
      if (isNetworkError(err)) {
        alert('No internet connection. Please check your network.');
      } else {
        alert('Failed to generate invoice.');
      }
    } finally {
      setSaving(false);
    }
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

  return (
    <div>
      {/* Step 1 — Select Customer & Period */}
      <div className="card">
        <h2 className="card-title">Generate Monthly Invoice</h2>

        <div className="invoice-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="form-group">
            <label htmlFor="inv-customer">Customer</label>
            <select
              id="inv-customer"
              className="form-control"
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); setFetched(false); setAvailableBills([]); setAggregatedItems([]); setSelectedBillIds(new Set()); }}
            >
              <option value="">-- Select customer --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="inv-from">From Date</label>
            <input
              id="inv-from"
              type="date"
              className="form-control"
              value={periodFrom}
              onChange={e => { setPeriodFrom(e.target.value); setFetched(false); }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="inv-to">To Date</label>
            <input
              id="inv-to"
              type="date"
              className="form-control"
              value={periodTo}
              onChange={e => { setPeriodTo(e.target.value); setFetched(false); }}
            />
          </div>
        </div>

        <div className="action-row" style={{ marginTop: '8px' }}>
          <button
            className="btn btn-primary"
            onClick={fetchBills}
            disabled={billsLoading || !customerId || !periodFrom || !periodTo}
          >
            {billsLoading ? 'Fetching...' : '🔍 Fetch Uninvoiced Bills'}
          </button>
        </div>
      </div>

      {/* Step 2 — Select Bills */}
      {fetched && (
        <div className="card">
          <h3 className="card-title">Select Bills to Include</h3>

          {availableBills.length === 0 ? (
            <p className="text-muted">No uninvoiced bills found for this customer in the selected period.</p>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table card-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedBillIds.size === availableBills.length}
                          onChange={toggleAll}
                          style={{ cursor: 'pointer' }}
                          title="Select all"
                        />
                      </th>
                      <th>Bill #</th>
                      <th>Date</th>
                      <th>Items</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableBills.map(bill => (
                      <tr
                        key={bill.id}
                        onClick={() => toggleBill(bill.id)}
                        style={{ cursor: 'pointer', background: selectedBillIds.has(bill.id) ? 'var(--primary-light)' : '' }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBillIds.has(bill.id)}
                            onChange={() => toggleBill(bill.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{bill.billNumber || bill.id}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                          {bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
                          {(bill.items || []).filter(i => i.quantity > 0).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                        </td>
                        <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{formatCurrency(Number(bill.totalAmount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: '6px' }}>
                {selectedBillIds.size} of {availableBills.length} bill{availableBills.length > 1 ? 's' : ''} selected
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 3 — Consolidated Preview */}
      {aggregatedItems.length > 0 && (
        <div className="card">
          <h3 className="card-title">Consolidated Invoice Preview</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '12px' }}>
            Items with same service and same rate are merged. Different rates remain separate.
          </p>

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
                {aggregatedItems.map((item, i) => (
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
            <div className="total-row grand-total">
              <span>Invoice Total:</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="action-row" style={{ marginTop: '16px' }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerateInvoice}
              disabled={saving}
            >
              {saving ? 'Generating...' : '📄 Generate & Save Invoice'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/invoices')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
