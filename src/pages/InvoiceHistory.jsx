import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { Download, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const MONTHS = [
  { value: '', label: 'All Months' },
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
];

const YEARS = ['2025', '2026', '2027', '2028'];

export default function InvoiceHistory() {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    customerId: '',
    month: '',
    year: new Date().getFullYear().toString()
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const [invSnapshot, custSnapshot] = await Promise.all([
          getDocs(collection(db, 'invoices')),
          getDocs(collection(db, 'customers'))
        ]);

        const invData = [];
        invSnapshot.forEach(doc => invData.push({ id: doc.id, ...doc.data() }));
        invData.sort((a, b) => b.date - a.date);
        setInvoices(invData);
        setFilteredInvoices(invData);

        const custData = [];
        custSnapshot.forEach(doc => custData.push({ id: doc.id, ...doc.data() }));
        setCustomers(custData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    let result = [...invoices];

    if (filters.customerId) {
      result = result.filter(inv => inv.customerId === filters.customerId);
    }
    if (filters.year) {
      result = result.filter(inv => {
        const date = new Date(inv.date);
        return date.getFullYear().toString() === filters.year;
      });
    }
    if (filters.month !== '') {
      result = result.filter(inv => {
        const date = new Date(inv.date);
        return date.getMonth().toString() === filters.month;
      });
    }

    setFilteredInvoices(result);
  }, [filters, invoices]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleDownloadPDF = async (invoice) => {
    try {
      const custRef = doc(db, 'customers', invoice.customerId);
      const custSnap = await getDoc(custRef);
      const customer = custSnap.exists() ? { id: custSnap.id, ...custSnap.data() } : null;
      generateInvoicePDF(invoice, customer, '/logo.png');
    } catch (err) {
      console.error("Error generating PDF", err);
      alert("Error generating PDF");
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (window.confirm("Delete this invoice?")) {
      try {
        await deleteDoc(doc(db, 'invoices', invoiceId));
        setInvoices(invoices.filter(inv => inv.id !== invoiceId));
        // filteredInvoices will update via useEffect as invoices change
      } catch (error) {
        console.error("Error deleting invoice:", error);
        alert("Failed to delete invoice.");
      }
    }
  };

  return (
    <div>
      {/* Sticky Filters */}
      <div className="filters-section">
        <div className="filter-item">
          <label>Customer</label>
          <select
            name="customerId"
            value={filters.customerId}
            onChange={handleFilterChange}
            className="form-control"
          >
            <option value="">All Customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Month</label>
          <select
            name="month"
            value={filters.month}
            onChange={handleFilterChange}
            className="form-control"
          >
            {MONTHS.map(m => (
              <option key={m.label} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Year</label>
          <select
            name="year"
            value={filters.year}
            onChange={handleFilterChange}
            className="form-control"
          >
            <option value="">All Years</option>
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="card">
        <h2 className="card-title">Invoice History</h2>

        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : filteredInvoices.length > 0 ? (
          <div className="table-responsive">
            <table className="table card-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td data-label="Invoice #" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{inv.invoiceNumber}</td>
                    <td data-label="Customer">{inv.customerName}</td>
                    <td data-label="Date" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {inv.date ? format(new Date(inv.date), 'dd MMM yy') : ''}
                    </td>
                    <td data-label="Amount" style={{ whiteSpace: 'nowrap', fontWeight: '500' }}>
                      ₹{Number(inv.totalAmount).toFixed(2)}
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleDownloadPDF(inv)}
                          className="btn-icon"
                          title="Download PDF"
                        >
                          <Download size={18} />
                        </button>
                        <Link to={`/edit-invoice/${inv.id}`} className="btn-icon" title="Edit Invoice">
                          <Edit size={18} />
                        </Link>
                        <button onClick={() => handleDeleteInvoice(inv.id)} className="btn-icon" title="Delete Invoice" style={{ color: '#dc3545', border: 'none', background: 'transparent', cursor: 'pointer' }}>
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
          <p className="text-muted">No invoices match the selected filters.</p>
        )}
      </div>
    </div>
  );
}
