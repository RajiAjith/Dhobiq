import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link, useLocation } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Search, Plus, Edit, Trash2, Phone, Calendar, Briefcase, IndianRupee, History, Users, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';
import { SkeletonList } from '../components/DhobiqLoader';
import { useConfirm } from '../components/ConfirmDialog';

export default function EmployeeList() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tabParam = searchParams.get('tab') || 'directory';

  const [activeTab, setActiveTab] = useState(tabParam);
  const [employees, setEmployees] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [filteredSalaries, setFilteredSalaries] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);

  // Search & Filter
  const [empSearch, setEmpSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [salSearch, setSalSearch] = useState('');

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();
  const [ConfirmUI, confirm] = useConfirm();

  const getIconBg = (name) => {
    if (!name) return 'var(--brand-50)';
    const code = name.charCodeAt(0) % 4;
    return ['var(--brand-50)', 'var(--success-bg)', 'var(--purple-bg)', 'var(--orange-bg)'][code];
  };

  const getIconColor = (name) => {
    if (!name) return 'var(--primary)';
    const code = name.charCodeAt(0) % 4;
    return ['var(--primary)', 'var(--success)', 'var(--purple)', 'var(--orange)'][code];
  };

  const formatCurrencyNoDecimals = (val) => {
    const rounded = Math.round(Number(val) || 0);
    return formatCurrency(rounded).replace(/\.00$/, '');
  };

  // Sync tab active state with location query param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && (tab === 'directory' || tab === 'salaries')) {
      setActiveTab(tab);
    }
  }, [location]);

  const loadData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setIsOfflineError(false);

    try {
      const empQuery = query(collection(db, 'employees'), orderBy('name', 'asc'));
      const salQuery = query(collection(db, 'salary_payments'), orderBy('paymentDate', 'desc'));

      const [empSnap, salSnap] = await Promise.all([
        getDocs(empQuery),
        getDocs(salQuery)
      ]);

      const empList = [];
      empSnap.forEach(d => empList.push({ id: d.id, ...d.data() }));
      setEmployees(empList);

      const salList = [];
      salSnap.forEach(d => salList.push({ id: d.id, ...d.data() }));
      setSalaryPayments(salList);

      clearWasOffline();
    } catch (err) {
      console.error('Error fetching data:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
      else setError('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [reportError, clearWasOffline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline, loadData]);

  // Apply Employee Filters
  useEffect(() => {
    let result = employees;
    if (empSearch.trim()) {
      const s = empSearch.toLowerCase();
      result = result.filter(emp =>
        (emp.employeeId || emp.id || '').toLowerCase().includes(s) ||
        (emp.name || '').toLowerCase().includes(s) ||
        (emp.designation || '').toLowerCase().includes(s) ||
        (emp.phone || '').includes(s)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(emp => emp.status === statusFilter);
    }
    setFilteredEmployees(result);
  }, [empSearch, statusFilter, employees]);

  // Apply Salary Filters
  useEffect(() => {
    let result = salaryPayments;
    if (salSearch.trim()) {
      const s = salSearch.toLowerCase();
      result = result.filter(sal =>
        (sal.employeeName || '').toLowerCase().includes(s) ||
        (sal.notes || '').toLowerCase().includes(s) ||
        (sal.salaryMonth || '').includes(s)
      );
    }
    setFilteredSalaries(result);
  }, [salSearch, salaryPayments]);

  const handleDeleteEmployee = async (empId, name) => {
    const ok = await confirm({
      title: 'Delete Employee?',
      message: `"${name}" will be permanently removed from your staff directory.`,
      confirmLabel: 'Delete Employee',
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'employees', empId));
      setEmployees(employees.filter(e => e.id !== empId));
    } catch (err) {
      console.error('Error deleting employee:', err);
      alert('Failed to delete employee: ' + err.message);
    }
  };

  const handleDeleteSalary = async (paymentId, empName, month, amount, expenseId) => {
    const formattedMonth = formatSalaryMonth(month);
    const ok = await confirm({
      title: 'Delete Salary Payment?',
      message: `${formatCurrency(amount)} payout for ${empName} (${formattedMonth}) and its linked expense record will be permanently deleted.`,
      confirmLabel: 'Delete Payment',
    });
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'salary_payments', paymentId));
      if (expenseId) {
        await deleteDoc(doc(db, 'expenses', expenseId));
      }
      setSalaryPayments(salaryPayments.filter(s => s.id !== paymentId));
    } catch (err) {
      console.error('Error deleting salary payment:', err);
      alert('Failed to delete salary: ' + err.message);
    }
  };

  const formatSalaryMonth = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return format(dateObj, 'MMMM yyyy');
  };

  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={loadData} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      {/* Tab Header Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Staff & Salaries</h2>
          <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: '2px', margin: 0 }}>Configure employees and salary payouts</p>
        </div>
        <div>
          {activeTab === 'directory' ? (
            <Link to="/employees/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Add Employee
            </Link>
          ) : (
            <Link to="/salaries/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Record Payout
            </Link>
          )}
        </div>
      </div>

      {/* Tabs Container */}
      <div className="tabs-container" style={{ margin: 0 }}>
        <button
          className={`tab-btn ${activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => { setActiveTab('directory'); window.history.replaceState(null, '', '/employees?tab=directory'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px' }}
        >
          <Users size={14} /> Staff Directory
        </button>
        <button
          className={`tab-btn ${activeTab === 'salaries' ? 'active' : ''}`}
          onClick={() => { setActiveTab('salaries'); window.history.replaceState(null, '', '/employees?tab=salaries'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px' }}
        >
          <History size={14} /> Salary Payouts
        </button>
      </div>

      {/* RENDER ACTIVE TAB */}
      {activeTab === 'directory' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Staff Search Filters */}
          <div className="filters-section">
            <div className="filter-item">
              <label className="filter-label" htmlFor="emp-search">Search Staff</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="emp-search"
                  type="text"
                  placeholder="Search name, role..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>

            <div className="filter-item">
              <label className="filter-label" htmlFor="emp-status-filter">Status</label>
              <select
                id="emp-status-filter"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="form-control"
              >
                <option value="all">All Employees</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          {/* Directory Content Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loading ? (
              <SkeletonList count={3} />
            ) : error ? (
              <div className="alert-danger" style={{ margin: 0 }}>{error}</div>
            ) : filteredEmployees.length > 0 ? (
              filteredEmployees.map(emp => (
                <div
                  key={emp.id}
                  className="list-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 14px',
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid rgba(0, 61, 130, 0.04)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.01)',
                    margin: 0
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                    {/* Circle Initial Avatar */}
                    <div style={{
                      backgroundColor: getIconBg(emp.name),
                      color: getIconColor(emp.name),
                      width: '36px',
                      height: '36px',
                      minWidth: '36px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                        {emp.name ? emp.name.charAt(0).toUpperCase() : 'S'}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                            {emp.name}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                            ID: {emp.employeeId || emp.id}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrencyNoDecimals(emp.monthlySalary)}
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            <span className={`badge ${emp.status === 'active' ? 'badge-active' : 'badge-inactive'}`} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                              {emp.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Briefcase size={12} style={{ color: 'var(--text-light)' }} />
                      <span>Role: <strong>{emp.designation || 'Staff'}</strong></span>
                    </div>
                    <span>•</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} style={{ color: 'var(--text-light)' }} />
                      <span>Joined: <strong>{emp.joiningDate}</strong></span>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(0, 61, 130, 0.04)'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {emp.phone && (
                        <>
                          <Phone size={12} style={{ color: 'var(--primary)', opacity: 0.7 }} />
                          <span>{emp.phone}</span>
                        </>
                      )}
                    </span>

                    {/* Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Link
                        to={`/employees/${emp.id}`}
                        className="btn-icon"
                        style={{
                          width: '32px',
                          height: '32px',
                          minWidth: '32px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(245, 158, 11, 0.06)',
                          border: '1px solid rgba(245, 158, 11, 0.15)',
                          color: '#d97706',
                          borderRadius: '8px'
                        }}
                        title="Edit Employee"
                      >
                        <Edit size={14} />
                      </Link>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                        className="btn-icon"
                        style={{
                          width: '32px',
                          height: '32px',
                          minWidth: '32px',
                          background: 'rgba(239, 68, 68, 0.06)',
                          border: '1px solid rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                        title="Delete Employee"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff' }}>
                <p className="text-muted" style={{ marginBottom: '16px', fontSize: '0.82rem' }}>No staff members found in directory.</p>
                <Link to="/employees/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Add Staff Member</Link>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Salary Search Filters */}
          <div className="filters-section">
            <div className="filter-item" style={{ gridColumn: 'span 2' }}>
              <label className="filter-label" htmlFor="sal-search">Search Payouts</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="sal-search"
                  type="text"
                  placeholder="Search staff name..."
                  value={salSearch}
                  onChange={e => setSalSearch(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>
          </div>

          {/* Salary History Content Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loading ? (
              <SkeletonList count={3} />
            ) : error ? (
              <div className="alert-danger" style={{ margin: 0 }}>{error}</div>
            ) : filteredSalaries.length > 0 ? (
              filteredSalaries.map(sal => (
                <div
                  key={sal.id}
                  className="list-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 14px',
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid rgba(0, 61, 130, 0.04)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.01)',
                    margin: 0
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                    {/* Circle Green Icon Box */}
                    <div className="icon-box" style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.06)',
                      color: '#10b981',
                      width: '34px',
                      height: '34px',
                      minWidth: '34px',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Wallet size={16} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                            {sal.employeeName}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Salary for: <strong>{formatSalaryMonth(sal.salaryMonth)}</strong>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrencyNoDecimals(sal.amount)}
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            <span className="badge badge-paid" style={{ fontSize: '0.62rem', padding: '2px 6px' }}>Paid</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {sal.notes && (
                    <div style={{
                      marginTop: '10px',
                      backgroundColor: 'var(--surface-overlay)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '0.76rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.3
                    }}>
                      {sal.notes}
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(0, 61, 130, 0.04)'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} style={{ color: 'var(--text-light)' }} />
                      <span>Payout Date: <strong>{sal.paymentDate ? format(new Date(sal.paymentDate), 'dd MMM yyyy') : ''}</strong></span>
                    </span>

                    {/* Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => handleDeleteSalary(sal.id, sal.employeeName, sal.salaryMonth, sal.amount, sal.expenseId)}
                        className="btn-icon"
                        style={{
                          width: '32px',
                          height: '32px',
                          minWidth: '32px',
                          background: 'rgba(239, 68, 68, 0.06)',
                          border: '1px solid rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                        title="Delete Salary Payout"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff' }}>
                <p className="text-muted" style={{ marginBottom: '16px', fontSize: '0.82rem' }}>No salary payouts recorded yet.</p>
                <Link to="/salaries/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Record First Payment</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
