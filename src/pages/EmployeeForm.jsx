import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { ArrowLeft, Save } from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';

export default function EmployeeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    designation: 'Laundry Staff',
    joiningDate: format(new Date(), 'yyyy-MM-dd'),
    monthlySalary: '',
    status: 'active',
    notes: ''
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
      if (id) {
        const docSnap = await getDoc(doc(db, 'employees', id));
        if (docSnap.exists()) {
          setFormData(docSnap.data());
        } else {
          navigate('/employees');
          return;
        }
      }
      clearWasOffline();
    } catch (err) {
      console.error('Error loading employee:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataReady(true);
    }
  }, [id, navigate, reportError, clearWasOffline]);

  useEffect(() => {
    loadData();
  }, [id, loadData]);

  // Auto-reload on reconnect
  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline, loadData]);

  const generateEmployeeId = async () => {
    const yearStr = format(new Date(), 'yy');
    const counterRef = doc(db, 'counters', 'employee_sequence');
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
      return `DQ-E${yearStr}-${String(newSequence).padStart(3, '0')}`;
    } catch (e) {
      console.error("Employee counter transaction failed, using timestamp fallback", e);
      return `DQ-E${yearStr}-${Date.now().toString().slice(-6)}`;
    }
  };

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

    const salary = Number(formData.monthlySalary);
    if (isNaN(salary) || salary <= 0) {
      alert("Please enter a valid monthly salary.");
      setLoading(false);
      return;
    }

    try {
      if (id) {
        // Edit existing
        await setDoc(doc(db, 'employees', id), {
          ...formData,
          monthlySalary: salary
        });
      } else {
        // Create new
        const customId = await generateEmployeeId();
        await setDoc(doc(db, 'employees', customId), {
          ...formData,
          id: customId,
          employeeId: customId,
          monthlySalary: salary
        });
      }
      navigate('/employees');
    } catch (error) {
      console.error('Error saving employee:', error);
      reportError(error);
      if (isNetworkError(error)) {
        alert('No internet connection. Please check your network and try again.');
      } else {
        alert('Failed to save employee data.');
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
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Back button */}
      <div className="mb-2">
        <button className="btn btn-secondary" onClick={() => navigate('/employees')}>
          <ArrowLeft size={16} /> Back to Employees
        </button>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ paddingBottom: '12px' }}>
          {id ? `Edit Staff: ${formData.employeeId}` : 'Add New Employee'}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="form-group">
            <label htmlFor="emp-name">Full Name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              id="emp-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="form-control"
              placeholder="e.g. Ramesh Kumar"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="emp-phone">Phone Number</label>
              <input
                id="emp-phone"
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                className="form-control"
                placeholder="+91 XXXXXXXXXX"
                inputMode="numeric"
              />
            </div>

            <div className="form-group">
              <label htmlFor="emp-designation">Designation <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                id="emp-designation"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                required
                className="form-control"
              >
                <option value="Laundry Staff">Laundry Staff</option>
                <option value="Ironing Staff">Ironing Staff</option>
                <option value="Dry Cleaning Expert">Dry Cleaning Expert</option>
                <option value="Delivery Agent">Delivery Agent</option>
                <option value="Store Manager">Store Manager</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Miscellaneous Helper">Miscellaneous Helper</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="emp-salary">Monthly Salary (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="emp-salary"
                type="number"
                name="monthlySalary"
                value={formData.monthlySalary}
                onChange={handleChange}
                required
                className="form-control"
                placeholder="e.g. 15000"
                min="0"
              />
            </div>

            <div className="form-group">
              <label htmlFor="emp-joining">Joining Date <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="emp-joining"
                type="date"
                name="joiningDate"
                value={formData.joiningDate}
                onChange={handleChange}
                required
                className="form-control"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="emp-address">Residential Address</label>
            <textarea
              id="emp-address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="form-control"
              placeholder="Enter full street address"
              rows={3}
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="emp-status">Employment Status <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select
              id="emp-status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="form-control"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="emp-notes">Administrative Notes</label>
            <textarea
              id="emp-notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="form-control"
              placeholder="Payment terms, special constraints, emergency contacts, etc."
              rows={2}
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-mobile-full"
              style={{ gap: '8px' }}
            >
              <Save size={18} />
              {loading ? 'Saving...' : 'Save Employee'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
