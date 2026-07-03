import { isWithinInterval } from 'date-fns';
import { getInvoicePaymentEntries } from './paymentUtils.js';

export function getReportDateRange(fromDate, toDate) {
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function isDateInRange(dateValue, start, end) {
  const parsedDate = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
  if (Number.isNaN(parsedDate.getTime())) return false;
  return isWithinInterval(parsedDate, { start, end });
}

export function getInvoiceRevenueForPeriod(invoice = {}, start, end) {
  const payments = getInvoicePaymentEntries(invoice).filter((payment) => isDateInRange(payment.paymentDate, start, end));
  return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

export function getInvoiceRevenueTotal(invoices = [], start, end) {
  return invoices.reduce((sum, invoice) => sum + getInvoiceRevenueForPeriod(invoice, start, end), 0);
}

export function getExpensesTotal(expenses = [], start, end) {
  return expenses
    .filter((expense) => isDateInRange(expense?.date || Date.now(), start, end))
    .reduce((sum, expense) => sum + Number(expense?.amount || 0), 0);
}

export function buildReportSummary({ revenue = 0, expenses = 0, count = 0 } = {}) {
  return {
    revenue: Number(revenue) || 0,
    expenses: Number(expenses) || 0,
    profit: (Number(revenue) || 0) - (Number(expenses) || 0),
    count: Number(count) || 0
  };
}
