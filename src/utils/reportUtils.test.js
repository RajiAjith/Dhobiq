import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportSummary, getInvoiceRevenueForPeriod, getReportDateRange } from './reportUtils.js';

test('getInvoiceRevenueForPeriod uses payment dates within the selected range', () => {
  const invoice = {
    totalAmount: 1000,
    payments: [
      { amount: 100, paymentDate: '2026-06-10' },
      { amount: 50, paymentDate: '2026-05-31' }
    ]
  };

  const { start, end } = getReportDateRange('2026-06-01', '2026-06-30');
  assert.equal(getInvoiceRevenueForPeriod(invoice, start, end), 100);
});

test('buildReportSummary computes profit from revenue minus expenses', () => {
  const summary = buildReportSummary({ revenue: 250, expenses: 90, count: 2 });
  assert.deepEqual(summary, { revenue: 250, expenses: 90, profit: 160, count: 2 });
});
