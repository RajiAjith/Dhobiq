import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link, useLocation } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Search, Plus, Edit, Trash2, Phone, Calendar, Briefcase, IndianRupee, History, Users } from 'lucide-react';
import { format } from 'date-fns';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';

export default function EmployeeList() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tabParam = searchParams.get('tab') || 'directory';

  const [activeTab,      setActiveTab]      = useState(tabParam);
  const [employees,     setEmployees]     = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [filteredSalaries,  setFilteredSalaries]  = useState([]);
  
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);

  // Search & Filter
  const [empSearch,    setEmpSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [salSearch,    setSalSearch]    = useState('');

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

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
    if (!window.confirm(`Are you sure you want to delete employee "${name}"?`)) return;
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
    if (!window.confirm(`Are you sure you want to delete the salary payment of ${formatCurrency(amount)} for ${empName} (${formattedMonth})?\n\nThis will also delete the corresponding expense calculation record.`)) return;

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
    <div>
      {/* Tab Header Selector */}
      <div className="flex-between mb-2" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Staff & Salaries</h2>
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>Configure employees, track attendance values and salary payouts</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {activeTab === 'directory' ? (
            <Link to="/employees/new" className="btn btn-primary">
              <Plus size={16} /> Add Employee
            </Link>
          ) : (
            <Link to="/salaries/new" className="btn btn-primary">
              <Plus size={16} /> Record Salary
            </Link>
          )}
        </div>
      </div>

      {/* Tabs Container */}
      <div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => { setActiveTab('directory'); window.history.replaceState(null, '', '/employees?tab=directory'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Users size={16} /> Staff Directory
        </button>
        <button 
          className={`tab-btn ${activeTab === 'salaries' ? 'active' : ''}`}
          onClick={() => { setActiveTab('salaries'); window.history.replaceState(null, '', '/employees?tab=salaries'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <History size={16} /> Salary Payouts
        </button>
      </div>

      {/* RENDER ACTIVE TAB */}
      {activeTab === 'directory' ? (
        <div>
          {/* Staff Search Filters */}
          <div className="filters-section">
            <div className="filter-item" style={{ flex: '2 1 200px' }}>
              <label htmlFor="emp-search">Search Staff</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="emp-search"
                  type="text"
                  placeholder="Search by ID, name, designation..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px' }}
                />
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              </div>
            </div>

            <div className="filter-item">
              <label htmlFor="emp-status-filter">Status</label>
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

          {/* Directory Content */}
          {loading ? (
            <div className="card">
              <div className="loading-pulse">
                <div className="loading-pulse__bar" style={{ width: '40%' }} />
                <div className="loading-pulse__bar" />
                <div className="loading-pulse__bar" style={{ width: '70%' }} />
              </div>
            </div>
          ) : error ? (
            <div className="alert-danger mb-2">{error}</div>
          ) : filteredEmployees.length > 0 ? (
            <div className="responsive-table-cards">
              {/* Desktop Table View */}
              <div className="table-responsive card" style={{ padding: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name</th>
                      <th>Designation</th>
                      <th>Monthly Salary</th>
                      <th>Joined Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{emp.employeeId || emp.id}</td>
                        <td style={{ fontWeight: 500 }}>{emp.name}</td>
                        <td>{emp.designation || 'Staff'}</td>
                        <td>{formatCurrency(Number(emp.monthlySalary || 0))}</td>
                        <td>{emp.joiningDate}</td>
                        <td>
                          <span className={`badge ${emp.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to={`/employees/${emp.id}`} className="btn-icon edit" title="Edit Employee">
                            <Edit size={16} />
                          </Link>
                          <button onClick={() => handleDeleteEmployee(emp.id, emp.name)} className="btn-icon delete" title="Delete Employee">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Grid View */}
              <div className="mobile-card-grid">
                {filteredEmployees.map(emp => (
                  <div className="card" key={emp.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
                    <span className={`badge ${emp.status === 'active' ? 'badge-active' : 'badge-inactive'}`} style={{ position: 'absolute', top: '16px', right: '16px' }}>
                      {emp.status}
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '70px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontFamily: 'monospace' }}>
                        {emp.employeeId || emp.id}
                      </span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
                        {emp.name}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        <Briefcase size={14} />
                        <span>{emp.designation || 'Staff'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        <IndianRupee size={14} />
                        <strong>{formatCurrency(Number(emp.monthlySalary || 0))}</strong>
                      </div>
                      {emp.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-light)', gridColumn: 'span 2' }}>
                          <Phone size={14} />
                          <span>{emp.phone}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-light)', gridColumn: 'span 2' }}>
                        <Calendar size={14} />
                        <span>Joined: {emp.joiningDate}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '8px', gap: '10px' }}>
                      <Link to={`/employees/${emp.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1 }}>
                        <Edit size={14} /> Edit
                      </Link>
                      <button onClick={() => handleDeleteEmployee(emp.id, emp.name)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', border: 'none', flex: 1 }}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p className="text-muted" style={{ marginBottom: '16px' }}>No staff found in directory.</p>
              <Link to="/employees/new" className="btn btn-primary">+ Add Staff Member</Link>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Salary Search Filters */}
          <div className="filters-section">
            <div className="filter-item" style={{ width: '100%' }}>
              <label htmlFor="sal-search">Search Payouts</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="sal-search"
                  type="text"
                  placeholder="Search by employee name or notes..."
                  value={salSearch}
                  onChange={e => setSalSearch(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px' }}
                />
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              </div>
            </div>
          </div>

          {/* Salary History Content */}
          {loading ? (
            <div className="card">
              <div className="loading-pulse">
                <div className="loading-pulse__bar" style={{ width: '40%' }} />
                <div className="loading-pulse__bar" />
                <div className="loading-pulse__bar" style={{ width: '70%' }} />
              </div>
            </div>
          ) : error ? (
            <div className="alert-danger mb-2">{error}</div>
          ) : filteredSalaries.length > 0 ? (
            <div className="responsive-table-cards">
              {/* Desktop Table View */}
              <div className="table-responsive card" style={{ padding: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Salary Month</th>
                      <th>Amount Paid</th>
                      <th>Payment Date</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalaries.map(sal => (
                      <tr key={sal.id}>
                        <td style={{ fontWeight: 600 }}>{sal.employeeName}</td>
                        <td style={{ fontWeight: 500 }}>{formatSalaryMonth(sal.salaryMonth)}</td>
                        <td>{formatCurrency(Number(sal.amount || 0))}</td>
                        <td>{sal.paymentDate ? format(new Date(sal.paymentDate), 'dd MMM yyyy') : ''}</td>
                        <td style={{ color: 'var(--text-light)', fontSize: '0.8rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sal.notes}>
                          {sal.notes || '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button onClick={() => handleDeleteSalary(sal.id, sal.employeeName, sal.salaryMonth, sal.amount, sal.expenseId)} className="btn-icon delete" title="Delete Payment">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Grid View */}
              <div className="mobile-card-grid">
                {filteredSalaries.map(sal => (
                  <div className="card" key={sal.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                          {sal.employeeName}
                        </span>
                        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                          Salary for: <strong>{formatSalaryMonth(sal.salaryMonth)}</strong>
                        </p>
                      </div>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                        {formatCurrency(Number(sal.amount || 0))}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        <Calendar size={14} />
                        <span>Paid: {sal.paymentDate ? format(new Date(sal.paymentDate), 'dd MMM yyyy') : ''}</span>
                      </div>
                      {sal.notes && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', margin: '4px 0 0 0', backgroundColor: 'var(--secondary)', padding: '6px 8px', borderRadius: '4px' }}>
                          {sal.notes}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                      <button onClick={() => handleDeleteSalary(sal.id, sal.employeeName, sal.salaryMonth, sal.amount, sal.expenseId)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', border: 'none', width: '100%' }}>
                        <Trash2 size={14} /> Delete Payout Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p className="text-muted" style={{ marginBottom: '16px' }}>No salary payments recorded yet.</p>
              <Link to="/salaries/new" className="btn btn-primary">+ Record First Payment</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
