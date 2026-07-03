import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { 
  Receipt, Users, Settings, FileText, TrendingUp, AlertCircle, 
  DollarSign, Activity, CreditCard, Briefcase, ChevronRight, TrendingDown,
  PieChart as PieIcon, BarChart3, HelpCircle
} from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import OfflineScreen from '../components/OfflineScreen';
import { runBillsMigrationIfNeeded, runInvoicePaymentMigrationIfNeeded } from '../utils/migration';
import { buildPaymentSummary, getInvoicePaymentEntries } from '../utils/paymentUtils';
import { getAnalyticsStartDate, isDateInAnalyticsWindow } from '../utils/analytics';
import { formatCurrency } from '../utils/currencyFormatter';

// Recharts theme colors matching our 2026 SaaS guidelines
const COLORS = ['#003366', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

export default function Dashboard() {
  const [recentBills, setRecentBills] = useState([]);
  const [activeTab, setActiveTab] = useState('trends');
  
  const [analytics, setAnalytics] = useState({
    // Summary Cards (10)
    totalRevenue: 0,
    monthlyRevenue: 0,
    totalExpenses: 0,
    monthlyExpenses: 0,
    netProfit: 0,
    pendingPayments: 0,
    totalCustomers: 0,
    activeEmployees: 0,
    billsThisMonth: 0,
    invoicesThisMonth: 0,
    
    // 10 Chart Datasets
    monthlyTrendData: [], // Rev, Exp, Profit trends (Charts 1, 2, 3, 4)
    customerGrowthData: [], // Growth (Chart 5)
    topCustomersData: [], // Customers by rev (Chart 6)
    serviceUsageData: [], // Services by quantity (Chart 7)
    topServicesData: [], // Services by revenue (Chart 8)
    expenseBreakdownData: [], // Categories (Chart 9)
    paymentStatusData: [] // Invoices paid/unpaid (Chart 10)
  });
  
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);
  const [migrationDone,  setMigrationDone]  = useState(false);
  const [analyticsStartDate, setAnalyticsStartDate] = useState(getAnalyticsStartDate());

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  // Migrations (runs silently in background on mount)
  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        runBillsMigrationIfNeeded(),
        runInvoicePaymentMigrationIfNeeded()
      ])
        .then(() => setMigrationDone(true))
        .catch(() => setMigrationDone(true));
    } else {
      setMigrationDone(true);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!navigator.onLine) { setIsOfflineError(true); setLoading(false); return; }
    setLoading(true);
    setError(null);
    setIsOfflineError(false);

    let isMounted = true;
    const timeout = setTimeout(() => {
      if (isMounted) {
        setError('Database connection is taking longer than expected.');
        setIsOfflineError(true);
        setLoading(false);
      }
    }, 20000);

    try {
      // 1. Parallel collection queries
      const [
        billsSnap, 
        invoicesSnap, 
        expensesSnap, 
        customersSnap, 
        employeesSnap, 
        recentBillsSnap,
        settingsSnap
      ] = await Promise.all([
        getDocs(collection(db, 'bills')),
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'employees')),
        getDocs(query(collection(db, 'bills'), orderBy('date', 'desc'), limit(5))),
        getDoc(doc(db, 'settings', 'general'))
      ]);

      const analyticsSettings = settingsSnap.exists() ? settingsSnap.data() : {};
      const analyticsStartDateValue = getAnalyticsStartDate(analyticsSettings);
      const now = new Date();
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);

      setAnalyticsStartDate(analyticsStartDateValue);

      // --- Summary Metrics Initializers ---
      let totalRevenue = 0;
      let monthlyRevenue = 0;
      let totalExpenses = 0;
      let monthlyExpenses = 0;
      let pendingPayments = 0;
      let billsThisMonth = 0;
      let invoicesThisMonth = 0;
      let totalCustomers = customersSnap.size;
      
      let activeEmployees = 0;
      employeesSnap.forEach(d => {
        if (d.data().status === 'active') activeEmployees++;
      });

      // --- Last 6 Months Map for Trend Charts ---
      const monthlyDataMap = {};
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        const monthKey = format(d, 'MMM yy');
        monthlyDataMap[monthKey] = { name: monthKey, revenue: 0, expenses: 0, profit: 0 };
      }

      // --- Chart Aggregations Map ---
      const customerSpendingMap = {};
      const serviceUsageMap = {}; // quantity
      const serviceRevenueMap = {}; // revenue
      const expenseCategoryMap = {};
      const paymentStatusCountMap = { paid: 0, partial: 0, unpaid: 0 };

      // 2. Process Invoices
      invoicesSnap.forEach(d => {
        const inv = d.data();
        const total = Number(inv.totalAmount) || 0;
        const paymentEntries = getInvoicePaymentEntries(inv);
        const fullPaymentSummary = buildPaymentSummary(paymentEntries, total);
        const paymentsInAnalyticsWindow = paymentEntries.filter(payment => isDateInAnalyticsWindow(payment.paymentDate, analyticsStartDateValue));
        const analyticsPaymentSummary = buildPaymentSummary(paymentsInAnalyticsWindow, total);
        const paid = analyticsPaymentSummary.amountPaid;
        const balance = fullPaymentSummary.balanceAmount;
        const custName = inv.customerName || 'Unknown Customer';

        totalRevenue += paid;
        pendingPayments += balance;

        const invDate = new Date(inv.invoiceDate || Date.now());
        const monthKey = format(invDate, 'MMM yy');

        paymentsInAnalyticsWindow.forEach(payment => {
          const paymentDate = new Date(payment.paymentDate || Date.now());
          const paymentMonthKey = format(paymentDate, 'MMM yy');
          if (monthlyDataMap[paymentMonthKey]) {
            monthlyDataMap[paymentMonthKey].revenue += Number(payment.amount || 0);
          }
        });

        // Month calculations
        const currentMonthPaid = paymentEntries.reduce((sum, payment) => {
          const paymentDate = new Date(payment.paymentDate || Date.now());
          return isWithinInterval(paymentDate, { start: currentMonthStart, end: currentMonthEnd }) ? sum + Number(payment.amount || 0) : sum;
        }, 0);

        monthlyRevenue += currentMonthPaid;
        if (isWithinInterval(invDate, { start: currentMonthStart, end: currentMonthEnd })) {
          invoicesThisMonth++;
        }

        // Customer spending
        customerSpendingMap[custName] = (customerSpendingMap[custName] || 0) + paid;

        // Payment status counts
        const status = fullPaymentSummary.paymentStatus || 'unpaid';
        if (paymentStatusCountMap[status] !== undefined) {
          paymentStatusCountMap[status]++;
        } else {
          paymentStatusCountMap['unpaid']++;
        }

        // Services aggregation from invoice items
        if (inv.items && Array.isArray(inv.items) && paid > 0) {
          const paymentShare = total > 0 ? paid / total : 0;
          inv.items.forEach(item => {
            const name = item.name || 'Unspecified';
            const qty = Number(item.quantity) || 0;
            const itemTot = Number(item.total) || 0;

            serviceUsageMap[name] = (serviceUsageMap[name] || 0) + qty * paymentShare;
            serviceRevenueMap[name] = (serviceRevenueMap[name] || 0) + itemTot * paymentShare;
          });
        }
      });

      // 3. Process Expenses (includes auto-logged salaries)
      expensesSnap.forEach(d => {
        const exp = d.data();
        const amt = Number(exp.amount) || 0;
        const cat = exp.category || 'Miscellaneous';
        const expDate = new Date(exp.date || Date.now());
        const monthKey = format(expDate, 'MMM yy');

        if (isDateInAnalyticsWindow(expDate, analyticsStartDateValue)) {
          totalExpenses += amt;
          if (monthlyDataMap[monthKey]) {
            monthlyDataMap[monthKey].expenses += amt;
          }
          expenseCategoryMap[cat] = (expenseCategoryMap[cat] || 0) + amt;
        }

        if (isWithinInterval(expDate, { start: currentMonthStart, end: currentMonthEnd })) {
          monthlyExpenses += amt;
        }
      });

      // 4. Calculate Net Profits
      Object.keys(monthlyDataMap).forEach(key => {
        monthlyDataMap[key].profit = monthlyDataMap[key].revenue - monthlyDataMap[key].expenses;
      });

      // 5. Process Bills (count this month)
      billsSnap.forEach(d => {
        const bill = d.data();
        const billDate = new Date(bill.date || Date.now());
        if (isWithinInterval(billDate, { start: currentMonthStart, end: currentMonthEnd })) {
          billsThisMonth++;
        }
      });

      // 6. Format Chart Lists & Sort
      // Customer spending list
      const topCustomersData = Object.entries(customerSpendingMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      // Service usage list (quantity)
      const serviceUsageData = Object.entries(serviceUsageMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      // Service revenue list
      const topServicesData = Object.entries(serviceRevenueMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      // Expense category breakdown list
      const expenseBreakdownData = Object.entries(expenseCategoryMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Payment status list
      const paymentStatusData = Object.entries(paymentStatusCountMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));

      // Customer growth cumulative trend (sort customers by their sequence number)
      const sortedCustomers = [];
      customersSnap.forEach(d => {
        const cust = d.data();
        sortedCustomers.push({ id: d.id, ...cust });
      });
      // Sort chronologically using sequence IDs (e.g. DQ-C25-001)
      sortedCustomers.sort((a, b) => a.id.localeCompare(b.id));

      const customerGrowthData = sortedCustomers.map((cust, index) => ({
        name: cust.name,
        count: index + 1
      })).slice(-15); // Show last 15 signups for clarity on mobile

      const bills = [];
      recentBillsSnap.forEach(d => bills.push({ id: d.id, ...d.data() }));

      if (isMounted) {
        setRecentBills(bills);
        setAnalytics({
          totalRevenue,
          monthlyRevenue,
          totalExpenses,
          monthlyExpenses,
          netProfit: totalRevenue - totalExpenses,
          pendingPayments,
          totalCustomers,
          activeEmployees,
          billsThisMonth,
          invoicesThisMonth,
          
          monthlyTrendData: Object.values(monthlyDataMap),
          customerGrowthData,
          topCustomersData,
          serviceUsageData,
          topServicesData,
          expenseBreakdownData,
          paymentStatusData
        });
        setError(null);
        setIsOfflineError(false);
        clearWasOffline();
      }
    } catch (err) {
      console.error('Error fetching dashboard details:', err);
      reportError(err);
      if (isMounted) {
        if (isNetworkError(err)) setIsOfflineError(true);
        else setError('Database fetch failed: ' + err.message);
      }
    } finally {
      clearTimeout(timeout);
      if (isMounted) setLoading(false);
      isMounted = false;
    }
  }, [reportError, clearWasOffline]);

  useEffect(() => { fetchDashboardData(); }, []);
  useEffect(() => { if (isOnline && wasOffline) fetchDashboardData(); }, [isOnline, wasOffline]);

  if (!loading && isOfflineError) return <OfflineScreen onRetry={fetchDashboardData} />;

  return (
    <div>
      {/* Page Title Header */}
      <div className="flex-between mb-2">
        <div>
          <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Executive Dashboard</h2>
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>Laundry business performance, ledger summaries, and operational growth</p>
        </div>
        <Link to="/bills/new" className="btn btn-primary">+ New Bill</Link>
      </div>
      <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '-6px', marginBottom: '10px' }}>
        Business analytics are shown from {format(analyticsStartDate, 'dd MMM yyyy')} onward.
      </p>

      {/* Analytics Summary Cards (10 Cards Grid) */}
      {loading ? (
        <div className="card" style={{ height: '180px' }}>
          <div className="loading-pulse">
            <div className="loading-pulse__bar" style={{ width: '30%' }} />
            <div className="loading-pulse__bar" />
          </div>
        </div>
      ) : (
        <div className="dashboard-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {/* Card 1: Monthly Revenue */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--success)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign size={14} className="text-success" /> Monthly Revenue
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {formatCurrency(analytics.monthlyRevenue)}
            </p>
          </div>

          {/* Card 2: Monthly Expenses */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--danger)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingDown size={14} className="text-danger" /> Monthly Expenses
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {formatCurrency(analytics.monthlyExpenses)}
            </p>
          </div>

          {/* Card 3: Total Revenue */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--primary)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={14} style={{ color: 'var(--primary)' }} /> Total Revenue
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {formatCurrency(analytics.totalRevenue)}
            </p>
          </div>

          {/* Card 4: Total Expenses */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--warning)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CreditCard size={14} className="text-warning" /> Total Expenses
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {formatCurrency(analytics.totalExpenses)}
            </p>
          </div>

          {/* Card 5: Net Profit */}
          <div className="dashboard-card" style={{ borderLeft: `4px solid ${analytics.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}`, padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={14} style={{ color: analytics.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }} /> Net Profit
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0', color: analytics.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(analytics.netProfit)}
            </p>
          </div>

          {/* Card 6: Pending Payments */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--danger)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle size={14} className="text-danger" /> Receivables
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0', color: 'var(--danger)' }}>
              {formatCurrency(analytics.pendingPayments)}
            </p>
          </div>

          {/* Card 7: Total Customers */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid #8b5cf6', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={14} style={{ color: '#8b5cf6' }} /> Customers
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {analytics.totalCustomers}
            </p>
          </div>

          {/* Card 8: Active Employees */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid #ec4899', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Briefcase size={14} style={{ color: '#ec4899' }} /> Active Staff
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {analytics.activeEmployees}
            </p>
          </div>

          {/* Card 9: Bills This Month */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--info)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Receipt size={14} className="text-info" /> Bills This Mo.
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {analytics.billsThisMonth}
            </p>
          </div>

          {/* Card 10: Invoices This Month */}
          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--primary-hover)', padding: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileText size={14} style={{ color: 'var(--primary-hover)' }} /> Invoices This Mo.
            </span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '6px 0 0 0' }}>
              {analytics.invoicesThisMonth}
            </p>
          </div>
        </div>
      )}

      {/* Advanced Tabbed Charts Switcher (10 Charts) */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={18} /> Business Insights & Charts
        </h3>

        <div className="tabs-container" style={{ margin: '8px 0 16px 0' }}>
          <button className={`tab-btn ${activeTab === 'trends' ? 'active' : ''}`} onClick={() => setActiveTab('trends')}>Financial Trends</button>
          <button className={`tab-btn ${activeTab === 'breakdowns' ? 'active' : ''}`} onClick={() => setActiveTab('breakdowns')}>Expense & Payments</button>
          <button className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>Services Popularity</button>
          <button className={`tab-btn ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => setActiveTab('customers')}>Customer Growth</button>
        </div>

        {loading ? (
          <div className="loading-pulse" style={{ height: '280px' }}></div>
        ) : (
          <div style={{ minHeight: '300px' }}>
            
            {/* TAB 1: FINANCIAL TRENDS */}
            {activeTab === 'trends' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }} className="invoice-grid">
                
                {/* Chart 1: Revenue vs Expense Comparison */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Monthly Revenue vs Expense (Comparison)</h4>
                  <div style={{ height: '240px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} formatter={(value) => formatCurrency(value)} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="revenue" name="Revenue" fill="#003366" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: Net Profit Trend */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Monthly Net Profit Trend</h4>
                  <div style={{ height: '240px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} formatter={(value) => formatCurrency(value)} />
                        <Area type="monotone" dataKey="profit" name="Net Profit" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 3: Revenue Trend (Line) */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Revenue Trend (6 Months Area)</h4>
                  <div style={{ height: '240px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#003366" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#003366" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} formatter={(value) => formatCurrency(value)} />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#003366" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 4: Expense Trend (Line) */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Expense Trend (6 Months Line)</h4>
                  <div style={{ height: '240px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} formatter={(value) => formatCurrency(value)} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: EXPENSE & PAYMENTS BREAKDOWN */}
            {activeTab === 'breakdowns' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }} className="invoice-grid">
                
                {/* Chart 5: Category-Wise Expense Breakdown */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Expense Categories Breakdown (Pie)</h4>
                  {analytics.expenseBreakdownData.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ height: '200px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analytics.expenseBreakdownData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={75}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {analytics.expenseBreakdownData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 14px', fontSize: '0.72rem' }}>
                        {analytics.expenseBreakdownData.map((entry, idx) => (
                          <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: COLORS[idx % COLORS.length] }}></span>
                            <span>{entry.name}: <strong>{formatCurrency(entry.value)}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.85rem', color: 'var(--text-light)' }}>No expenses logged.</div>
                  )}
                </div>

                {/* Chart 6: Payment Status Analysis */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Invoice Payment Status Distribution</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ height: '200px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.paymentStatusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius={75}
                            labelLine={false}
                            label={({ name, percent }) => percent > 0 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}
                            dataKey="value"
                          >
                            {/* Colors: Paid (Green), Partial (Warning), Unpaid (Danger) */}
                            <Cell fill="#10b981" />
                            <Cell fill="#f59e0b" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} Invoices`, 'Volume']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 3: SERVICES POPULARITY */}
            {activeTab === 'services' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }} className="invoice-grid">
                
                {/* Chart 7: Top Services by Revenue */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Top 5 Services (By Invoice Revenue)</h4>
                  {analytics.topServicesData.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ height: '200px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analytics.topServicesData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {analytics.topServicesData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 14px', fontSize: '0.72rem' }}>
                        {analytics.topServicesData.map((entry, idx) => (
                          <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: COLORS[idx % COLORS.length] }}></span>
                            <span>{entry.name}: <strong>{formatCurrency(entry.value)}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.85rem', color: 'var(--text-light)' }}>No invoice items billed yet.</div>
                  )}
                </div>

                {/* Chart 8: Service Usage Volume */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Service Billing Volume (Quantity Sold)</h4>
                  {analytics.serviceUsageData.length > 0 ? (
                    <div style={{ height: '240px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.serviceUsageData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={80} />
                          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} />
                          <Bar dataKey="value" name="Pieces Cleaned" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.85rem', color: 'var(--text-light)' }}>No items billed.</div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 4: CUSTOMER GROWTH */}
            {activeTab === 'customers' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }} className="invoice-grid">
                
                {/* Chart 9: Top Customer Invoiced Revenue */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Top 5 Valued Customers (Invoiced Sales)</h4>
                  {analytics.topCustomersData.length > 0 ? (
                    <div style={{ height: '240px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.topCustomersData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                          <XAxis type="number" axisLine={false} tickLine={false} />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={90} />
                          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} formatter={(value) => formatCurrency(value)} />
                          <Bar dataKey="value" name="Amount Paid" fill="#10b981" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.85rem', color: 'var(--text-light)' }}>No invoice records.</div>
                  )}
                </div>

                {/* Chart 10: Cumulative Customer Growth Trend */}
                <div style={{ minHeight: '260px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px', textAlign: 'center' }}>Customer Base Growth Trend</h4>
                  {analytics.customerGrowthData.length > 0 ? (
                    <div style={{ height: '240px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analytics.customerGrowthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} />
                          <Line type="monotone" dataKey="count" name="Total Customers" stroke="#003366" strokeWidth={2.5} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.85rem', color: 'var(--text-light)' }}>No customer profiles logged.</div>
                  )}
                </div>

              </div>
            )}

          </div>
        )}
      </div>

      {/* Recent Bills Ledger Section */}
      <div className="card">
        <div className="flex-between mb-2">
          <h3 className="card-title" style={{ border: 'none', margin: 0 }}>Recent Bills</h3>
          <Link to="/bills" style={{ fontSize: '0.82rem', color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>
            View all <ChevronRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="loading-pulse">
            <div className="loading-pulse__bar" />
            <div className="loading-pulse__bar" style={{ width: '75%' }} />
            <div className="loading-pulse__bar" style={{ width: '55%' }} />
          </div>
        ) : error ? (
          <div className="alert-danger mb-2">{error}</div>
        ) : recentBills.length > 0 ? (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBills.map(bill => (
                  <tr key={bill.id}>
                    <td style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600 }}>{bill.billNumber || bill.id}</td>
                    <td style={{ fontWeight: 500 }}>{bill.customerName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {bill.date ? format(new Date(bill.date), 'dd MMM yy') : ''}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatCurrency(Number(bill.totalAmount))}</td>
                    <td>
                      {bill.invoiceId
                        ? <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Invoiced</span>
                        : <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Pending</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <p className="text-muted" style={{ marginBottom: '12px' }}>No bills recorded yet.</p>
            <Link to="/bills/new" className="btn btn-primary">+ New Bill</Link>
          </div>
        )}
      </div>
    </div>
  );
}
