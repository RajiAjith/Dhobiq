import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Search, Plus, Edit, Trash2, Calendar, FileText, Download, AlertTriangle, Eye } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import OfflineScreen from '../components/OfflineScreen';

export default function ExpenseList() {
  const [expenses,       setExpenses]       = useState([]);
  const [categories,     setCategories]     = useState([]);
  const [filtered,        setFiltered]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

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
      const expQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'));
      const catQuery = query(collection(db, 'expense_categories'));

      const [expSnap, catSnap] = await Promise.all([
        getDocs(expQuery),
        getDocs(catQuery)
      ]);

      const expList = [];
      expSnap.forEach(d => expList.push({ id: d.id, ...d.data() }));
      setExpenses(expList);

      const catList = [];
      catSnap.forEach(d => catList.push({ id: d.id, ...d.data() }));
      
      // Default categories list if database is empty
      const defaultCats = [
        'Salary', 'Rent', 'Electricity', 'Water', 'Chemical Purchase', 
        'Packaging Materials', 'Food', 'Fuel', 'Repairs', 'Maintenance', 'Miscellaneous'
      ];
      
      const mergedCats = catList.length > 0 
        ? [...new Set([...catList.map(c => c.name), ...defaultCats])]
        : defaultCats;
      
      setCategories(mergedCats.sort());
      clearWasOffline();
    } catch (err) {
      console.error('Error fetching expenses:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
      else setError('Failed to load expenses: ' + err.message);
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

  // Apply filters
  useEffect(() => {
    let result = expenses;

    // Date range filter
    if (fromDate && toDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      result = result.filter(exp => {
        if (!exp.date) return false;
        const expDate = new Date(exp.date);
        return isWithinInterval(expDate, { start, end });
      });
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(exp => exp.category === categoryFilter);
    }

    // Search term (Vendor, Description, Notes)
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      result = result.filter(exp => 
        (exp.description || '').toLowerCase().includes(s) ||
        (exp.vendor || '').toLowerCase().includes(s) ||
        (exp.notes || '').toLowerCase().includes(s) ||
        (exp.category || '').toLowerCase().includes(s)
      );
    }

    setFiltered(result);
  }, [searchTerm, categoryFilter, fromDate, toDate, expenses]);

  const handleDelete = async (expId, isSalaryExpense) => {
    if (isSalaryExpense) {
      alert("This expense is automatically generated from a Salary payment. To delete it, please delete the payment under Staff & Salaries > Salary Payouts.");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this expense record?")) return;

    try {
      await deleteDoc(doc(db, 'expenses', expId));
      setExpenses(expenses.filter(e => e.id !== expId));
    } catch (err) {
      console.error('Error deleting expense:', err);
      alert('Failed to delete expense: ' + err.message);
    }
  };

  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={loadData} />;
  }

  const totalFilteredAmount = filtered.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  return (
    <div>
      {/* Page Header */}
      <div className="flex-between mb-2">
        <div>
          <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Expense Ledger</h2>
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>Track facility running costs, supplies, utilities, and salary values</p>
        </div>
        <Link to="/expenses/new" className="btn btn-primary">
          <Plus size={16} /> Add Expense
        </Link>
      </div>

      {/* Expense Filters */}
      <div className="filters-section" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <div className="filter-item" style={{ flex: '2 1 180px' }}>
          <label htmlFor="exp-search">Search Keyword</label>
          <div style={{ position: 'relative' }}>
            <input
              id="exp-search"
              type="text"
              placeholder="Search vendor, description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
          </div>
        </div>

        <div className="filter-item">
          <label htmlFor="exp-cat">Category</label>
          <select
            id="exp-cat"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="form-control"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label htmlFor="exp-from">From Date</label>
          <input
            id="exp-from"
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="form-control"
          />
        </div>

        <div className="filter-item">
          <label htmlFor="exp-to">To Date</label>
          <input
            id="exp-to"
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="form-control"
          />
        </div>
      </div>

      {/* Aggregate Balance Header Card */}
      <div className="card" style={{ padding: '14px', backgroundColor: 'var(--primary-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>TOTAL FILTERED EXPENSES</span>
        <strong style={{ fontSize: '1.4rem', color: 'var(--primary)' }}>
          ₹{totalFilteredAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </strong>
      </div>

      {/* Expenses Contents */}
      {loading ? (
        <div className="card">
          <div className="loading-pulse">
            <div className="loading-pulse__bar" style={{ width: '50%' }} />
            <div className="loading-pulse__bar" />
            <div className="loading-pulse__bar" style={{ width: '80%' }} />
          </div>
        </div>
      ) : error ? (
        <div className="alert-danger mb-2">{error}</div>
      ) : filtered.length > 0 ? (
        <div className="responsive-table-cards">
          {/* Desktop Table */}
          <div className="table-responsive card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Vendor</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(exp => {
                  const isSalary = !!exp.salaryPaymentId;
                  return (
                    <tr key={exp.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {exp.date ? format(new Date(exp.date), 'dd MMM yyyy') : ''}
                      </td>
                      <td>
                        <span className={`badge ${isSalary ? 'badge-info' : 'badge-warning'}`} style={{ textTransform: 'capitalize' }}>
                          {exp.category}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>₹{Number(exp.amount || 0).toFixed(2)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{exp.description}</span>
                          {isSalary && (
                            <span title="Generated from employee payroll system" style={{ display: 'inline-flex', color: 'var(--info)' }}>
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{exp.vendor || '—'}</td>
                      <td>{exp.paymentMethod || 'Cash'}</td>
                      <td>
                        {exp.receiptUrl ? (
                          <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer" className="btn-icon" style={{ color: 'var(--primary)', minWidth: 0, minHeight: 0, padding: '4px' }} title="View Uploaded File">
                            <Eye size={16} />
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isSalary ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic' }}>Payroll Entry</span>
                        ) : (
                          <>
                            <Link to={`/expenses/${exp.id}/edit`} className="btn-icon edit" title="Edit Expense">
                              <Edit size={16} />
                            </Link>
                            <button onClick={() => handleDelete(exp.id, false)} className="btn-icon delete" title="Delete Expense">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="mobile-card-grid">
            {filtered.map(exp => {
              const isSalary = !!exp.salaryPaymentId;
              return (
                <div className="card" key={exp.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: isSalary ? '4px solid var(--info)' : '4px solid var(--warning)' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span className={`badge ${isSalary ? 'badge-info' : 'badge-warning'}`} style={{ alignSelf: 'flex-start', marginBottom: '2px' }}>
                        {exp.category}
                      </span>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                        {exp.description}
                      </span>
                    </div>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                      ₹{Number(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} />
                      <span>{exp.date ? format(new Date(exp.date), 'dd MMM yy') : ''}</span>
                    </div>
                    <div>
                      Method: <strong>{exp.paymentMethod || 'Cash'}</strong>
                    </div>
                    {exp.vendor && (
                      <div style={{ gridColumn: 'span 2' }}>
                        Vendor: <strong>{exp.vendor}</strong>
                      </div>
                    )}
                    {exp.receiptUrl && (
                      <div style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                        <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', width: '100%', gap: '6px' }}>
                          <Eye size={12} /> View Uploaded Receipt
                        </a>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                    {isSalary ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--info)', fontStyle: 'italic', width: '100%', textAlign: 'center', fontWeight: 500 }}>
                        Managed under Staff & Salaries
                      </span>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <Link to={`/expenses/${exp.id}/edit`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1 }}>
                          <Edit size={14} /> Edit
                        </Link>
                        <button onClick={() => handleDelete(exp.id, false)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', border: 'none', flex: 1 }}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p className="text-muted" style={{ marginBottom: '16px' }}>No expenses logged for this period.</p>
          <Link to="/expenses/new" className="btn btn-primary">+ Add New Expense</Link>
        </div>
      )}
    </div>
  );
}
