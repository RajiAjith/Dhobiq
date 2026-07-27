import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { 
  Receipt, Users, Settings, FileText, TrendingUp, AlertCircle, 
  DollarSign, Activity, CreditCard, Briefcase, ChevronRight, TrendingDown,
  PieChart as PieIcon, BarChart3, HelpCircle, Calendar, Store
} from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Legend, Cell 
} from 'recharts';
import OfflineScreen from '../components/OfflineScreen';
import { runBillsMigrationIfNeeded, runInvoicePaymentMigrationIfNeeded } from '../utils/migration';
import { buildPaymentSummary, getInvoicePaymentEntries } from '../utils/paymentUtils';
import { getAnalyticsStartDate, isDateInAnalyticsWindow } from '../utils/analytics';
import { formatCurrency } from '../utils/currencyFormatter';
import PageHeader from '../components/PageHeader';
import DhobiqLoader, { SkeletonKPICards } from '../components/DhobiqLoader';

const COLORS = ['#003D82', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

// Shared section header component for Android/iOS Material 3 typography
function SectionHeader({ title, icon: Icon, action }) {
  return (
    <div className="section-header">
      <div className="section-header-title-block">
        {Icon && <Icon size={16} style={{ color: 'var(--primary)', opacity: 0.85, flexShrink: 0 }} />}
        <h3 style={{ 
          fontSize: '0.86rem', 
          fontWeight: 800, 
          color: 'var(--text-primary)', 
          margin: 0,
          letterSpacing: '-0.01em',
          textTransform: 'none',
          whiteSpace: 'nowrap'
        }}>
          {title}
        </h3>
      </div>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const [recentBills, setRecentBills] = useState([]);
  const [activeTab, setActiveTab] = useState('trends');
  const [invoiceStatusMap, setInvoiceStatusMap] = useState({});
  
  const [analytics, setAnalytics] = useState({
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

    prevMonthRevenue: 0,
    prevMonthExpenses: 0,
    prevMonthProfit: 0,
    prevMonthReceivables: 0,
    
    monthlyTrendData: [],
    customerGrowthData: [],
    topCustomersData: [],
    serviceUsageData: [],
    topServicesData: [],
    expenseBreakdownData: [],
    paymentStatusData: []
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);
  const [analyticsStartDate, setAnalyticsStartDate] = useState(getAnalyticsStartDate());

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

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

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good Morning';
    if (hr < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getIconBg = (id) => {
    if (!id) return 'var(--brand-50)';
    const code = id.charCodeAt(id.length - 1) % 4;
    return ['var(--brand-50)', 'var(--success-bg)', 'var(--purple-bg)', 'var(--orange-bg)'][code];
  };

  const getIconColor = (id) => {
    if (!id) return 'var(--primary)';
    const code = id.charCodeAt(id.length - 1) % 4;
    return ['var(--primary)', 'var(--success)', 'var(--purple)', 'var(--orange)'][code];
  };

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

      const analyticsSettings = settingsSnap.exists() ? settingsSnap.data() : null;
      const analyticsStartDateValue = getAnalyticsStartDate(analyticsSettings);
      const now = new Date();
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);

      const prevMonthStart = startOfMonth(subMonths(now, 1));
      const prevMonthEnd = endOfMonth(subMonths(now, 1));

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

      let prevMonthRevenue = 0;
      let prevMonthExpenses = 0;
      let prevMonthReceivables = 0;
      
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
      const serviceUsageMap = {}; 
      const serviceRevenueMap = {}; 
      const expenseCategoryMap = {};
      const paymentStatusCountMap = { paid: 0, partial: 0, unpaid: 0 };
      const tempInvStatusMap = {};

      // Process Invoices
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

        if (d.id) {
          tempInvStatusMap[d.id] = fullPaymentSummary.paymentStatus;
        }

        const invDate = new Date(inv.invoiceDate || Date.now());

        // Previous Month Receivables logic
        if (isWithinInterval(invDate, { start: prevMonthStart, end: prevMonthEnd })) {
          const prevMonthPayments = paymentEntries.filter(p => new Date(p.paymentDate).getTime() <= prevMonthEnd.getTime());
          const paidSummary = buildPaymentSummary(prevMonthPayments, total);
          prevMonthReceivables += paidSummary.balanceAmount;
        }

        paymentsInAnalyticsWindow.forEach(payment => {
          const paymentDate = new Date(payment.paymentDate || Date.now());
          const paymentMonthKey = format(paymentDate, 'MMM yy');
          if (monthlyDataMap[paymentMonthKey]) {
            monthlyDataMap[paymentMonthKey].revenue += Number(payment.amount || 0);
          }
        });

        // Current Month Revenue
        const currentMonthPaid = paymentEntries.reduce((sum, payment) => {
          const paymentDate = new Date(payment.paymentDate || Date.now());
          return isWithinInterval(paymentDate, { start: currentMonthStart, end: currentMonthEnd }) ? sum + Number(payment.amount || 0) : sum;
        }, 0);

        monthlyRevenue += currentMonthPaid;

        // Previous Month Revenue
        const prevMonthPaid = paymentEntries.reduce((sum, payment) => {
          const paymentDate = new Date(payment.paymentDate || Date.now());
          return isWithinInterval(paymentDate, { start: prevMonthStart, end: prevMonthEnd }) ? sum + Number(payment.amount || 0) : sum;
        }, 0);
        prevMonthRevenue += prevMonthPaid;

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

      setInvoiceStatusMap(tempInvStatusMap);

      // Process Expenses (includes auto-logged salaries)
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

        if (isWithinInterval(expDate, { start: prevMonthStart, end: prevMonthEnd })) {
          prevMonthExpenses += amt;
        }
      });

      // Calculate Net Profits
      Object.keys(monthlyDataMap).forEach(key => {
        monthlyDataMap[key].profit = monthlyDataMap[key].revenue - monthlyDataMap[key].expenses;
      });

      // Process Bills (count this month)
      billsSnap.forEach(d => {
        const bill = d.data();
        const billDate = new Date(bill.date || Date.now());
        if (isWithinInterval(billDate, { start: currentMonthStart, end: currentMonthEnd })) {
          billsThisMonth++;
        }
      });

      // Format Chart Lists & Sort
      const topCustomersData = Object.entries(customerSpendingMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      const serviceUsageData = Object.entries(serviceUsageMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      const topServicesData = Object.entries(serviceRevenueMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      const expenseBreakdownData = Object.entries(expenseCategoryMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const paymentStatusData = Object.entries(paymentStatusCountMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));

      const sortedCustomers = [];
      customersSnap.forEach(d => {
        const cust = d.data();
        sortedCustomers.push({ id: d.id, ...cust });
      });
      sortedCustomers.sort((a, b) => a.id.localeCompare(b.id));

      const customerGrowthData = sortedCustomers.map((cust, index) => ({
        name: cust.name,
        count: index + 1
      })).slice(-15);

      const bills = [];
      recentBillsSnap.forEach(d => bills.push({ id: d.id, ...d.data() }));

      clearTimeout(timeout);
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

          prevMonthRevenue,
          prevMonthExpenses,
          prevMonthProfit: prevMonthRevenue - prevMonthExpenses,
          prevMonthReceivables,
          
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
    }
  }, [clearWasOffline, reportError]);

  useEffect(() => { fetchDashboardData(); }, []);
  useEffect(() => { if (isOnline && wasOffline) fetchDashboardData(); }, [isOnline, wasOffline]);

  const getTrend = (current, previous) => {
    if (previous === 0) {
      return { percent: current > 0 ? 100 : 0, direction: 'up' };
    }
    const diff = current - previous;
    const percent = Number(((diff / previous) * 100).toFixed(1));
    return {
      percent: Math.abs(percent),
      direction: percent >= 0 ? 'up' : 'down'
    };
  };

  const formatCurrencyNoDecimals = (val) => {
    const rounded = Math.round(Number(val) || 0);
    return formatCurrency(rounded).replace(/\.00$/, '');
  };

  const revTrend = getTrend(analytics.monthlyRevenue, analytics.prevMonthRevenue);
  const expTrend = getTrend(analytics.monthlyExpenses, analytics.prevMonthExpenses);
  const profitTrend = getTrend(analytics.monthlyRevenue - analytics.monthlyExpenses, analytics.prevMonthProfit);
  const recTrend = getTrend(analytics.pendingPayments, analytics.prevMonthReceivables);

  if (!loading && isOfflineError) return <OfflineScreen onRetry={fetchDashboardData} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>
      
      {/* 1. Premium Integrated Welcome Card */}
      <div className="welcome-banner">
        <div className="welcome-banner-text" style={{ minWidth: 0 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap', display: 'block' }}>
            {getGreeting()}, Ajith! 👋
          </span>
          <h2 className="welcome-banner-title">
            Executive Dashboard
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            <Calendar size={14} style={{ color: 'var(--primary)', opacity: 0.8 }} />
            <span>{format(new Date(), 'EEEE, dd MMMM yyyy')}</span>
          </div>
        </div>

        {/* Dynamic welcome banner image asset */}
        <img 
          src="/laundry_dashboard.png" 
          alt="Laundry Dashboard Illustration" 
          className="welcome-banner-img"
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <SkeletonKPICards count={4} />
          {/* Secondary Metrics Shimmer Card */}
          <div className="skeleton" style={{ height: '70px', borderRadius: '18px', width: '100%' }} />
          {/* Operations Trends Chart Shimmer Card */}
          <div className="skeleton" style={{ height: '380px', borderRadius: '18px', width: '100%' }} />
          {/* Recent Orders List Shimmer Card */}
          <div className="skeleton" style={{ height: '300px', borderRadius: '18px', width: '100%' }} />
        </div>
      ) : (
        <>
          {/* 2. Premium Accent-Border Large Primary KPI Widgets */}
          <div className="kpi-grid" style={{ gap: '12px', marginBottom: 0 }}>
            {/* Monthly Revenue */}
            <div className="card" style={{ 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: '16px 18px', 
              minHeight: '148px', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              borderRadius: '18px',
              background: '#ffffff',
              border: '1px solid rgba(0, 61, 130, 0.05)',
              boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.03)',
              overflow: 'hidden',
              margin: 0
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#10B981' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', color: '#10B981', width: '32px', height: '32px', minWidth: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>₹</span>
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Monthly Revenue
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', letterSpacing: '-0.02em' }}>
                  {formatCurrencyNoDecimals(analytics.monthlyRevenue)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '6px', width: '100%' }}>
                <span className={`badge ${revTrend.direction === 'up' ? 'badge-paid' : 'badge-unpaid'}`} style={{ padding: '2px 6px', fontSize: '0.62rem', textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', alignSelf: 'flex-start' }}>
                  {revTrend.direction === 'up' ? '↑' : '↓'} {revTrend.percent}%
                </span>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '4px' }}>
                  vs last month {formatCurrencyNoDecimals(analytics.prevMonthRevenue)}
                </div>
              </div>
            </div>

            {/* Net Profit */}
            <div className="card" style={{ 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: '16px 18px', 
              minHeight: '148px', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              borderRadius: '18px',
              background: '#ffffff',
              border: '1px solid rgba(0, 61, 130, 0.05)',
              boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.03)',
              overflow: 'hidden',
              margin: 0
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#059669' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(5, 150, 105, 0.08)', color: '#059669', width: '32px', height: '32px', minWidth: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                  <TrendingUp size={16} />
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Net Profit
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', letterSpacing: '-0.02em' }}>
                  {formatCurrencyNoDecimals(analytics.monthlyRevenue - analytics.monthlyExpenses)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '6px', width: '100%' }}>
                <span className={`badge ${profitTrend.direction === 'up' ? 'badge-paid' : 'badge-unpaid'}`} style={{ padding: '2px 6px', fontSize: '0.62rem', textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', alignSelf: 'flex-start' }}>
                  {profitTrend.direction === 'up' ? '↑' : '↓'} {profitTrend.percent}%
                </span>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '4px' }}>
                  vs last month {formatCurrencyNoDecimals(analytics.prevMonthProfit)}
                </div>
              </div>
            </div>

            {/* Receivables */}
            <div className="card" style={{ 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: '16px 18px', 
              minHeight: '148px', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              borderRadius: '18px',
              background: '#ffffff',
              border: '1px solid rgba(0, 61, 130, 0.05)',
              boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.03)',
              overflow: 'hidden',
              margin: 0
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#EF4444' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#EF4444', width: '32px', height: '32px', minWidth: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                  <AlertCircle size={16} />
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Receivables
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', letterSpacing: '-0.02em' }}>
                  {formatCurrencyNoDecimals(analytics.pendingPayments)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '6px', width: '100%' }}>
                <span className={`badge ${recTrend.direction === 'down' ? 'badge-paid' : 'badge-unpaid'}`} style={{ padding: '2px 6px', fontSize: '0.62rem', textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', alignSelf: 'flex-start' }}>
                  {recTrend.direction === 'up' ? '↑' : '↓'} {recTrend.percent}%
                </span>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '4px' }}>
                  vs last month {formatCurrencyNoDecimals(analytics.prevMonthReceivables)}
                </div>
              </div>
            </div>

            {/* Monthly Expenses */}
            <div className="card" style={{ 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: '16px 18px', 
              minHeight: '148px', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              borderRadius: '18px',
              background: '#ffffff',
              border: '1px solid rgba(0, 61, 130, 0.05)',
              boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.03)',
              overflow: 'hidden',
              margin: 0
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#F59E0B' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', color: '#F59E0B', width: '32px', height: '32px', minWidth: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                  <CreditCard size={16} />
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Monthly Expenses
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', letterSpacing: '-0.02em' }}>
                  {formatCurrencyNoDecimals(analytics.monthlyExpenses)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '6px', width: '100%' }}>
                <span className={`badge ${expTrend.direction === 'down' ? 'badge-paid' : 'badge-unpaid'}`} style={{ padding: '2px 6px', fontSize: '0.62rem', textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', alignSelf: 'flex-start' }}>
                  {expTrend.direction === 'up' ? '↑' : '↓'} {expTrend.percent}%
                </span>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '4px' }}>
                  vs last month {formatCurrencyNoDecimals(analytics.prevMonthExpenses)}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Material-Design Compact Secondary KPI Line */}
          <div className="card" style={{ padding: '12px 14px', borderRadius: '18px', border: '1px solid rgba(0, 61, 130, 0.05)', boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.02)', margin: 0 }}>
            <div className="small-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {/* Customers */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(0, 61, 130, 0.06)', paddingRight: '2px', textAlign: 'center' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(139, 92, 246, 0.08)', color: '#8B5CF6', width: '26px', height: '26px', minWidth: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={12} /></div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Customers</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{analytics.totalCustomers}</div>
                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active</div>
              </div>

              {/* Active Staff */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(0, 61, 130, 0.06)', paddingRight: '2px', textAlign: 'center' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(236, 72, 153, 0.08)', color: '#EC4899', width: '26px', height: '26px', minWidth: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={12} /></div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Active Staff</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{analytics.activeEmployees}</div>
                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active</div>
              </div>

              {/* Bills This Month */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(0, 61, 130, 0.06)', paddingRight: '2px', textAlign: 'center' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(6, 182, 212, 0.08)', color: '#06B6D4', width: '26px', height: '26px', minWidth: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Receipt size={12} /></div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Bills</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{analytics.billsThisMonth}</div>
                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>This Month</div>
              </div>

              {/* Invoices Generated */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textAlign: 'center' }}>
                <div className="icon-box" style={{ backgroundColor: 'rgba(99, 102, 241, 0.08)', color: '#6366F1', width: '26px', height: '26px', minWidth: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={12} /></div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Invoices</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{analytics.invoicesThisMonth}</div>
                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>This Month</div>
              </div>
            </div>
          </div>

          {/* 4. Financial & Operations Trends Chart Card */}
          <div className="card" style={{ margin: 0, padding: '20px', borderRadius: '18px', border: '1px solid rgba(0, 61, 130, 0.05)', boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.03)' }}>
            <SectionHeader 
              title="Financial & Operations Trends" 
              icon={BarChart3} 
              action={
                <div className="chip-row">
                  <button
                    className={`chip ${activeTab === 'trends' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trends')}
                    style={{ minHeight: '30px', padding: '0px 12px', fontSize: '0.72rem', borderRadius: '10px' }}
                  >
                    Revenue Trends
                  </button>
                  <button
                    className={`chip ${activeTab === 'services' ? 'active' : ''}`}
                    onClick={() => setActiveTab('services')}
                    style={{ minHeight: '30px', padding: '0px 12px', fontSize: '0.72rem', borderRadius: '10px' }}
                  >
                    Services Analysis
                  </button>
                </div>
              }
            />

            <div style={{ height: '340px', width: '100%', minWidth: 0, marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                {activeTab === 'trends' ? (
                  <AreaChart data={analytics.monthlyTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#003D82" stopOpacity={0.16}/>
                        <stop offset="95%" stopColor="#003D82" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E8930A" stopOpacity={0.16}/>
                        <stop offset="95%" stopColor="#E8930A" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 61, 130, 0.04)" />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} />
                    <Tooltip formatter={(value) => formatCurrencyNoDecimals(value)} />
                    <Legend verticalAlign="bottom" height={36} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#003D82" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#E8930A" fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} />
                  </AreaChart>
                ) : (
                  <BarChart data={analytics.topServicesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 61, 130, 0.04)" />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} />
                    <Tooltip formatter={(value) => formatCurrencyNoDecimals(value)} />
                    <Bar dataKey="value" name="Revenue Earned" fill="var(--accent-invoices)" radius={[4, 4, 0, 0]}>
                      {analytics.topServicesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Recent Billing Orders (Tappable native item viewcards) */}
          <div className="card" style={{ margin: 0, padding: '20px', borderRadius: '18px', border: '1px solid rgba(0, 61, 130, 0.05)', boxShadow: '0 4px 14px -3px rgba(0, 0, 0, 0.03)' }}>
            <SectionHeader 
              title="Recent Billing Orders" 
              icon={Receipt} 
              action={
                <Link to="/bills" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', textDecoration: 'none' }}>
                  View All
                </Link>
              }
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              {recentBills.map(bill => (
                <Link 
                  key={bill.id} 
                  to={`/bills`}
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '12px 14px', 
                    textDecoration: 'none', 
                    background: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid rgba(0, 61, 130, 0.04)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.01)',
                    transition: 'all 0.2s',
                    margin: 0
                  }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.985)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                >
                  <div className="icon-box" style={{ 
                    backgroundColor: getIconBg(bill.id), 
                    color: getIconColor(bill.id),
                    width: '34px',
                    height: '34px',
                    minWidth: '34px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Store size={16} />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                          {bill.customerName}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                          {bill.billNumber || bill.id}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {formatCurrencyNoDecimals(bill.totalAmount)}
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          {bill.invoiceId ? (
                            <span className={`badge ${
                              invoiceStatusMap[bill.invoiceId] === 'paid' ? 'badge-paid' :
                              invoiceStatusMap[bill.invoiceId] === 'partial' ? 'badge-partial' : 'badge-unpaid'
                            }`} style={{ padding: '2px 6px', fontSize: '0.58rem', borderRadius: '6px' }}>
                              {String(invoiceStatusMap[bill.invoiceId] || 'Invoiced').toUpperCase()}
                            </span>
                          ) : (
                            <span className="badge badge-partial" style={{ padding: '2px 6px', fontSize: '0.58rem', borderRadius: '6px' }}>
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(0, 61, 130, 0.04)' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : ''} &nbsp;•&nbsp; {bill.items ? bill.items.length : 0} items
                      </span>
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* 6. Premium Grow Your Business Banner (Commercial Grade Promo Segment) */}
          <div className="grow-business-card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary-dark)', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
              Grow Your Business
            </h3>
            <div className="grow-business-content">
              <div className="grow-business-text">
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0, fontWeight: 600 }}>
                  Track, analyze and grow your laundry business with Dhobiq.
                </p>
                <Link to="/reports" className="btn btn-primary" style={{ 
                  padding: '8px 16px', 
                  fontSize: '0.78rem', 
                  borderRadius: '10px',
                  minHeight: 'auto', 
                  width: 'fit-content',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  fontWeight: 800
                }}>
                  View Reports
                </Link>
              </div>
              
              {/* Promotional report graphic */}
              <img 
                src="/reports.png" 
                alt="Business Analytics Illustration" 
                className="grow-business-img"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
