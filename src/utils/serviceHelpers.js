/**
 * serviceHelpers.js
 * Shared utility for fetching services with proper sort_order.
 * All pages (BillCreate, InvoiceCreate, ServiceList) should use this.
 */
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_SERVICES } from './constants';

/**
 * Fetch services from Firestore and return sorted by sort_order ASC (nulls last), then name.
 */
export async function fetchServicesSorted() {
  const snapshot = await getDocs(collection(db, 'services'));
  const data = [];
  snapshot.forEach(d => data.push({ id: d.id, ...d.data() }));
  if (data.length === 0) return [...FALLBACK_SERVICES];
  return sortServices(data);
}

/**
 * Sort an array of service objects.
 * sort_order null/undefined → treated as Infinity (placed at end).
 * Ties in sort_order → alphabetical by name.
 */
export function sortServices(services) {
  return [...services].sort((a, b) => {
    const ao = a.sort_order != null ? a.sort_order : Infinity;
    const bo = b.sort_order != null ? b.sort_order : Infinity;
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '');
  });
}
