import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Search, Plus, Edit, Trash2, Calendar, FileText, Download, AlertTriangle, Eye, Wallet, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import OfflineScreen from '../components/OfflineScreen';
import { formatCurrency } from '../utils/currencyFormatter';
import { SkeletonList } from '../components/DhobiqLoader';
import { useConfirm } from '../components/ConfirmDialog';

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
  const [ConfirmUI, confirm] = useConfirm();

  const getIconBg = (category) => {
    if (!category) return 'var(--brand-50)';
    const code = category.charCodeAt(category.length - 1) % 4;
    return ['var(--brand-50)', 'var(--success-bg)', 'var(--purple-bg)', 'var(--orange-bg)'][code];
  };

  const getIconColor = (category) => {
    if (!category) return 'var(--primary)';
    const code = category.charCodeAt(category.length - 1) % 4;
    return ['var(--primary)', 'var(--success)', 'var(--purple)', 'var(--orange)'][code];
  };

  const formatCurrencyNoDecimals = (val) => {
    const rounded = Math.round(Number(val) || 0);
    return formatCurrency(rounded).replace(/\.00$/, '');
  };

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

    const ok = await confirm({
      title: 'Delete Expense?',
      message: 'This expense record will be permanently deleted.',
      confirmLabel: 'Delete Expense',
    });
    if (!ok) return;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Expense Ledger</h2>
          <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: '2px', margin: 0 }}>Track running costs, utilities, and payrolls</p>
        </div>
        <Link to="/expenses/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> Add Expense
        </Link>
      </div>

      {/* Expense Filters Grid */}
      <div className="filters-section">
        <div className="filter-item" style={{ gridColumn: 'span 2' }}>
          <label className="filter-label" htmlFor="exp-search">Search Keyword</label>
          <div style={{ position: 'relative' }}>
            <input
              id="exp-search"
              type="text"
              placeholder="Search vendor, desc..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-control"
            />
          </div>
        </div>

        <div className="filter-item" style={{ gridColumn: 'span 2' }}>
          <label className="filter-label" htmlFor="exp-cat">Category</label>
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
          <label className="filter-label" htmlFor="exp-from">From Date</label>
          <input
            id="exp-from"
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="form-control"
          />
        </div>

        <div className="filter-item">
          <label className="filter-label" htmlFor="exp-to">To Date</label>
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
      <div className="card" style={{ padding: '14px 16px', background: 'var(--primary-light)', border: '1px solid rgba(0, 61, 130, 0.08)', borderRadius: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>TOTAL FILTERED EXPENSES</span>
        <strong style={{ fontSize: '1.25rem', color: 'var(--primary)', fontWeight: 800 }}>
          {formatCurrencyNoDecimals(totalFilteredAmount)}
        </strong>
      </div>

      {/* Expenses List Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ paddingBottom: '4px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Logged Records</h2>
        </div>

        {loading ? (
          <SkeletonList count={3} />
        ) : error ? (
          <div className="alert-danger" style={{ margin: 0 }}>{error}</div>
        ) : filtered.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(exp => {
              const isSalary = !!exp.salaryPaymentId;
              return (
                <div 
                  key={exp.id} 
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
                    <div className="icon-box" style={{ 
                      backgroundColor: getIconBg(exp.category), 
                      color: getIconColor(exp.category),
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
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {exp.description || 'Facility Cost'}
                            {isSalary && (
                              <span title="Payroll System Entry" style={{ color: 'var(--info)', display: 'inline-flex' }}>
                                <AlertTriangle size={12} />
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Vendor: <strong>{exp.vendor || '—'}</strong>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrencyNoDecimals(exp.amount)}
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            <span className={`badge ${isSalary ? 'badge-info' : 'badge-warning'}`} style={{ textTransform: 'capitalize', fontSize: '0.62rem', padding: '2px 6px' }}>
                              {exp.category}
                            </span>
                          </div>
                        </div>
                      </div>
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
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {exp.date ? format(new Date(exp.date), 'dd MMM yyyy') : ''} &nbsp;•&nbsp; Method: <strong>{exp.paymentMethod || 'Cash'}</strong>
                    </span>
                    
                    {/* Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {exp.receiptUrl && (
                        <a 
                          href={exp.receiptUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn-icon" 
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            minWidth: '32px',
                            background: 'rgba(16, 185, 129, 0.06)',
                            border: '1px solid rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }} 
                          title="View Receipt File"
                        >
                          <Eye size={14} />
                        </a>
                      )}
                      {isSalary ? (
                        <span style={{ fontSize: '0.66rem', color: 'var(--info)', fontStyle: 'italic', fontWeight: 600 }}>Payroll Entry</span>
                      ) : (
                        <>
                          <Link 
                            to={`/expenses/${exp.id}/edit`} 
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
                            title="Edit Expense"
                          >
                            <Edit size={14} />
                          </Link>
                          <button 
                            onClick={() => handleDelete(exp.id, false)} 
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
                            title="Delete Expense"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid rgba(0, 61, 130, 0.04)', borderRadius: '16px', background: '#ffffff' }}>
            <p className="text-muted" style={{ marginBottom: '16px', fontSize: '0.82rem' }}>No expenses logged for this period.</p>
            <Link to="/expenses/new" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px' }}>+ Add New Expense</Link>
          </div>
        )}
      </div>
    </div>
  );
}
