import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { Receipt, Users, Settings, FileText, TrendingUp, AlertCircle, DollarSign, Activity } from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import OfflineScreen from '../components/OfflineScreen';
import { runBillsMigrationIfNeeded, runInvoicePaymentMigrationIfNeeded } from '../utils/migration';

export default function Dashboard() {
  const [recentBills,    setRecentBills]    = useState([]);
  const [analytics,      setAnalytics]      = useState({
    totalRevenue: 0,
    monthlyRevenue: 0,
    pendingPayments: 0,
    billsThisMonth: 0,
    revenueData: []
  });
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);
  const [migrationDone,  setMigrationDone]  = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  // ── Migration (runs silently in background once) ───────────────────────────
  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        runBillsMigrationIfNeeded(),
        runInvoicePaymentMigrationIfNeeded()
      ])
        .then(([billsRes, invRes]) => {
          if (billsRes.ran && billsRes.migrated > 0) {
            console.log(`[Dashboard] Migration complete: ${billsRes.migrated} bills migrated`);
          }
          if (invRes.ran && invRes.migrated > 0) {
            console.log(`[Dashboard] Migration complete: ${invRes.migrated} invoices updated with payment structure`);
          }
          setMigrationDone(true);
        })
        .catch(() => setMigrationDone(true));
    } else {
      setMigrationDone(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecentBills = useCallback(async () => {
    if (!navigator.onLine) { setIsOfflineError(true); setLoading(false); return; }
    setLoading(true);
    setError(null);
    setIsOfflineError(false);

    let isMounted = true;
    const timeout = setTimeout(() => {
      if (isMounted) {
        setError('Connection is taking longer than expected.');
        setIsOfflineError(true);
        setLoading(false);
      }
    }, 15000);

    try {
      const q = query(collection(db, 'bills'), orderBy('date', 'desc'), limit(5));
      const [billsSnap, allInvoicesSnap, allBillsSnap] = await Promise.all([
        getDocs(q),
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'bills'))
      ]);

      const bills = [];
      billsSnap.forEach(d => bills.push({ id: d.id, ...d.data() }));

      // Calculate Analytics
      const now = new Date();
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);

      let totalRevenue = 0;
      let monthlyRevenue = 0;
      let pendingPayments = 0;
      let billsThisMonth = 0;

      // Process Invoices for revenue
      const monthlyDataMap = {};
      
      // Initialize last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        monthlyDataMap[format(d, 'MMM yy')] = { name: format(d, 'MMM yy'), revenue: 0, pending: 0 };
      }

      allInvoicesSnap.forEach(d => {
        const inv = d.data();
        const total = Number(inv.totalAmount) || 0;
        const paid = Number(inv.amountPaid) || 0;
        const balance = Number(inv.balanceAmount ?? total);
        
        totalRevenue += paid;
        pendingPayments += balance;

        const invDate = new Date(inv.invoiceDate || Date.now());
        if (isWithinInterval(invDate, { start: currentMonthStart, end: currentMonthEnd })) {
          monthlyRevenue += paid;
        }

        const monthKey = format(invDate, 'MMM yy');
        if (monthlyDataMap[monthKey]) {
          monthlyDataMap[monthKey].revenue += paid;
          monthlyDataMap[monthKey].pending += balance;
        }
      });

      allBillsSnap.forEach(d => {
        const bill = d.data();
        const billDate = new Date(bill.date || Date.now());
        if (isWithinInterval(billDate, { start: currentMonthStart, end: currentMonthEnd })) {
          billsThisMonth++;
        }
      });

      if (isMounted) {
        setRecentBills(bills);
        setAnalytics({
          totalRevenue,
          monthlyRevenue,
          pendingPayments,
          billsThisMonth,
          revenueData: Object.values(monthlyDataMap)
        });
        setError(null);
        setIsOfflineError(false);
        clearWasOffline();
      }
    } catch (err) {
      console.error('Error fetching recent bills:', err);
      reportError(err);
      if (isMounted) {
        if (isNetworkError(err)) setIsOfflineError(true);
        else setError('Failed to connect to database: ' + err.message);
      }
    } finally {
      clearTimeout(timeout);
      if (isMounted) setLoading(false);
      isMounted = false;
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchRecentBills(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOnline && wasOffline) fetchRecentBills(); }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && isOfflineError) return <OfflineScreen onRetry={fetchRecentBills} />;

  return (
    <div>
      {/* Page Header */}
      <div className="flex-between mb-2">
        <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Dashboard</h2>
        <Link to="/bills/new" className="btn btn-primary">+ New Bill</Link>
      </div>

      {/* Analytics Summary Cards */}
      <div className="dashboard-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="dashboard-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
            <DollarSign size={20} />
            <h3 style={{ margin: 0, color: 'var(--text-light)' }}>Monthly Rev</h3>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)', margin: '8px 0' }}>
            ₹{analytics.monthlyRevenue.toFixed(0)}
          </p>
        </div>
        
        <div className="dashboard-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
            <AlertCircle size={20} />
            <h3 style={{ margin: 0, color: 'var(--text-light)' }}>Pending</h3>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)', margin: '8px 0' }}>
            ₹{analytics.pendingPayments.toFixed(0)}
          </p>
        </div>

        <div className="dashboard-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <Activity size={20} />
            <h3 style={{ margin: 0, color: 'var(--text-light)' }}>Bills This Mo.</h3>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)', margin: '8px 0' }}>
            {analytics.billsThisMonth}
          </p>
        </div>
        
        <div className="dashboard-card" style={{ borderLeft: '4px solid #856404' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#856404' }}>
            <TrendingUp size={20} />
            <h3 style={{ margin: 0, color: 'var(--text-light)' }}>Total Rev</h3>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)', margin: '8px 0' }}>
            ₹{analytics.totalRevenue.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between' }}>
        <Link to="/bills" className="btn btn-secondary" style={{ flex: '1 1 120px' }}><Receipt size={16}/> Bills</Link>
        <Link to="/invoices" className="btn btn-secondary" style={{ flex: '1 1 120px' }}><FileText size={16}/> Invoices</Link>
        <Link to="/customers" className="btn btn-secondary" style={{ flex: '1 1 120px' }}><Users size={16}/> Customers</Link>
        <Link to="/services" className="btn btn-secondary" style={{ flex: '1 1 120px' }}><Settings size={16}/> Services</Link>
      </div>

      {/* Revenue Chart */}
      <div className="card">
        <h3 className="card-title">Revenue Trends (6 Months)</h3>
        {loading ? (
           <div className="loading-pulse" style={{ height: '250px' }}></div>
        ) : (
          <div style={{ height: '280px', width: '100%', marginTop: '16px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#666' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#666' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value) => [`₹${value}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent Bills */}
      <div className="card">
        <div className="flex-between mb-2">
          <h3 className="card-title" style={{ border: 'none', margin: 0 }}>Recent Bills</h3>
          <Link to="/bills" style={{ fontSize: '0.82rem', color: 'var(--primary)' }}>View all →</Link>
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
                    <td style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>{bill.billNumber || bill.id}</td>
                    <td>{bill.customerName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {bill.date ? format(new Date(bill.date), 'dd MMM yy') : ''}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>₹{Number(bill.totalAmount).toFixed(2)}</td>
                    <td>
                      {bill.invoiceId
                        ? <span className="badge badge-invoiced">Invoiced</span>
                        : <span className="badge badge-pending">Pending</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <p className="text-muted" style={{ marginBottom: '12px' }}>No bills yet. Create your first bill!</p>
            <Link to="/bills/new" className="btn btn-primary">+ New Bill</Link>
          </div>
        )}
      </div>
    </div>
  );
}
