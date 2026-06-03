/**
 * migration.js
 * One-time safe migration: copies existing Firestore `invoices` documents into
 * the new `bills` collection without deleting any original data.
 *
 * Called once on app startup (gated by a migration flag in Firestore).
 * If migration has already run, it exits immediately.
 */
import {
  collection, getDocs, doc, setDoc, getDoc, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';

const MIGRATION_FLAG_DOC = 'migrations/v2_bills_migration';

/**
 * Run migration if not already done.
 * Returns { ran: bool, migrated: number }
 */
export async function runBillsMigrationIfNeeded() {
  try {
    // Check if already migrated
    const flagSnap = await getDoc(doc(db, 'migrations', 'v2_bills_migration'));
    if (flagSnap.exists() && flagSnap.data().done) {
      return { ran: false, migrated: 0 };
    }

    // Fetch all existing invoices
    const invoiceSnap = await getDocs(collection(db, 'invoices'));
    if (invoiceSnap.empty) {
      // Nothing to migrate — mark done
      await setDoc(doc(db, 'migrations', 'v2_bills_migration'), {
        done: true,
        migratedAt: Date.now(),
        count: 0
      });
      return { ran: true, migrated: 0 };
    }

    // Firestore batch writes (max 500 per batch)
    const docs = [];
    invoiceSnap.forEach(d => docs.push({ id: d.id, ...d.data() }));

    let migrated = 0;
    const BATCH_SIZE = 400;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);

      for (const inv of chunk) {
        // Check if this bill already exists (idempotent)
        const billRef = doc(db, 'bills', inv.id);
        const existingSnap = await getDoc(billRef);
        if (existingSnap.exists()) continue;

        // Map invoice → bill structure
        const billData = {
          billNumber:   inv.invoiceNumber || inv.id,
          customerId:   inv.customerId   || '',
          customerName: inv.customerName || '',
          date:         inv.date         || Date.now(),
          items:        inv.items        || [],
          totalAmount:  inv.totalAmount  || 0,
          notes:        inv.notes        || '',
          invoiceId:    null,      // not yet linked to a consolidated invoice
          status:       'pending', // pending = not invoiced yet
          // Preserve payment info for reference
          _legacyAmountPaid:   inv.amountPaid   || 0,
          _legacyBalance:      inv.balanceAmount || inv.totalAmount || 0,
          _legacyStatus:       inv.status        || 'unpaid',
          _migratedFromInvoice: true,
        };

        batch.set(billRef, billData);
        migrated++;
      }

      await batch.commit();
    }

    // Mark migration complete
    await setDoc(doc(db, 'migrations', 'v2_bills_migration'), {
      done: true,
      migratedAt: Date.now(),
      count: migrated
    });

    console.log(`[Migration] Successfully migrated ${migrated} invoices → bills`);
    return { ran: true, migrated };

  } catch (err) {
    console.error('[Migration] Error during bills migration:', err);
    // Don't throw — migration failure should not crash the app
    return { ran: false, migrated: 0, error: err.message };
  }
}

/**
 * Run invoice payment migration if not already done.
 * This converts old `invoices` (which were just daily bills with payment data)
 * into the NEW consolidated invoice schema, so they don't break the InvoiceList page.
 */
export async function runInvoicePaymentMigrationIfNeeded() {
  try {
    const flagSnap = await getDoc(doc(db, 'migrations', 'v3_invoice_payment_migration'));
    if (flagSnap.exists() && flagSnap.data().done) {
      return { ran: false, migrated: 0 };
    }

    const invoiceSnap = await getDocs(collection(db, 'invoices'));
    if (invoiceSnap.empty) {
      await setDoc(doc(db, 'migrations', 'v3_invoice_payment_migration'), {
        done: true,
        migratedAt: Date.now(),
        count: 0
      });
      return { ran: true, migrated: 0 };
    }

    let migrated = 0;
    const docs = [];
    invoiceSnap.forEach(d => docs.push({ id: d.id, ...d.data() }));

    const BATCH_SIZE = 400;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);

      for (const inv of chunk) {
        // If it already has paymentStatus, it's a new invoice
        if (inv.paymentStatus || inv.billIds) {
          continue; 
        }

        // Convert legacy invoice document to new invoice schema
        // It carries its own legacy payment state.
        const invRef = doc(db, 'invoices', inv.id);
        batch.update(invRef, {
          paymentStatus: inv.status || 'unpaid',
          amountPaid: inv.amountPaid || 0,
          balanceAmount: inv.balanceAmount ?? inv.totalAmount ?? 0,
          billIds: [inv.id], // Maps to the 1:1 migrated bill id
          invoiceDate: inv.invoiceDate || inv.date || Date.now()
        });
        migrated++;
      }
      await batch.commit();
    }

    await setDoc(doc(db, 'migrations', 'v3_invoice_payment_migration'), {
      done: true,
      migratedAt: Date.now(),
      count: migrated
    });

    console.log(`[Migration] Successfully updated ${migrated} legacy invoices with payment status.`);
    return { ran: true, migrated };
  } catch (err) {
    console.error('[Migration] Error during invoice payment migration:', err);
    return { ran: false, migrated: 0, error: err.message };
  }
}
