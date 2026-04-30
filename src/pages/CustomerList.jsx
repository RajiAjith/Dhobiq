import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { Edit, Trash2 } from 'lucide-react';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import OfflineScreen from '../components/OfflineScreen';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const fetchCustomers = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setIsOfflineError(false);

    try {
      const querySnapshot = await getDocs(collection(db, 'customers'));
      const custData = [];
      querySnapshot.forEach((doc) => {
        custData.push({ id: doc.id, ...doc.data() });
      });
      setCustomers(custData);
      clearWasOffline();
    } catch (error) {
      console.error('Error fetching customers:', error);
      reportError(error);
      if (isNetworkError(error)) {
        setIsOfflineError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [reportError, clearWasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCustomers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reload on reconnect
  useEffect(() => {
    if (isOnline && wasOffline) {
      fetchCustomers();
    }
  }, [isOnline, wasOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (customerId) => {
    if (window.confirm('Are you sure you want to delete this customer? This will also delete all related invoices.')) {
      setLoading(true);
      try {
        await deleteDoc(doc(db, 'customers', customerId));

        const q = query(collection(db, 'invoices'), where('customerId', '==', customerId));
        const invoiceSnap = await getDocs(q);

        const batch = writeBatch(db);
        invoiceSnap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();

        setCustomers(customers.filter(c => c.id !== customerId));
      } catch (error) {
        console.error('Error deleting customer:', error);
        reportError(error);
        alert('Failed to delete customer');
      } finally {
        setLoading(false);
      }
    }
  };

  if (!loading && isOfflineError) {
    return <OfflineScreen onRetry={fetchCustomers} />;
  }

  return (
    <div className="card">
      <div className="flex-between mb-2">
        <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Customers</h2>
        <Link to="/customers/new" className="btn btn-primary">+ Add</Link>
      </div>

      {loading ? (
        <div className="loading-pulse">
          <div className="loading-pulse__bar" />
          <div className="loading-pulse__bar" style={{ width: '80%' }} />
          <div className="loading-pulse__bar" style={{ width: '60%' }} />
        </div>
      ) : customers.length > 0 ? (
        <div className="table-responsive">
          <table className="table card-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th style={{ display: 'none' }} className="hide-mobile">Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(customer => (
                <tr key={customer.id}>
                  <td data-label="ID" style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--primary)' }}>
                    {customer.id}
                  </td>
                  <td data-label="Name">{customer.name}</td>
                  <td data-label="Phone" style={{ whiteSpace: 'nowrap' }}>{customer.phone}</td>
                  <td data-label="Address" style={{ display: 'none' }} className="hide-mobile">{customer.address}</td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <Link to={`/customers/${customer.id}`} className="btn-icon edit" title="Edit Customer">
                        <Edit size={18} />
                      </Link>
                      <button onClick={() => handleDelete(customer.id)} className="btn-icon" title="Delete Customer" style={{ color: '#dc3545', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted">No customers found. Add a new customer to get started.</p>
      )}
    </div>
  );
}
