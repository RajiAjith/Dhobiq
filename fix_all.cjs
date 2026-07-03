const fs = require('fs');

// --- Fix 1: BillList.jsx - default month to current month ---
{
  let c = fs.readFileSync('src/pages/BillList.jsx', 'utf8');
  // match the exact string from the file
  c = c.replace("month: '',", "month: new Date().getMonth().toString(),");
  fs.writeFileSync('src/pages/BillList.jsx', c);
  console.log('Fixed BillList.jsx month default');
}

// --- Fix 2: Reports.jsx - fetch invoices for expense/category reports too ---
{
  let c = fs.readFileSync('src/pages/Reports.jsx', 'utf8');

  // Fix the fetch condition so invoices are always fetched (except salary)
  c = c.replace(
    "if (reportType === 'revenue' || reportType === 'customer' || reportType === 'service' || reportType === 'pnl') {",
    "if (reportType === 'revenue' || reportType === 'customer' || reportType === 'service' || reportType === 'pnl' || reportType === 'expense' || reportType === 'category') {"
  );

  // Also add getInvoicePaymentEntries import if not already there (it's used in pnl section)
  if (!c.includes('getInvoicePaymentEntries')) {
    c = c.replace(
      "import { buildReportSummary, getExpensesTotal, getInvoiceRevenueForPeriod, getInvoiceRevenueTotal, getReportDateRange } from '../utils/reportUtils';",
      "import { buildReportSummary, getExpensesTotal, getInvoiceRevenueForPeriod, getInvoiceRevenueTotal, getReportDateRange } from '../utils/reportUtils';\nimport { getInvoicePaymentEntries } from '../utils/paymentUtils';"
    );
  }

  fs.writeFileSync('src/pages/Reports.jsx', c);
  console.log('Fixed Reports.jsx fetch condition');
}

// --- Fix 3: InvoiceDetail.jsx - disable "Record Payment" button when paid ---
{
  let c = fs.readFileSync('src/pages/InvoiceDetail.jsx', 'utf8');

  // Disable the "Record Payment" button in payment history section when invoice is paid
  const oldBtn = `        <div className="flex-between mb-2">
          <h3 className="card-title" style={{ margin: 0 }}>Payment History</h3>
          <button onClick={openAddPaymentModal} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CreditCard size={16} /> Record Payment
          </button>
        </div>`;

  const newBtn = `        <div className="flex-between mb-2">
          <h3 className="card-title" style={{ margin: 0 }}>Payment History</h3>
          {invoice.paymentStatus !== 'paid' && (
            <button onClick={openAddPaymentModal} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CreditCard size={16} /> Record Payment
            </button>
          )}
        </div>`;

  if (c.includes(oldBtn)) {
    c = c.replace(oldBtn, newBtn);
    console.log('Fixed InvoiceDetail.jsx Record Payment button');
  } else {
    console.log('WARNING: Could not find Record Payment button in InvoiceDetail.jsx - check manually');
  }

  fs.writeFileSync('src/pages/InvoiceDetail.jsx', c);
}

console.log('\nAll fixes applied successfully!');
