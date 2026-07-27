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
import { Calendar, User, Search, FileText, CheckSquare, Square, Check, X, Info, Receipt } from 'lucide-react';

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
        !b.invoiceId &&               
        b.date >= fromTs &&
        b.date <= toTs
      );
      filtered.sort((a, b) => a.date - b.date);
      setAvailableBills(filtered);
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

  const handleGenerateInvoice = async () => {
    if (selectedBillIds.size === 0) {
      alert('Please select at least one bill to include in the invoice.');
      return;
    }
    setSaving(true);
    try {
      const customer  = customers.find(c => c.id === customerId);
      const invoiceNumber = await generateInvoiceNumber();

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

  const selectedCustomer = customers.find(c => c.id === customerId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {/* Step 1 — Select Customer & Period */}
      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', border: 'none' }}>
          Generate Invoice
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="filter-label" htmlFor="inv-customer">Customer</label>
            <select
              id="inv-customer"
              className="form-control"
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); setFetched(false); setAvailableBills([]); setAggregatedItems([]); setSelectedBillIds(new Set()); }}
              style={{ fontSize: '0.8rem', height: '36px' }}
            >
              <option value="">-- Choose Customer --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedCustomer && (
            <div style={{ background: 'rgba(2, 132, 199, 0.04)', border: '1px solid rgba(2, 132, 199, 0.1)', padding: '10px 12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)' }}>Customer Details:</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>📞 Phone: <strong>{selectedCustomer.phone || 'N/A'}</strong></span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="inv-from">From Date</label>
              <input
                id="inv-from"
                type="date"
                className="form-control"
                value={periodFrom}
                onChange={e => { setPeriodFrom(e.target.value); setFetched(false); }}
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="inv-to">To Date</label>
              <input
                id="inv-to"
                type="date"
                className="form-control"
                value={periodTo}
                onChange={e => { setPeriodTo(e.target.value); setFetched(false); }}
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={fetchBills}
          disabled={billsLoading || !customerId || !periodFrom || !periodTo}
          style={{ width: '100%', marginTop: '16px', padding: '10px', fontSize: '0.82rem', borderRadius: '12px', height: '38px' }}
        >
          {billsLoading ? 'Fetching Bills...' : 'Fetch Uninvoiced Bills'}
        </button>
      </div>

      {/* Step 2 — Select Bills */}
      {fetched && (
        <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Select Bills ({availableBills.length})
            </h3>
            {availableBills.length > 0 && (
              <button 
                type="button" 
                onClick={toggleAll}
                style={{ 
                  background: 'rgba(2, 132, 199, 0.06)', 
                  border: '1px solid rgba(2, 132, 199, 0.15)', 
                  color: 'var(--primary)',
                  fontSize: '0.74rem', 
                  fontWeight: 700, 
                  padding: '4px 10px', 
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {selectedBillIds.size === availableBills.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {availableBills.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'center', margin: '10px 0' }}>
              No uninvoiced bills found for this period.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '2px' }}>
              {availableBills.map(bill => {
                const isSelected = selectedBillIds.has(bill.id);
                return (
                  <div
                    key={bill.id}
                    onClick={() => toggleBill(bill.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      background: '#ffffff',
                      borderRadius: '14px',
                      border: isSelected ? '1.5px solid var(--primary)' : '1px solid rgba(0, 61, 130, 0.04)',
                      boxShadow: isSelected ? '0 4px 10px rgba(0, 61, 130, 0.04)' : '0 2px 6px rgba(0,0,0,0.01)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {bill.billNumber || bill.id}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Date: {bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {formatCurrency(Number(bill.totalAmount))}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(bill.items || []).filter(i => i.quantity > 0).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {availableBills.length > 0 && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 600 }}>
              {selectedBillIds.size} of {availableBills.length} bills selected for aggregation
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Consolidated Preview */}
      {aggregatedItems.length > 0 && (
        <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
          <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Consolidated Preview
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Identical services and prices are automatically aggregated.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '2px' }}>
            {aggregatedItems.map((item, i) => (
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

          <div style={{ background: 'var(--primary-light)', borderRadius: '12px', padding: '10px 12px', marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--primary)' }}>Invoice Total:</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>{formatCurrency(totalAmount)}</span>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/invoices')}
              style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleGenerateInvoice}
              disabled={saving}
              style={{ flex: 1.5, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }}
            >
              {saving ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
