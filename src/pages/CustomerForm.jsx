import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_SERVICES } from '../utils/constants';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    customPrices: {}
  });

  const loadData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setDataReady(false);
      return;
    }
    setDataReady(false);
    setIsOfflineError(false);

    try {
      const svcSnap = await getDocs(collection(db, 'services'));
      const svcData = [];
      svcSnap.forEach(d => svcData.push({ id: d.id, ...d.data() }));
      const resolvedServices = svcData.length > 0
        ? svcData.sort((a, b) => a.name.localeCompare(b.name))
        : FALLBACK_SERVICES;
      setServices(resolvedServices);

      if (id) {
        const docSnap = await getDoc(doc(db, 'customers', id));
        if (docSnap.exists()) setFormData(docSnap.data());
      }
      clearWasOffline();
    } catch (err) {
      console.error('Error loading data:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataReady(true);
    }
  }, [id, reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [id, loadData]);

  const generateCustomerId = async () => {
    const yearStr = format(new Date(), 'yy');
    const counterRef = doc(db, 'counters', 'customer_sequence');
    let newSequence = 1;

    try {
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists()) {
          transaction.set(counterRef, { seq: 1 });
        } else {
          newSequence = counterDoc.data().seq + 1;
          transaction.update(counterRef, { seq: newSequence });
        }
      });
      return `DQ-C${yearStr}-${String(newSequence).padStart(3, '0')}`;
    } catch (e) {
      console.error("Transaction failed, using timestamp fallback", e);
      return `DQ-C${yearStr}-${Date.now().toString().slice(-6)}`;
    }
  };

  // Auto-reload on reconnect
  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline, loadData]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value;
    if (!val || val === '+91 ' || val === '+91') {
      setFormData({ ...formData, phone: '' });
      return;
    }
    let prefix = '+91 ';
    let rawInput = val.startsWith(prefix) ? val.slice(prefix.length) : val;
    if (val.startsWith('+91') && !val.startsWith('+91 ')) {
      rawInput = val.slice(3);
    }
    let digits = rawInput.replace(/\D/g, '');
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }
    setFormData({ ...formData, phone: prefix + digits });
  };

  const handlePriceChange = (serviceId, value) => {
    setFormData({
      ...formData,
      customPrices: {
        ...formData.customPrices,
        [serviceId]: value === '' ? '' : Number(value)
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (formData.phone) {
      const digits = formData.phone.replace('+91', '').replace(/\s+/g, '').trim();
      if (!/^\d{10}$/.test(digits)) {
        alert("Please enter exactly 10 digits for the mobile number.");
        setLoading(false);
        return;
      }
    }

    try {
      if (id) {
        await setDoc(doc(db, 'customers', id), formData);
      } else {
        const customId = await generateCustomerId();
        await setDoc(doc(db, 'customers', customId), {
          ...formData,
          id: customId
        });
      }
      navigate('/customers');
    } catch (error) {
      console.error('Error saving customer:', error);
      reportError(error);
      if (isNetworkError(error)) {
        alert('No internet connection. Please check your network and try again.');
      } else {
        alert('Failed to save customer');
      }
    }
    setLoading(false);
  };

  if (!dataReady && isOfflineError) {
    return <OfflineScreen onRetry={loadData} />;
  }

  if (!dataReady) {
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
    <div className="card">
      <h2 className="card-title">{id ? 'Edit Customer' : 'Add New Customer'}</h2>
      <form onSubmit={handleSubmit}>

        {/* ── Basic Info ─────────────────────────────── */}
        <div className="form-group">
          <label htmlFor="cust-name">Name</label>
          <input
            id="cust-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="form-control"
            autoComplete="name"
          />
        </div>
        <div className="form-group">
          <label htmlFor="cust-phone">Phone (Optional)</label>
          <input
            id="cust-phone"
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handlePhoneChange}
            className="form-control"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="+91 "
            maxLength="14"
          />
        </div>
        <div className="form-group">
          <label htmlFor="cust-address">Address</label>
          <textarea
            id="cust-address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            required
            className="form-control"
            rows="3"
          />
        </div>

        {/* ── Custom Pricing ─────────────────────────── */}
        <div style={{ marginTop: '16px', marginBottom: '8px' }}>
          <h3 style={{ color: 'var(--primary)', fontSize: '1rem', marginBottom: '4px' }}>
            Custom Pricing
          </h3>
          <p className="text-muted">Leave blank to use the default price.</p>
        </div>

        <div className="table-responsive">
          <table className="table card-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Default (₹)</th>
                <th>Custom (₹)</th>
              </tr>
            </thead>
            <tbody>
              {services.map(svc => (
                <tr key={svc.id}>
                  <td data-label="Service" style={{ fontWeight: 500 }}>{svc.name}</td>
                  <td data-label="Default" style={{ whiteSpace: 'nowrap', color: 'var(--text-light)' }}>
                    ₹{svc.defaultPrice}
                  </td>
                  <td data-label="Custom (₹)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={formData.customPrices?.[svc.id] ?? ''}
                      onChange={e => handlePriceChange(svc.id, e.target.value)}
                      inputMode="decimal"
                      placeholder="Default"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Action Buttons ─────────────────────────── */}
        <div className="action-row">
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Saving...' : 'Save Customer'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
