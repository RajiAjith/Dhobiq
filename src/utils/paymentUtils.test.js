import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaymentSummary, buildUpdatedPayments, getInvoicePaymentEntries } from './paymentUtils.js';

test('buildPaymentSummary recalculates paid amount, balance and status from payments', () => {
  const summary = buildPaymentSummary([
    { amount: 100, paymentDate: 1710000000000, paymentMode: 'Cash' },
    { amount: 50, paymentDate: 1710003600000, paymentMode: 'UPI' }
  ], 200);

  assert.equal(summary.amountPaid, 150);
  assert.equal(summary.balanceAmount, 50);
  assert.equal(summary.paymentStatus, 'partial');
});

test('getInvoicePaymentEntries migrates legacy invoice payments from amountPaid', () => {
  const entries = getInvoicePaymentEntries({
    amountPaid: 75,
    totalAmount: 100,
    invoiceDate: 1710000000000,
    payments: undefined
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 75);
  assert.equal(entries[0].paymentDate, 1710000000000);
  assert.equal(entries[0].paymentMode, 'Unknown');
  assert.equal(entries[0].migrated, true);
});

test('buildUpdatedPayments edits an existing payment entry without duplicating it', () => {
  const updatedPayments = buildUpdatedPayments(
    [{ amount: 40, paymentDate: 1710000000000, paymentMode: 'Cash' }],
    { amount: 50, paymentDate: 1715000000000, paymentMode: 'UPI' },
    { mode: 'edit', editingPaymentIndex: 0 }
  );

  assert.equal(updatedPayments.length, 1);
  assert.equal(updatedPayments[0].amount, 50);
  assert.equal(updatedPayments[0].paymentMode, 'UPI');
});
