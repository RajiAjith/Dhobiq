import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { FileText, Calendar, Search, Download, RefreshCw, BarChart, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [reportType, setReportType] = useState('revenue');
  
  // Filters
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Filter Source Lists
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [categories, setCategories] = useState([]);

  // Report Data
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState({ revenue: 0, expenses: 0, profit: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, reportError } = useNetwork();

  // Load filter metadata lists
  const loadFilters = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [custSnap, empSnap, catSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'expense_categories'))
      ]);

      const custs = [];
      custSnap.forEach(d => custs.push({ id: d.id, name: d.data().name }));
      setCustomers(custs.sort((a,b) => a.name.localeCompare(b.name)));

      const emps = [];
      empSnap.forEach(d => emps.push({ id: d.id, name: d.data().name }));
      setEmployees(emps.sort((a,b) => a.name.localeCompare(b.name)));

      const cats = [];
      catSnap.forEach(d => cats.push({ id: d.id, name: d.data().name }));
      const defaultCats = [
        'Salary', 'Rent', 'Electricity', 'Water', 'Chemical Purchase', 
        'Packaging Materials', 'Food', 'Fuel', 'Repairs', 'Maintenance', 'Miscellaneous'
      ];
      const mergedCats = cats.length > 0 
        ? [...new Set([...cats.map(c => c.name), ...defaultCats])]
        : defaultCats;
      setCategories(mergedCats.sort());
    } catch (e) {
      console.error('Error loading filter metadata:', e);
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // Generate Report Logic
  const generateReport = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      return;
    }
    setLoading(true);
    setError(null);
    setIsOfflineError(false);

    try {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      // Fetch required collections based on type
      let invoices = [];
      let expenses = [];
      let salaries = [];

      if (reportType === 'revenue' || reportType === 'customer' || reportType === 'service' || reportType === 'pnl') {
        const snap = await getDocs(collection(db, 'invoices'));
        snap.forEach(d => {
          const inv = d.data();
          const invDate = new Date(inv.invoiceDate || Date.now());
          if (isWithinInterval(invDate, { start, end })) {
            invoices.push({ id: d.id, ...inv });
          }
        });
      }

      if (reportType === 'expense' || reportType === 'category' || reportType === 'pnl') {
        const snap = await getDocs(collection(db, 'expenses'));
        snap.forEach(d => {
          const exp = d.data();
          const expDate = new Date(exp.date || Date.now());
          if (isWithinInterval(expDate, { start, end })) {
            expenses.push({ id: d.id, ...exp });
          }
        });
      }

      if (reportType === 'salary') {
        const snap = await getDocs(collection(db, 'salary_payments'));
        snap.forEach(d => {
          const sal = d.data();
          const pDate = new Date(sal.paymentDate || Date.now());
          if (isWithinInterval(pDate, { start, end })) {
            salaries.push({ id: d.id, ...sal });
          }
        });
      }

      // --- FORMAT AND FILTER SUB-REPORTS ---
      let resultData = [];
      let totalRev = 0;
      let totalExp = 0;

      if (reportType === 'revenue') {
        // Filter customer
        if (selectedCustomer !== 'all') {
          invoices = invoices.filter(inv => inv.customerId === selectedCustomer);
        }
        resultData = invoices.map(inv => {
          const paid = Number(inv.amountPaid) || 0;
          totalRev += paid;
          return {
            col1: inv.invoiceNumber || inv.id,
            col2: inv.customerName,
            col3: inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yyyy') : '',
            col4: `₹${Number(inv.totalAmount).toFixed(2)}`,
            col5: `₹${paid.toFixed(2)}`,
            col6: inv.paymentStatus?.toUpperCase() || 'UNPAID'
          };
        });
        setSummary({ revenue: totalRev, expenses: 0, profit: totalRev, count: resultData.length });
      }

      else if (reportType === 'expense') {
        // Filter category & vendor
        if (selectedCategory !== 'all') {
          expenses = expenses.filter(exp => exp.category === selectedCategory);
        }
        resultData = expenses.map(exp => {
          const amt = Number(exp.amount) || 0;
          totalExp += amt;
          return {
            col1: exp.date ? format(new Date(exp.date), 'dd MMM yyyy') : '',
            col2: exp.category,
            col3: exp.description,
            col4: exp.vendor || '—',
            col5: exp.paymentMethod || 'Cash',
            col6: `₹${amt.toFixed(2)}`
          };
        });
        setSummary({ revenue: 0, expenses: totalExp, profit: -totalExp, count: resultData.length });
      }

      else if (reportType === 'pnl') {
        // Calculate dynamic profit and loss
        const rev = invoices.reduce((acc, c) => acc + (Number(c.amountPaid) || 0), 0);
        const exp = expenses.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
        
        // Group by month for tabular drill down
        const pnlMonthly = {};
        invoices.forEach(inv => {
          const mKey = format(new Date(inv.invoiceDate), 'MMMM yyyy');
          if (!pnlMonthly[mKey]) pnlMonthly[mKey] = { revenue: 0, expenses: 0 };
          pnlMonthly[mKey].revenue += (Number(inv.amountPaid) || 0);
        });

        expenses.forEach(ex => {
          const mKey = format(new Date(ex.date), 'MMMM yyyy');
          if (!pnlMonthly[mKey]) pnlMonthly[mKey] = { revenue: 0, expenses: 0 };
          pnlMonthly[mKey].expenses += (Number(ex.amount) || 0);
        });

        resultData = Object.entries(pnlMonthly).map(([month, val]) => ({
          col1: month,
          col2: `₹${val.revenue.toFixed(2)}`,
          col3: `₹${val.expenses.toFixed(2)}`,
          col4: `₹ ${(val.revenue - val.expenses).toFixed(2)}`,
          col5: val.revenue >= val.expenses ? 'NET SURPLUS' : 'NET DEFICIT',
          col6: ''
        }));

        setSummary({ revenue: rev, expenses: exp, profit: rev - exp, count: resultData.length });
      }

      else if (reportType === 'salary') {
        if (selectedEmployee !== 'all') {
          salaries = salaries.filter(sal => sal.employeeId === selectedEmployee);
        }
        resultData = salaries.map(sal => {
          const amt = Number(sal.amount) || 0;
          totalExp += amt;
          
          // Format month string YYYY-MM to MMMM YYYY
          let formattedMonth = sal.salaryMonth;
          try {
            const [y, m] = sal.salaryMonth.split('-');
            const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
            formattedMonth = format(d, 'MMMM yyyy');
          } catch(e){}

          return {
            col1: sal.employeeName,
            col2: formattedMonth,
            col3: sal.paymentDate ? format(new Date(sal.paymentDate), 'dd MMM yyyy') : '',
            col4: sal.notes || '—',
            col5: `₹${amt.toFixed(2)}`,
            col6: ''
          };
        });
        setSummary({ revenue: 0, expenses: totalExp, profit: -totalExp, count: resultData.length });
      }

      else if (reportType === 'category') {
        const catMap = {};
        expenses.forEach(ex => {
          const c = ex.category || 'Miscellaneous';
          catMap[c] = (catMap[c] || 0) + (Number(ex.amount) || 0);
        });

        resultData = Object.entries(catMap)
          .map(([category, amt]) => {
            totalExp += amt;
            return {
              col1: category,
              col2: `₹${amt.toFixed(2)}`,
              col3: `${((amt / (expenses.reduce((a,cr) => a + Number(cr.amount), 0) || 1)) * 100).toFixed(1)}%`,
              col4: '', col5: '', col6: ''
            };
          })
          .sort((a,b) => b.col1.localeCompare(a.col1));

        setSummary({ revenue: 0, expenses: totalExp, profit: -totalExp, count: resultData.length });
      }

      else if (reportType === 'customer') {
        const custMap = {};
        invoices.forEach(inv => {
          const name = inv.customerName || 'Unknown Customer';
          if (!custMap[name]) custMap[name] = { sales: 0, payments: 0, pending: 0 };
          custMap[name].sales += (Number(inv.totalAmount) || 0);
          custMap[name].payments += (Number(inv.amountPaid) || 0);
          custMap[name].pending += (Number(inv.balanceAmount) || 0);
        });

        resultData = Object.entries(custMap)
          .map(([name, data]) => {
            totalRev += data.payments;
            return {
              col1: name,
              col2: `₹${data.sales.toFixed(2)}`,
              col3: `₹${data.payments.toFixed(2)}`,
              col4: `₹${data.pending.toFixed(2)}`,
              col5: '', col6: ''
            };
          })
          .sort((a,b) => b.col1.localeCompare(a.col1));

        setSummary({ revenue: totalRev, expenses: 0, profit: totalRev, count: resultData.length });
      }

      else if (reportType === 'service') {
        const svcMap = {};
        invoices.forEach(inv => {
          if (inv.items) {
            inv.items.forEach(item => {
              const sname = item.name || 'Miscellaneous';
              if (!svcMap[sname]) svcMap[sname] = { qty: 0, revenue: 0 };
              svcMap[sname].qty += (Number(item.quantity) || 0);
              svcMap[sname].revenue += (Number(item.total) || 0);
            });
          }
        });

        resultData = Object.entries(svcMap)
          .map(([sname, val]) => {
            totalRev += val.revenue;
            return {
              col1: sname,
              col2: `${val.qty} Units`,
              col3: `₹${val.revenue.toFixed(2)}`,
              col4: '', col5: '', col6: ''
            };
          })
          .sort((a,b) => b.col1.localeCompare(a.col1));

        setSummary({ revenue: totalRev, expenses: 0, profit: totalRev, count: resultData.length });
      }

      setReportData(resultData);

    } catch (err) {
      console.error('Error generating report:', err);
      setError('Failed to query report: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [reportType, fromDate, toDate, selectedCategory, selectedCustomer, selectedEmployee]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  useEffect(() => {
    if (isOnline && wasOffline) generateReport();
  }, [isOnline, wasOffline, generateReport]);

  // Export to PDF
  const handleExportPDF = async () => {
    const docPdf = new jsPDF();
    
    // 1. Fetch settings for headers/footers
    let settings = { name: 'Dhobiq Laundry', phone: '+91-9061504910', address: "Near MacDonald's | Alappuzha" };
    try {
      const snap = await getDoc(doc(db, 'settings', 'general'));
      if (snap.exists()) settings = snap.data();
    } catch(e){}

    // 2. Draw Header
    docPdf.setFillColor(240, 244, 248);
    docPdf.rect(0, 0, 210, 297, 'F');
    
    docPdf.setTextColor(0, 51, 102);
    docPdf.setFontSize(20);
    docPdf.setFont('Helvetica', 'bold');
    docPdf.text(settings.name, 14, 20);
    
    docPdf.setFontSize(9);
    docPdf.setFont('Helvetica', 'normal');
    docPdf.setTextColor(100, 100, 100);
    docPdf.text(`Contact: ${settings.phone} | Address: ${settings.address}`, 14, 26);

    // 3. Document Title
    const formattedReportType = reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' Report';
    docPdf.setFontSize(14);
    docPdf.setFont('Helvetica', 'bold');
    docPdf.setTextColor(0, 51, 102);
    docPdf.text(`${formattedReportType} Summary`, 14, 40);
    
    docPdf.setFontSize(10);
    docPdf.setFont('Helvetica', 'normal');
    docPdf.setTextColor(80, 80, 80);
    const dateRange = `Period: ${format(new Date(fromDate), 'dd MMM yyyy')} to ${format(new Date(toDate), 'dd MMM yyyy')}`;
    docPdf.text(dateRange, 14, 46);

    // 4. Summaries card block
    docPdf.setFillColor(255, 255, 255);
    docPdf.rect(14, 52, 182, 22, 'F');
    docPdf.setDrawColor(226, 232, 240);
    docPdf.rect(14, 52, 182, 22);

    docPdf.setFontSize(8);
    docPdf.setTextColor(100, 100, 100);
    docPdf.text('TOTAL REVENUE', 20, 60);
    docPdf.text('TOTAL EXPENSES', 80, 60);
    docPdf.text('NET PROFIT/LOSS', 140, 60);

    docPdf.setFontSize(11);
    docPdf.setFont('Helvetica', 'bold');
    docPdf.setTextColor(16, 185, 129); // green
    docPdf.text(`₹${summary.revenue.toFixed(2)}`, 20, 67);
    docPdf.setTextColor(239, 68, 68); // red
    docPdf.text(`₹${summary.expenses.toFixed(2)}`, 80, 67);
    docPdf.setTextColor(summary.profit >= 0 ? 16 : 239, summary.profit >= 0 ? 185 : 68, summary.profit >= 0 ? 129 : 68);
    docPdf.text(`₹${summary.profit.toFixed(2)}`, 140, 67);

    // 5. Table setup
    let headers = [];
    if (reportType === 'revenue') headers = [['Invoice #', 'Customer', 'Date', 'Total Amount', 'Amount Paid', 'Status']];
    else if (reportType === 'expense') headers = [['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount']];
    else if (reportType === 'pnl') headers = [['Period/Month', 'Revenue', 'Expenses', 'Net Profit/Loss', 'Remarks']];
    else if (reportType === 'salary') headers = [['Staff Name', 'Month', 'Date Paid', 'Notes', 'Amount']];
    else if (reportType === 'category') headers = [['Expense Category', 'Total Amount', 'Percentage']];
    else if (reportType === 'customer') headers = [['Customer Name', 'Total Sales', 'Payments Received', 'Outstanding Balance']];
    else if (reportType === 'service') headers = [['Service Item', 'Volume Billed', 'Sales Revenue']];

    const bodyData = reportData.map(row => {
      const data = [row.col1, row.col2, row.col3, row.col4, row.col5, row.col6];
      return data.filter(val => val !== undefined && val !== '');
    });

    autoTable(docPdf, {
      startY: 82,
      head: headers,
      body: bodyData,
      theme: 'striped',
      headStyles: { fillColor: [0, 51, 102], fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 249, 250] }
    });

    // 6. Draw Footer
    const finalY = docPdf.lastAutoTable.finalY + 20;
    docPdf.setFontSize(8);
    docPdf.setFont('Helvetica', 'normal');
    docPdf.setTextColor(150, 150, 150);
    docPdf.text('Generated electronically via Dhobiq Laundry Management Console.', 105, 280, { align: 'center' });

    docPdf.save(`Report-${reportType}-${fromDate}-to-${toDate}.pdf`);
  };

  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={generateReport} />;
  }

  // Preview Headers list
  let previewHeaders = [];
  if (reportType === 'revenue') previewHeaders = ['Invoice #', 'Customer', 'Date', 'Total', 'Paid', 'Status'];
  else if (reportType === 'expense') previewHeaders = ['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount'];
  else if (reportType === 'pnl') previewHeaders = ['Period/Month', 'Revenue', 'Expenses', 'Net P&L', 'Remarks'];
  else if (reportType === 'salary') previewHeaders = ['Staff Name', 'Month', 'Date Paid', 'Notes', 'Amount'];
  else if (reportType === 'category') previewHeaders = ['Expense Category', 'Total Amount', 'Percentage'];
  else if (reportType === 'customer') previewHeaders = ['Customer Name', 'Total Sales', 'Payments Received', 'Outstanding'];
  else if (reportType === 'service') previewHeaders = ['Service Item', 'Volume Billed', 'Sales Revenue'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title Header */}
      <div className="flex-between mb-2" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Business Reports</h2>
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>Analyze sales margins, operational costs, employee payroll, and service metrics</p>
        </div>
        <button 
          onClick={handleExportPDF} 
          disabled={reportData.length === 0 || loading} 
          className="btn btn-primary"
          style={{ gap: '8px' }}
        >
          <Download size={16} /> Export PDF Report
        </button>
      </div>

      {/* Select Report Type Cards Grid */}
      <div className="dashboard-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '4px' }}>
        <button className={`btn ${reportType === 'revenue' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('revenue')}>
          Revenue Report
        </button>
        <button className={`btn ${reportType === 'expense' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('expense')}>
          Expense Report
        </button>
        <button className={`btn ${reportType === 'pnl' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('pnl')}>
          Profit & Loss (P&L)
        </button>
        <button className={`btn ${reportType === 'salary' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('salary')}>
          Staff Salary
        </button>
        <button className={`btn ${reportType === 'category' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('category')}>
          Expense Category
        </button>
        <button className={`btn ${reportType === 'customer' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('customer')}>
          Customer Sales
        </button>
        <button className={`btn ${reportType === 'service' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '12px 6px', fontSize: '0.8rem' }} onClick={() => setReportType('service')}>
          Service Sales
        </button>
      </div>

      {/* Advanced Filter Criteria Section */}
      <div className="filters-section" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <div className="filter-item">
          <label htmlFor="rep-from">From Date</label>
          <input
            id="rep-from"
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="form-control"
          />
        </div>

        <div className="filter-item">
          <label htmlFor="rep-to">To Date</label>
          <input
            id="rep-to"
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="form-control"
          />
        </div>

        {/* Dynamic Context Filters */}
        {reportType === 'revenue' && (
          <div className="filter-item">
            <label htmlFor="rep-cust">Customer</label>
            <select
              id="rep-cust"
              value={selectedCustomer}
              onChange={e => setSelectedCustomer(e.target.value)}
              className="form-control"
            >
              <option value="all">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'expense' && (
          <div className="filter-item">
            <label htmlFor="rep-cat">Expense Category</label>
            <select
              id="rep-cat"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="form-control"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'salary' && (
          <div className="filter-item">
            <label htmlFor="rep-emp">Employee</label>
            <select
              id="rep-emp"
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
              className="form-control"
            >
              <option value="all">All Staff</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Aggregate Report Summary Cards */}
      <div className="dashboard-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        
        {/* Total revenue summary */}
        <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', borderLeft: '4px solid var(--success)', margin: 0 }}>
          <span className="text-muted" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={14} className="text-success" /> Total Revenue
          </span>
          <strong style={{ fontSize: '1.4rem', color: 'var(--text)', marginTop: '4px' }}>
            ₹{summary.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </strong>
        </div>

        {/* Total expenses summary */}
        <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', borderLeft: '4px solid var(--danger)', margin: 0 }}>
          <span className="text-muted" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingDown size={14} className="text-danger" /> Total Expenses
          </span>
          <strong style={{ fontSize: '1.4rem', color: 'var(--text)', marginTop: '4px' }}>
            ₹{summary.expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </strong>
        </div>

        {/* Total net surplus summary */}
        <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', borderLeft: `4px solid ${summary.profit >= 0 ? 'var(--success)' : 'var(--danger)'}`, margin: 0 }}>
          <span className="text-muted" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <DollarSign size={14} style={{ color: summary.profit >= 0 ? 'var(--success)' : 'var(--danger)' }} /> Net Balance Surplus
          </span>
          <strong style={{ fontSize: '1.4rem', color: summary.profit >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
            ₹{summary.profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </strong>
        </div>
      </div>

      {/* Dynamic Tabular Preview Area */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--primary)' }}>
            On-Screen Preview ({reportData.length} records found)
          </span>
          <button onClick={generateReport} className="btn-icon" style={{ minWidth: 0, minHeight: 0, padding: '4px' }} title="Reload Report">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '24px' }}>
            <div className="loading-pulse">
              <div className="loading-pulse__bar" style={{ width: '40%' }} />
              <div className="loading-pulse__bar" />
            </div>
          </div>
        ) : reportData.length > 0 ? (
          <div className="table-responsive" style={{ margin: 0, borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
            <table className="table">
              <thead>
                <tr>
                  {previewHeaders.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{row.col1}</td>
                    {row.col2 !== undefined && row.col2 !== '' && <td>{row.col2}</td>}
                    {row.col3 !== undefined && row.col3 !== '' && <td>{row.col3}</td>}
                    {row.col4 !== undefined && row.col4 !== '' && <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.col4}</td>}
                    {row.col5 !== undefined && row.col5 !== '' && <td>{row.col5}</td>}
                    {row.col6 !== undefined && row.col6 !== '' && (
                      <td>
                        <span className={`badge ${
                          row.col6 === 'PAID' || row.col6 === 'NET SURPLUS' ? 'badge-active' : 
                          row.col6 === 'PARTIAL' ? 'badge-warning' : 'badge-inactive'
                        }`}>
                          {row.col6}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-light)', fontSize: '0.85rem' }}>
            No records matched the filter criteria in this period.
          </div>
        )}
      </div>
    </div>
  );
}
