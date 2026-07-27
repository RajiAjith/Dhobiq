import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  FileText, 
  Calendar, 
  Search, 
  Download, 
  RefreshCw, 
  BarChart, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  User, 
  ShoppingBag,
  Receipt
} from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  buildReportSummary, 
  getExpensesTotal, 
  getInvoiceRevenueForPeriod, 
  getInvoiceRevenueTotal, 
  getReportDateRange 
} from '../utils/reportUtils';
import { getInvoicePaymentEntries } from '../utils/paymentUtils';
import { formatCurrency } from '../utils/currencyFormatter';

export default function Reports() {
  const [reportType, setReportType] = useState('sales');
  
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
  const [summary, setSummary] = useState({ sales: 0, revenue: 0, expenses: 0, profit: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, reportError } = useNetwork();

  const reportTypes = [
    { id: 'sales', label: 'Sales', icon: Receipt, color: '#2563eb' },
    { id: 'revenue', label: 'Revenue', icon: TrendingUp, color: '#16a34a' },
    { id: 'expense', label: 'Expenses', icon: TrendingDown, color: '#dc2626' },
    { id: 'pnl', label: 'P & L', icon: DollarSign, color: '#2563eb' },
    { id: 'salary', label: 'Staff Salary', icon: Users, color: '#7c3aed' },
    { id: 'category', label: 'Categories', icon: BarChart, color: '#ea580c' },
    { id: 'customer', label: 'Customers', icon: User, color: '#0891b2' },
    { id: 'service', label: 'Services', icon: ShoppingBag, color: '#db2777' },
  ];

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
      const { start, end } = getReportDateRange(fromDate, toDate);

      // Fetch required collections based on type
      let invoices = [];
      let expenses = [];
      let salaries = [];
      let bills = [];

      if (reportType === 'revenue' || reportType === 'customer' || reportType === 'service' || reportType === 'pnl' || reportType === 'expense' || reportType === 'category') {
        const snap = await getDocs(collection(db, 'invoices'));
        snap.forEach(d => {
          invoices.push({ id: d.id, ...d.data() });
        });
      }

      if (reportType === 'expense' || reportType === 'category' || reportType === 'pnl' || reportType === 'sales') {
        const snap = await getDocs(collection(db, 'expenses'));
        snap.forEach(d => {
          expenses.push({ id: d.id, ...d.data() });
        });
      }

      if (reportType === 'salary') {
        const snap = await getDocs(collection(db, 'salary_payments'));
        snap.forEach(d => {
          salaries.push({ id: d.id, ...d.data() });
        });
      }

      if (reportType === 'sales') {
        const snap = await getDocs(collection(db, 'bills'));
        snap.forEach(d => {
          bills.push({ id: d.id, ...d.data() });
        });
      }

      // --- FORMAT AND FILTER SUB-REPORTS ---
      let resultData = [];
      let filteredInvoices = invoices.filter((inv) => selectedCustomer === 'all' || inv.customerId === selectedCustomer);
      let filteredExpenses = expenses.filter((exp) => {
        const expDate = new Date(exp.date || Date.now());
        return expDate >= start && expDate <= end;
      });
      let filteredSalaries = salaries.filter((sal) => {
        const payDate = new Date(sal.paymentDate || Date.now());
        return payDate >= start && payDate <= end;
      });

      if (reportType === 'expense') {
        filteredExpenses = filteredExpenses.filter((exp) => selectedCategory === 'all' || exp.category === selectedCategory);
      }

      if (reportType === 'salary' && selectedEmployee !== 'all') {
        filteredSalaries = filteredSalaries.filter((sal) => sal.employeeId === selectedEmployee);
      }

      const revenueFromInvoices = getInvoiceRevenueTotal(filteredInvoices, start, end);
      const expensesFromFilteredData = getExpensesTotal(filteredExpenses, start, end);

      if (reportType === 'sales') {
        let filteredBills = bills.filter((bill) => {
          const billDate = new Date(bill.date || Date.now());
          return billDate >= start && billDate <= end;
        });

        if (selectedCustomer !== 'all') {
          filteredBills = filteredBills.filter((bill) => bill.customerId === selectedCustomer);
        }

        resultData = filteredBills.map((bill) => {
          const statusLabel = bill.invoiceId ? 'INVOICED' : 'PENDING';
          return {
            col1: bill.billNumber || bill.id,
            col2: bill.customerName || 'Unknown Customer',
            col3: bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : '',
            col4: bill.items ? `${bill.items.length} items` : '0 items',
            col5: formatCurrency(Number(bill.totalAmount || 0)),
            col6: statusLabel
          };
        });

        const totalSalesAmount = filteredBills.reduce((acc, b) => acc + Number(b.totalAmount || 0), 0);
        const totalExpensesAmount = getExpensesTotal(filteredExpenses, start, end);

        setSummary({
          sales: totalSalesAmount,
          revenue: revenueFromInvoices,
          expenses: totalExpensesAmount,
          profit: totalSalesAmount - totalExpensesAmount,
          count: resultData.length
        });
      }
      else if (reportType === 'revenue') {
        resultData = filteredInvoices
          .map((inv) => {
            const paid = getInvoiceRevenueForPeriod(inv, start, end);
            if (paid <= 0) return null;

            return {
              col1: inv.invoiceNumber || inv.id,
              col2: inv.customerName,
              col3: inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yyyy') : '',
              col4: formatCurrency(Number(inv.totalAmount)),
              col5: formatCurrency(paid),
              col6: inv.paymentStatus?.toUpperCase() || 'UNPAID'
            };
          })
          .filter(Boolean);

        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: expensesFromFilteredData, count: resultData.length }));
      }

      else if (reportType === 'expense') {
        resultData = filteredExpenses.map((exp) => {
          const amt = Number(exp.amount) || 0;
          return {
            col1: exp.date ? format(new Date(exp.date), 'dd MMM yyyy') : '',
            col2: exp.category,
            col3: exp.description,
            col4: exp.vendor || '—',
            col5: exp.paymentMethod || 'Cash',
            col6: formatCurrency(amt)
          };
        });
        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: expensesFromFilteredData, count: resultData.length }));
      }

      else if (reportType === 'pnl') {
        const pnlMonthly = {};
        filteredInvoices.forEach((inv) => {
          const payments = getInvoicePaymentEntries(inv).filter((payment) => {
            const paymentDate = new Date(payment.paymentDate || Date.now());
            return paymentDate >= start && paymentDate <= end;
          });

          payments.forEach((payment) => {
            const paymentDate = new Date(payment.paymentDate || Date.now());
            const mKey = format(paymentDate, 'MMMM yyyy');
            if (!pnlMonthly[mKey]) pnlMonthly[mKey] = { revenue: 0, expenses: 0 };
            pnlMonthly[mKey].revenue += Number(payment.amount || 0);
          });
        });

        filteredExpenses.forEach((ex) => {
          const mKey = format(new Date(ex.date || Date.now()), 'MMMM yyyy');
          if (!pnlMonthly[mKey]) pnlMonthly[mKey] = { revenue: 0, expenses: 0 };
          pnlMonthly[mKey].expenses += (Number(ex.amount) || 0);
        });

        resultData = Object.entries(pnlMonthly).map(([month, val]) => ({
          col1: month,
          col2: formatCurrency(val.revenue),
          col3: formatCurrency(val.expenses),
          col4: formatCurrency((val.revenue - val.expenses)),
          col5: val.revenue >= val.expenses ? 'NET SURPLUS' : 'NET DEFICIT',
          col6: ''
        }));

        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: expensesFromFilteredData, count: resultData.length }));
      }

      else if (reportType === 'salary') {
        resultData = filteredSalaries.map((sal) => {
          const amt = Number(sal.amount) || 0;

          let formattedMonth = sal.salaryMonth;
          try {
            const [y, m] = sal.salaryMonth.split('-');
            const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
            formattedMonth = format(d, 'MMMM yyyy');
          } catch (e) {}

          return {
            col1: sal.employeeName,
            col2: formattedMonth,
            col3: sal.paymentDate ? format(new Date(sal.paymentDate), 'dd MMM yyyy') : '',
            col4: sal.notes || '—',
            col5: formatCurrency(amt),
            col6: ''
          };
        });
        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: filteredSalaries.reduce((acc, sal) => acc + (Number(sal.amount) || 0), 0), count: resultData.length }));
      }

      else if (reportType === 'category') {
        const catMap = {};
        filteredExpenses.forEach((ex) => {
          const c = ex.category || 'Miscellaneous';
          catMap[c] = (catMap[c] || 0) + (Number(ex.amount) || 0);
        });

        resultData = Object.entries(catMap)
          .map(([category, amt]) => ({
            col1: category,
            col2: formatCurrency(amt),
            col3: `${((amt / (filteredExpenses.reduce((a, cr) => a + Number(cr.amount), 0) || 1)) * 100).toFixed(1)}%`,
            col4: '', col5: '', col6: ''
          }))
          .sort((a, b) => b.col1.localeCompare(a.col1));

        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: expensesFromFilteredData, count: resultData.length }));
      }

      else if (reportType === 'customer') {
        const custMap = {};
        filteredInvoices.forEach((inv) => {
          const paymentValue = getInvoiceRevenueForPeriod(inv, start, end);
          if (paymentValue <= 0) return;

          const name = inv.customerName || 'Unknown Customer';
          if (!custMap[name]) custMap[name] = { sales: 0, payments: 0, pending: 0 };
          custMap[name].sales += (Number(inv.totalAmount) || 0);
          custMap[name].payments += paymentValue;
          custMap[name].pending += Math.max(0, (Number(inv.totalAmount) || 0) - paymentValue);
        });

        resultData = Object.entries(custMap)
          .map(([name, data]) => ({
            col1: name,
            col2: formatCurrency(data.sales),
            col3: formatCurrency(data.payments),
            col4: formatCurrency(data.pending),
            col5: '', col6: ''
          }))
          .sort((a, b) => b.col1.localeCompare(a.col1));

        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: expensesFromFilteredData, count: resultData.length }));
      }

      else if (reportType === 'service') {
        const svcMap = {};
        filteredInvoices.forEach((inv) => {
          const paymentValue = getInvoiceRevenueForPeriod(inv, start, end);
          if (paymentValue <= 0 || !inv.items) return;

          const invoiceTotal = Number(inv.totalAmount) || 0;
          const paymentShare = invoiceTotal > 0 ? paymentValue / invoiceTotal : 0;

          inv.items.forEach((item) => {
            const sname = item.name || 'Miscellaneous';
            if (!svcMap[sname]) svcMap[sname] = { qty: 0, revenue: 0 };
            const itemQty = Number(item.quantity) || 0;
            const itemRevenue = (Number(item.total) || 0) * paymentShare;
            svcMap[sname].qty += itemQty;
            svcMap[sname].revenue += itemRevenue;
          });
        });

        resultData = Object.entries(svcMap)
          .map(([sname, val]) => ({
            col1: sname,
            col2: `${val.qty} Units`,
            col3: formatCurrency(val.revenue),
            col4: '', col5: '', col6: ''
          }))
          .sort((a, b) => b.col1.localeCompare(a.col1));

        setSummary(buildReportSummary({ revenue: revenueFromInvoices, expenses: expensesFromFilteredData, count: resultData.length }));
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
    const formattedReportType = reportType === 'sales' ? 'Sales Report' : (reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' Report');
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
    docPdf.text(reportType === 'sales' ? 'TOTAL SALES' : 'TOTAL REVENUE', 20, 60);
    docPdf.text('TOTAL EXPENSES', 80, 60);
    docPdf.text(reportType === 'sales' ? 'NET MARGIN' : 'NET PROFIT/LOSS', 140, 60);

    docPdf.setFontSize(11);
    docPdf.setFont('Helvetica', 'bold');
    docPdf.setTextColor(16, 185, 129); // green
    docPdf.text(formatCurrency(reportType === 'sales' ? summary.sales : summary.revenue), 20, 67);
    docPdf.setTextColor(239, 68, 68); // red
    docPdf.text(formatCurrency(summary.expenses), 80, 67);
    docPdf.setTextColor(summary.profit >= 0 ? 16 : 239, summary.profit >= 0 ? 185 : 68, summary.profit >= 0 ? 129 : 68);
    docPdf.text(formatCurrency(summary.profit), 140, 67);

    // 5. Table setup
    let headers = [];
    if (reportType === 'sales') headers = [['Bill #', 'Customer', 'Date', 'Items', 'Total Amount', 'Status']];
    else if (reportType === 'revenue') headers = [['Invoice #', 'Customer', 'Date', 'Total Amount', 'Amount Paid', 'Status']];
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
  if (reportType === 'sales') previewHeaders = ['Bill #', 'Customer', 'Date', 'Items', 'Total', 'Status'];
  else if (reportType === 'revenue') previewHeaders = ['Invoice #', 'Customer', 'Date', 'Total', 'Paid', 'Status'];
  else if (reportType === 'expense') previewHeaders = ['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount'];
  else if (reportType === 'pnl') previewHeaders = ['Period/Month', 'Revenue', 'Expenses', 'Net P&L', 'Remarks'];
  else if (reportType === 'salary') previewHeaders = ['Staff Name', 'Month', 'Date Paid', 'Notes', 'Amount'];
  else if (reportType === 'category') previewHeaders = ['Expense Category', 'Total Amount', 'Percentage'];
  else if (reportType === 'customer') previewHeaders = ['Customer Name', 'Total Sales', 'Payments Received', 'Outstanding'];
  else if (reportType === 'service') previewHeaders = ['Service Item', 'Volume Billed', 'Sales Revenue'];

  const renderTableCell = (val, colKey) => {
    if (val === undefined || val === '') return null;
    const badgeColors = {
      'PAID': 'badge-active',
      'NET SURPLUS': 'badge-active',
      'INVOICED': 'badge-active',
      'PARTIAL': 'badge-warning',
      'PENDING': 'badge-warning',
      'UNPAID': 'badge-inactive',
      'NET DEFICIT': 'badge-inactive',
    };
    const isBadge = val in badgeColors;
    return (
      <td key={colKey} style={colKey === 'col1' ? { fontWeight: 600 } : {}}>
        {isBadge ? (
          <span className={`badge ${badgeColors[val]}`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
            {val}
          </span>
        ) : (
          val
        )}
      </td>
    );
  };

  const renderMobileCard = (row, idx) => {
    switch (reportType) {
      case 'sales':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col1}
              </span>
              <span className={`badge ${
                row.col6 === 'INVOICED' ? 'badge-active' : 'badge-warning'
              }`} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                {row.col6}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <span>Customer: <strong>{row.col2}</strong></span>
              <span>{row.col3}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', borderTop: '1px dashed var(--border-light)', paddingTop: '6px', marginTop: '2px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Items: <strong style={{ color: 'var(--text-primary)' }}>{row.col4}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--primary)' }}>{row.col5}</strong></span>
            </div>
          </div>
        );
      case 'revenue':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col1}
              </span>
              <span className={`badge ${
                row.col6 === 'PAID' ? 'badge-active' : 
                row.col6 === 'PARTIAL' ? 'badge-warning' : 'badge-inactive'
              }`} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                {row.col6}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <span>Customer: <strong>{row.col2}</strong></span>
              <span>{row.col3}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', borderTop: '1px dashed var(--border-light)', paddingTop: '6px', marginTop: '2px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--text-primary)' }}>{row.col4}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Paid: <strong style={{ color: 'var(--success)' }}>{row.col5}</strong></span>
            </div>
          </div>
        );
      case 'expense':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.06)', color: '#ef4444', fontSize: '0.65rem', padding: '2px 6px', fontWeight: 700 }}>
                  {row.col2}
                </span>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {row.col3}
                </div>
              </div>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--danger)' }}>
                {row.col6}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(0, 61, 130, 0.02)', paddingTop: '6px' }}>
              <span>Vendor: <strong>{row.col4}</strong></span>
              <span>Method: <strong>{row.col5}</strong></span>
              <span>{row.col1}</span>
            </div>
          </div>
        );
      case 'pnl':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col1}
              </span>
              <span className={`badge ${row.col5 === 'NET SURPLUS' ? 'badge-active' : 'badge-inactive'}`} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                {row.col5}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '0.74rem', borderTop: '1px dashed var(--border-light)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="text-muted" style={{ fontSize: '0.62rem' }}>Revenue</span>
                <span style={{ fontWeight: 700, color: 'var(--success)' }}>{row.col2}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="text-muted" style={{ fontSize: '0.62rem' }}>Expenses</span>
                <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{row.col3}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                <span className="text-muted" style={{ fontSize: '0.62rem' }}>Net P&L</span>
                <span style={{ fontWeight: 800, color: row.col5 === 'NET SURPLUS' ? 'var(--success)' : 'var(--danger)' }}>{row.col4}</span>
              </div>
            </div>
          </div>
        );
      case 'salary':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col1}
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--primary)' }}>
                {row.col5}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <span>Salary for: <strong>{row.col2}</strong></span>
              <span>Paid on: <strong>{row.col3}</strong></span>
            </div>
            {row.col4 && row.col4 !== '—' && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--surface-overlay)', padding: '6px 8px', borderRadius: '6px', marginTop: '4px' }}>
                {row.col4}
              </div>
            )}
          </div>
        );
      case 'category':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col1}
              </span>
              <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                Share of total expenses
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col2}
              </span>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', marginTop: '2px' }}>
                {row.col3}
              </div>
            </div>
          </div>
        );
      case 'customer':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {row.col1}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '0.74rem', borderTop: '1px dashed var(--border-light)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="text-muted" style={{ fontSize: '0.62rem' }}>Total Sales</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.col2}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="text-muted" style={{ fontSize: '0.62rem' }}>Paid</span>
                <span style={{ fontWeight: 700, color: 'var(--success)' }}>{row.col3}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                <span className="text-muted" style={{ fontSize: '0.62rem' }}>Outstanding</span>
                <span style={{ fontWeight: 700, color: row.col4 !== '₹0' && row.col4 !== '₹0.00' ? 'var(--danger)' : 'var(--text-light)' }}>{row.col4}</span>
              </div>
            </div>
          </div>
        );
      case 'service':
        return (
          <div key={idx} className="list-card" style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0, 61, 130, 0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {row.col1}
              </span>
              <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                Volume Billed: <strong>{row.col2}</strong>
              </div>
            </div>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {row.col3}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      
      {/* CSS overrides for desktop vs mobile preview tables */}
      <style>{`
        .desktop-only-table { display: block; }
        .mobile-only-cards { display: none; }
        @media (max-width: 767px) {
          .desktop-only-table { display: none !important; }
          .mobile-only-cards { display: flex !important; flex-direction: column; gap: 10px; padding: 12px; }
        }
      `}</style>

      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Business Reports</h2>
          <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: '2px', margin: 0 }}>Analyze sales margins, operations, payroll, and service metrics</p>
        </div>
        <button 
          onClick={handleExportPDF} 
          disabled={reportData.length === 0 || loading} 
          className="btn btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.78rem', minHeight: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Download size={14} /> Export PDF Report
        </button>
      </div>

      {/* Modern Horizontally Scrollable Report Type Selector */}
      <div 
        className="report-types-scroll hide-scrollbar"
        style={{ 
          display: 'flex', 
          gap: '6px', 
          overflowX: 'auto', 
          paddingBottom: '4px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {reportTypes.map((t) => {
          const Icon = t.icon;
          const isActive = reportType === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setReportType(t.id);
                setSelectedCustomer('all');
                setSelectedEmployee('all');
                setSelectedCategory('all');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1.5px solid',
                borderColor: isActive ? 'rgba(0, 82, 204, 0.18)' : 'var(--border-light)',
                background: isActive ? 'rgba(0, 82, 204, 0.05)' : '#ffffff',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all var(--t-base)'
              }}
            >
              <Icon size={13} style={{ color: isActive ? t.color : 'var(--text-light)' }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Advanced Filter Criteria Section */}
      <div className="filters-section" style={{ margin: 0 }}>
        <div className="filter-item">
          <label className="filter-label" htmlFor="rep-from">From Date</label>
          <input
            id="rep-from"
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="form-control"
            style={{ fontSize: '0.8rem', height: '36px' }}
          />
        </div>

        <div className="filter-item">
          <label className="filter-label" htmlFor="rep-to">To Date</label>
          <input
            id="rep-to"
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="form-control"
            style={{ fontSize: '0.8rem', height: '36px' }}
          />
        </div>

        {/* Dynamic Context Filters */}
        {(reportType === 'revenue' || reportType === 'sales') && (
          <div className="filter-item" style={{ gridColumn: 'span 2' }}>
            <label className="filter-label" htmlFor="rep-cust">Customer</label>
            <select
              id="rep-cust"
              value={selectedCustomer}
              onChange={e => setSelectedCustomer(e.target.value)}
              className="form-control"
              style={{ fontSize: '0.8rem', height: '36px' }}
            >
              <option value="all">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'expense' && (
          <div className="filter-item" style={{ gridColumn: 'span 2' }}>
            <label className="filter-label" htmlFor="rep-cat">Expense Category</label>
            <select
              id="rep-cat"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="form-control"
              style={{ fontSize: '0.8rem', height: '36px' }}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'salary' && (
          <div className="filter-item" style={{ gridColumn: 'span 2' }}>
            <label className="filter-label" htmlFor="rep-emp">Employee</label>
            <select
              id="rep-emp"
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
              className="form-control"
              style={{ fontSize: '0.8rem', height: '36px' }}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
        
        {/* Total revenue summary */}
        <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', borderLeft: '3px solid var(--success)', margin: 0 }}>
          <span className="text-muted" style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <TrendingUp size={11} className="text-success" /> {reportType === 'sales' ? 'Sales' : 'Revenue'}
          </span>
          <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: '2px' }}>
            {formatCurrency(reportType === 'sales' ? (summary.sales || 0) : (summary.revenue || 0)).replace(/\.00$/, '')}
          </strong>
        </div>

        {/* Total expenses summary */}
        <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', borderLeft: '3px solid var(--danger)', margin: 0 }}>
          <span className="text-muted" style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <TrendingDown size={11} className="text-danger" /> Expenses
          </span>
          <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: '2px' }}>
            {formatCurrency(summary.expenses || 0).replace(/\.00$/, '')}
          </strong>
        </div>

        {/* Total net surplus summary */}
        <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', borderLeft: `3px solid ${summary.profit >= 0 ? 'var(--success)' : 'var(--danger)'}`, margin: 0 }}>
          <span className="text-muted" style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <DollarSign size={11} style={{ color: summary.profit >= 0 ? 'var(--success)' : 'var(--danger)' }} /> {reportType === 'sales' ? 'Net Margin' : 'Net Balance'}
          </span>
          <strong style={{ fontSize: '1.05rem', color: summary.profit >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '2px' }}>
            {formatCurrency(summary.profit || 0).replace(/\.00$/, '')}
          </strong>
        </div>
      </div>

      {/* Dynamic Preview Area */}
      <div className="card" style={{ padding: 0, margin: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
            Report Preview ({reportData.length} records)
          </span>
          <button onClick={generateReport} className="btn-icon" style={{ minWidth: 0, minHeight: 0, padding: '4px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px' }} title="Reload Report">
            <RefreshCw size={12} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '24px' }}>
            <div className="loading-pulse">
              <div className="loading-pulse__bar" style={{ width: '45%' }} />
              <div className="loading-pulse__bar" />
            </div>
          </div>
        ) : reportData.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="desktop-only-table">
              <div className="table-responsive" style={{ margin: 0, borderRadius: '0' }}>
                <table className="table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      {previewHeaders.map(h => <th key={h} style={{ fontSize: '0.74rem', padding: '10px 12px' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row, idx) => (
                      <tr key={idx}>
                        {['col1', 'col2', 'col3', 'col4', 'col5', 'col6'].map(colKey => 
                          renderTableCell(row[colKey], colKey)
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card Feed List View */}
            <div className="mobile-only-cards">
              {reportData.map((row, idx) => renderMobileCard(row, idx))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-light)', fontSize: '0.8rem' }}>
            No records matched the filter criteria in this period.
          </div>
        )}
      </div>
    </div>
  );
}
