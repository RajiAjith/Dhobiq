import { doc, updateDoc } from 'firebase/firestore';

const PAYMENT_MODE_OPTIONS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other', 'Unknown'];

function getTimestampValue(value, fallback = Date.now()) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? getTimestampValue(fallback) : value.getTime();
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  if (typeof fallback === 'number' && !Number.isNaN(fallback)) {
    return fallback;
  }

  const fallbackDate = new Date(fallback);
  return Number.isNaN(fallbackDate.getTime()) ? Date.now() : fallbackDate.getTime();
}

export function normalizePaymentEntries(payments = []) {
  if (!Array.isArray(payments)) return [];

  return payments
    .filter(Boolean)
    .map((payment) => {
      const amount = Number(payment?.amount || 0);
      const paymentDate = payment?.paymentDate ?? payment?.createdAt ?? Date.now();
      const createdAtValue = payment?.createdAt ?? paymentDate;
      return {
        amount,
        paymentDate: getTimestampValue(paymentDate, Date.now()),
        paymentMode: payment?.paymentMode || 'Unknown',
        referenceNumber: payment?.referenceNumber || '',
        notes: payment?.notes || '',
        createdAt: getTimestampValue(createdAtValue, paymentDate),
        migrated: Boolean(payment?.migrated)
      };
    })
    .filter((payment) => payment.amount > 0);
}

export function buildPaymentSummary(payments = [], totalAmount = 0) {
  const normalizedPayments = normalizePaymentEntries(payments);
  const amountPaid = normalizedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balanceAmount = Math.max(0, Number(totalAmount || 0) - amountPaid);

  let paymentStatus = 'unpaid';
  if (amountPaid > 0) {
    paymentStatus = amountPaid >= Number(totalAmount || 0) ? 'paid' : 'partial';
  }

  return {
    amountPaid,
    balanceAmount,
    paymentStatus,
    payments: normalizedPayments
  };
}

export function getInvoicePaymentEntries(invoice = {}) {
  if (Array.isArray(invoice?.payments) && invoice.payments.length > 0) {
    return normalizePaymentEntries(invoice.payments);
  }

  const amountPaid = Number(invoice?.amountPaid || 0);
  if (amountPaid > 0) {
    const paymentDate = getTimestampValue(invoice?.invoiceDate || invoice?.paymentDate || Date.now(), Date.now());
    return [{
      amount: amountPaid,
      paymentDate,
      paymentMode: 'Unknown',
      referenceNumber: '',
      notes: '',
      createdAt: paymentDate,
      migrated: true
    }];
  }

  return [];
}

export function getInvoicePaymentSummary(invoice = {}) {
  const totalAmount = Number(invoice?.totalAmount || 0);
  const payments = getInvoicePaymentEntries(invoice);
  return buildPaymentSummary(payments, totalAmount);
}

export function getPaymentModeOptions() {
  return PAYMENT_MODE_OPTIONS;
}

export function getPaymentDateValue(paymentDate, fallback = Date.now()) {
  const parsed = new Date(paymentDate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.setHours(12, 0, 0, 0);
  }
  return new Date(fallback).setHours(12, 0, 0, 0);
}

export function createPaymentEntry(payment = {}) {
  const amount = Number(payment?.amount || 0);
  const paymentDateValue = payment?.paymentDate ?? payment?.createdAt ?? Date.now();
  const createdAtValue = payment?.createdAt ?? paymentDateValue;

  return {
    amount,
    paymentDate: getPaymentDateValue(paymentDateValue, createdAtValue),
    paymentMode: payment?.paymentMode || 'Unknown',
    referenceNumber: payment?.referenceNumber || '',
    notes: payment?.notes || '',
    createdAt: Number(createdAtValue) || Date.now(),
    migrated: Boolean(payment?.migrated)
  };
}

export function buildUpdatedPayments(existingPayments = [], paymentInput = {}, options = {}) {
  const normalizedPayment = createPaymentEntry(paymentInput);
  const mode = options.mode || 'add';
  const editingPaymentIndex = options.editingPaymentIndex;

  if (mode === 'edit' && Number.isInteger(editingPaymentIndex) && editingPaymentIndex >= 0) {
    return (Array.isArray(existingPayments) ? existingPayments : []).map((payment, index) => {
      if (index !== editingPaymentIndex) return payment;
      return {
        ...payment,
        ...normalizedPayment,
        createdAt: payment.createdAt || normalizedPayment.createdAt
      };
    });
  }

  return [
    ...(Array.isArray(existingPayments) ? existingPayments : []),
    normalizedPayment
  ].filter((payment) => Number(payment?.amount || 0) > 0);
}

export function getPaymentValidationError(paymentForm = {}, invoice = {}, options = {}) {
  const amount = Number(paymentForm.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return 'Please enter a valid payment amount.';
  }

  const totalAmount = Number(invoice?.totalAmount || 0);
  const updatedPayments = buildUpdatedPayments(
    Array.isArray(invoice?.payments) ? invoice.payments : [],
    { ...paymentForm, amount },
    options
  );
  const summary = buildPaymentSummary(updatedPayments, totalAmount);

  if (summary.amountPaid > totalAmount) {
    return 'The payments exceed the invoice total.';
  }

  return '';
}

export async function persistInvoicePayment({ dbInstance = null, invoice = {}, paymentForm = {}, mode = 'add', editingPaymentIndex = null, invoiceId = invoice?.id } = {}) {
  if (!dbInstance) {
    throw new Error('A Firestore instance is required to persist payment data.');
  }

  const validationError = getPaymentValidationError(paymentForm, invoice, { mode, editingPaymentIndex });
  if (validationError) {
    throw new Error(validationError);
  }

  const totalAmount = Number(invoice?.totalAmount || 0);
  const updatedPayments = buildUpdatedPayments(
    Array.isArray(invoice?.payments) ? invoice.payments : [],
    { ...paymentForm, amount: Number(paymentForm.amount) },
    { mode, editingPaymentIndex }
  );
  const summary = buildPaymentSummary(updatedPayments, totalAmount);

  await updateDoc(doc(dbInstance, 'invoices', invoiceId), {
    payments: updatedPayments,
    amountPaid: summary.amountPaid,
    balanceAmount: summary.balanceAmount,
    paymentStatus: summary.paymentStatus
  });

  return {
    payments: updatedPayments,
    amountPaid: summary.amountPaid,
    balanceAmount: summary.balanceAmount,
    paymentStatus: summary.paymentStatus
  };
}

export async function deleteInvoicePayment({ dbInstance = null, invoice = {}, paymentIndex, invoiceId = invoice?.id } = {}) {
  if (!dbInstance) {
    throw new Error('A Firestore instance is required to persist payment data.');
  }

  const currentPayments = Array.isArray(invoice?.payments) ? invoice.payments : [];
  const updatedPayments = currentPayments.filter((_, index) => index !== paymentIndex);
  const summary = buildPaymentSummary(updatedPayments, Number(invoice?.totalAmount || 0));

  await updateDoc(doc(dbInstance, 'invoices', invoiceId), {
    payments: updatedPayments,
    amountPaid: summary.amountPaid,
    balanceAmount: summary.balanceAmount,
    paymentStatus: summary.paymentStatus
  });

  return {
    payments: updatedPayments,
    amountPaid: summary.amountPaid,
    balanceAmount: summary.balanceAmount,
    paymentStatus: summary.paymentStatus
  };
}
