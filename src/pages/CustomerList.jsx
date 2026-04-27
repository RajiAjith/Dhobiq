import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { Edit } from 'lucide-react';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomers() {
      try {
        const querySnapshot = await getDocs(collection(db, 'customers'));
        const custData = [];
        querySnapshot.forEach((doc) => {
          custData.push({ id: doc.id, ...doc.data() });
        });
        setCustomers(custData);
      } catch (error) {
        console.error("Error fetching customers:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  return (
    <div className="card">
      <div className="flex-between mb-2">
        <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Customers</h2>
        <Link to="/customers/new" className="btn btn-primary">+ Add</Link>
      </div>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : customers.length > 0 ? (
        <div className="table-responsive">
          <table className="table card-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th style={{ display: 'none' }} className="hide-mobile">Address</th>
                <th>Edit</th>
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
                  <td data-label="Edit">
                    <Link to={`/customers/${customer.id}`} className="btn-icon" title="Edit Customer">
                      <Edit size={18} />
                    </Link>
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
