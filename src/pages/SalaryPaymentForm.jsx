import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, setDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { ArrowLeft, Save } from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';

export default function SalaryPaymentForm() {
  const navigate = useNavigate();
  const [employees,     setEmployees]     = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, reportError } = useNetwork();

  const [formData, setFormData] = useState({
    employeeId: '',
    employeeName: '',
    salaryMonth: format(new Date(), 'yyyy-MM'),
    amount: '',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
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
      // Fetch only active employees
      const q = query(collection(db, 'employees'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setEmployees(list);
    } catch (err) {
      console.error('Error fetching employees for salary:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataReady(true);
    }
  }, [reportError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline, loadData]);

  const handleEmployeeChange = (e) => {
    const selectedId = e.target.value;
    const selectedEmp = employees.find(emp => emp.id === selectedId);

    if (selectedEmp) {
      setFormData({
        ...formData,
        employeeId: selectedId,
        employeeName: selectedEmp.name,
        amount: selectedEmp.monthlySalary || ''
      });
    } else {
      setFormData({
        ...formData,
        employeeId: '',
        employeeName: '',
        amount: ''
      });
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.employeeId) {
      alert("Please select an employee.");
      setLoading(false);
      return;
    }

    const payAmount = Number(formData.amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      alert("Please enter a valid salary amount.");
      setLoading(false);
      return;
    }

    try {
      const salaryRef = doc(collection(db, 'salary_payments'));
      const expenseRef = doc(collection(db, 'expenses'));

      // Create salary payment document
      const salaryPaymentObj = {
        id: salaryRef.id,
        employeeId: formData.employeeId,
        employeeName: formData.employeeName,
        salaryMonth: formData.salaryMonth,
        amount: payAmount,
        paymentDate: formData.paymentDate,
        notes: formData.notes,
        expenseId: expenseRef.id, // reference to corresponding expense
        createdAt: new Date().toISOString()
      };

      // Create corresponding expense document (links back to salaryPaymentId)
      // Format month string (e.g. '2026-05' to 'May 2026') for cleaner descriptions
      const [year, month] = formData.salaryMonth.split('-');
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const formattedMonth = `${monthNames[parseInt(month, 10) - 1]} ${year}`;

      const expenseObj = {
        id: expenseRef.id,
        date: formData.paymentDate,
        category: 'Salary',
        amount: payAmount,
        description: `Salary Payment - ${formData.employeeName} (${formattedMonth})`,
        vendor: `Employee: ${formData.employeeName}`,
        paymentMethod: 'Cash',
        notes: formData.notes,
        salaryPaymentId: salaryRef.id, // links back
        createdAt: new Date().toISOString()
      };

      // Write both documents to Firestore
      await setDoc(salaryRef, salaryPaymentObj);
      await setDoc(expenseRef, expenseObj);

      // Redirect back to employees with salary history tab hint
      navigate('/employees?tab=salaries');

    } catch (err) {
      console.error('Error saving salary payment:', err);
      reportError(err);
      if (isNetworkError(err)) {
        alert('No internet connection. Please verify your connection and try again.');
      } else {
        alert('Failed to save salary payment.');
      }
    } finally {
      setLoading(false);
    }
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
      {/* Back Link */}
      <div className="mb-2">
        <button className="btn btn-secondary" onClick={() => navigate('/employees?tab=salaries')}>
          <ArrowLeft size={16} /> Back to Staff
        </button>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ paddingBottom: '12px' }}>Record Salary Payment</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div className="form-group">
            <label htmlFor="sal-employee">Select Employee <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select
              id="sal-employee"
              value={formData.employeeId}
              onChange={handleEmployeeChange}
              required
              className="form-control"
            >
              <option value="">-- Choose Active Employee --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.designation}) - {formatCurrency(Number(emp.monthlySalary || 0))}/mo
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="sal-month">Salary Month <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="sal-month"
                type="month"
                name="salaryMonth"
                value={formData.salaryMonth}
                onChange={handleChange}
                required
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="sal-date">Payment Date <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="sal-date"
                type="date"
                name="paymentDate"
                value={formData.paymentDate}
                onChange={handleChange}
                required
                className="form-control"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="sal-amount">Amount (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              id="sal-amount"
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              required
              className="form-control"
              placeholder="Enter salary payment amount"
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="sal-notes">Payment Notes</label>
            <textarea
              id="sal-notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="form-control"
              placeholder="Payment method details, transaction reference, bonuses/deductions, etc."
              rows={3}
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              type="submit"
              disabled={loading || !formData.employeeId}
              className="btn btn-primary btn-mobile-full"
              style={{ gap: '8px' }}
            >
              <Save size={18} />
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
