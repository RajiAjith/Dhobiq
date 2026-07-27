import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_SERVICES } from '../utils/constants';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';
import { Search, X, Check, ArrowLeft } from 'lucide-react';

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');

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
      <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="loading-pulse">
          <div className="loading-pulse__bar" style={{ width: '40%' }} />
          <div className="loading-pulse__bar" />
          <div className="loading-pulse__bar" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  // Filter services by custom pricing search term
  const filteredServices = services.filter(svc => 
    svc.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  return (
    <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <button 
          type="button" 
          onClick={() => navigate('/customers')} 
          style={{ background: 'rgba(0,0,0,0.03)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, border: 'none' }}>
          {id ? 'Edit Customer Info' : 'Add New Customer'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* Name */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="filter-label" htmlFor="cust-name">Full Name</label>
          <input
            id="cust-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="form-control"
            autoComplete="name"
            style={{ fontSize: '0.8rem', height: '36px' }}
            placeholder="e.g. Ramesh Kumar"
          />
        </div>

        {/* Phone */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="filter-label" htmlFor="cust-phone">Phone Number (Optional)</label>
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
            style={{ fontSize: '0.8rem', height: '36px' }}
          />
        </div>

        {/* Address */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="filter-label" htmlFor="cust-address">Delivery Address</label>
          <textarea
            id="cust-address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            required
            className="form-control"
            rows="2"
            style={{ fontSize: '0.8rem', padding: '8px 10px', minHeight: '60px' }}
            placeholder="e.g. Flat 302, Green Meadows Apartment"
          />
        </div>

        {/* Custom Pricing Divider */}
        <div style={{ marginTop: '4px', borderTop: '1px solid rgba(0, 61, 130, 0.04)', paddingTop: '12px' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 800, margin: 0 }}>
            Custom Rate Overrides
          </h3>
          <p className="text-muted" style={{ fontSize: '0.7rem', margin: '2px 0 8px 0' }}>
            Override standard pricing for this customer. Leave blank to use default rates.
          </p>

          {/* Service Pricing Search */}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Search services (e.g. Bedspread)..."
              value={serviceSearch}
              onChange={e => setServiceSearch(e.target.value)}
              className="form-control"
              style={{ fontSize: '0.78rem', height: '32px', paddingLeft: '32px' }}
            />
            <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            {serviceSearch && (
              <button 
                type="button" 
                onClick={() => setServiceSearch('')} 
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Pricing Grid cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '2px' }}>
            {filteredServices.length > 0 ? (
              filteredServices.map(svc => (
                <div 
                  key={svc.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'var(--surface-overlay)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {svc.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Default: {formatCurrency(svc.defaultPrice)}
                    </div>
                  </div>

                  <div style={{ width: '90px', flexShrink: 0 }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={formData.customPrices?.[svc.id] ?? ''}
                      onChange={e => handlePriceChange(svc.id, e.target.value)}
                      inputMode="decimal"
                      placeholder="Default"
                      style={{ height: '28px', fontSize: '0.78rem', padding: '0 8px', borderRadius: '6px', textAlign: 'right' }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 10px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                No services match your search
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={loading} 
            className="btn btn-primary"
            style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }}
          >
            {loading ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </form>
    </div>
  );
}
