import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { ArrowLeft, Save, Upload, Link2, X, Plus, AlertCircle, Calendar, Tag } from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';

export default function ExpenseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const [categories, setCategories] = useState([]);
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Rent',
    amount: '',
    description: '',
    vendor: '',
    paymentMethod: 'Cash',
    notes: '',
    receiptUrl: '',
    receiptName: ''
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [isSalaryExpense, setIsSalaryExpense] = useState(false);

  const loadData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setDataReady(false);
      return;
    }
    setDataReady(false);
    setIsOfflineError(false);

    try {
      const catSnap = await getDocs(collection(db, 'expense_categories'));
      const catList = [];
      catSnap.forEach(d => catList.push({ id: d.id, ...d.data() }));

      const defaultCats = [
        'Salary', 'Rent', 'Electricity', 'Water', 'Chemical Purchase', 
        'Packaging Materials', 'Food', 'Fuel', 'Repairs', 'Maintenance', 'Miscellaneous'
      ];
      
      const mergedCats = catList.length > 0 
        ? [...new Set([...catList.map(c => c.name), ...defaultCats])]
        : defaultCats;
      
      setCategories(mergedCats.sort());

      if (id) {
        const docSnap = await getDoc(doc(db, 'expenses', id));
        if (docSnap.exists()) {
          const expData = docSnap.data();
          setFormData(expData);
          if (expData.salaryPaymentId) {
            setIsSalaryExpense(true);
          }
        } else {
          navigate('/expenses');
          return;
        }
      }
      clearWasOffline();
    } catch (err) {
      console.error('Error loading expense data:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataReady(true);
    }
  }, [id, navigate, reportError, clearWasOffline]);

  useEffect(() => {
    loadData();
  }, [id, loadData]);

  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline, loadData]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleAddCustomCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    
    setSavingCat(true);
    const catNameNormalized = newCatName.trim();
    
    if (categories.some(c => c.toLowerCase() === catNameNormalized.toLowerCase())) {
      alert("This category already exists.");
      setSavingCat(false);
      return;
    }

    try {
      const customCatRef = doc(collection(db, 'expense_categories'));
      await setDoc(customCatRef, {
        id: customCatRef.id,
        name: catNameNormalized,
        isSystem: false,
        createdAt: new Date().toISOString()
      });

      const updatedCats = [...categories, catNameNormalized].sort();
      setCategories(updatedCats);
      setFormData({ ...formData, category: catNameNormalized });
      setNewCatName('');
      setNewCategoryModal(false);
    } catch (err) {
      console.error('Error saving custom category:', err);
      alert('Failed to save category.');
    } finally {
      setSavingCat(false);
    }
  };

  const handleRemoveReceipt = () => {
    setSelectedFile(null);
    setFormData({ ...formData, receiptUrl: '', receiptName: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSalaryExpense) {
      alert("This expense is linked to salary payroll and cannot be edited. Please manage payroll records instead.");
      return;
    }

    setLoading(true);

    const amount = Number(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid expense amount.");
      setLoading(false);
      return;
    }

    try {
      let receiptUrl = formData.receiptUrl;
      let receiptName = formData.receiptName;

      if (selectedFile) {
        setUploadProgress(true);
        const fileName = `${Date.now()}_${selectedFile.name}`;
        const fileRef = ref(storage, `expenses/receipts/${fileName}`);
        
        const uploadSnapshot = await uploadBytes(fileRef, selectedFile);
        receiptUrl = await getDownloadURL(uploadSnapshot.ref);
        receiptName = selectedFile.name;
        setUploadProgress(false);
      }

      const expenseDataObj = {
        ...formData,
        amount,
        receiptUrl,
        receiptName,
        updatedAt: new Date().toISOString()
      };

      if (id) {
        await setDoc(doc(db, 'expenses', id), expenseDataObj);
      } else {
        const expenseRef = doc(collection(db, 'expenses'));
        await setDoc(expenseRef, {
          ...expenseDataObj,
          id: expenseRef.id,
          createdAt: new Date().toISOString()
        });
      }

      navigate('/expenses');
    } catch (err) {
      console.error('Error saving expense:', err);
      reportError(err);
      if (isNetworkError(err)) {
        alert('No internet connection. Please verify your connection and try again.');
      } else {
        alert('Failed to save expense.');
      }
    } finally {
      setLoading(false);
      setUploadProgress(false);
    }
  };

  if (!dataReady && isOfflineError) {
    return <OfflineScreen onRetry={loadData} />;
  }

  if (!dataReady) {
    return (
      <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="loading-pulse">
          <div className="loading-pulse__bar" style={{ width: '40%' }} />
          <div className="loading-pulse__bar" />
          <div className="loading-pulse__bar" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {/* Header back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button 
          type="button" 
          onClick={() => navigate('/expenses')} 
          style={{ background: 'rgba(0,0,0,0.03)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, border: 'none' }}>
          {id ? 'Edit Expense Record' : 'Record Business Expense'}
        </h2>
      </div>

      <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
        {isSalaryExpense && (
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
            <AlertCircle size={16} />
            <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>
              Salary Ledger Locked: This expense was automatically generated via salary payments.
              Please go to Staff & Salaries to update salary payouts.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Date & Category Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="exp-date">Expense Date</label>
              <input
                id="exp-date"
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                disabled={isSalaryExpense}
                className="form-control"
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="exp-category" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Category</span>
                {!isSalaryExpense && (
                  <button 
                    type="button" 
                    onClick={() => setNewCategoryModal(true)} 
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '2px', padding: 0 }}
                  >
                    <Plus size={12} /> Custom
                  </button>
                )}
              </label>
              <select
                id="exp-category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                disabled={isSalaryExpense}
                className="form-control"
                style={{ fontSize: '0.8rem', height: '36px' }}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount & Vendor Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="exp-amount">Amount (₹)</label>
              <input
                id="exp-amount"
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
                disabled={isSalaryExpense}
                className="form-control"
                placeholder="0.00"
                min="0.01"
                step="any"
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="exp-vendor">Vendor / Payee</label>
              <input
                id="exp-vendor"
                type="text"
                name="vendor"
                value={formData.vendor}
                onChange={handleChange}
                disabled={isSalaryExpense}
                className="form-control"
                placeholder="e.g. Chemical Shop"
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>
          </div>

          {/* Description */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="filter-label" htmlFor="exp-desc">Description / Purpose</label>
            <input
              id="exp-desc"
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              disabled={isSalaryExpense}
              className="form-control"
              placeholder="e.g. Purchased 10L Bleach and liquid detergent"
              style={{ fontSize: '0.8rem', height: '36px' }}
            />
          </div>

          {/* Payment Method */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="filter-label" htmlFor="exp-payment">Payment Method</label>
            <select
              id="exp-payment"
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleChange}
              disabled={isSalaryExpense}
              className="form-control"
              style={{ fontSize: '0.8rem', height: '36px' }}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI (GPay/PhonePe)</option>
              <option value="Card">Debit/Credit Card</option>
              <option value="Net Banking">Net Banking</option>
              <option value="Check">Check</option>
            </select>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="filter-label" htmlFor="exp-notes">Notes</label>
            <textarea
              id="exp-notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              disabled={isSalaryExpense}
              className="form-control"
              placeholder="Any additional details..."
              rows={2}
              style={{ fontSize: '0.8rem', padding: '8px 10px', minHeight: '50px' }}
            />
          </div>

          {/* Receipt Upload Block */}
          {!isSalaryExpense && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label">Receipt / invoice file attachment</label>
              
              {formData.receiptUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border-light)', borderRadius: '12px', backgroundColor: 'var(--surface-overlay)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0 }}>
                    <Link2 size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formData.receiptName || 'Attached Receipt'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <a 
                      href={formData.receiptUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.74rem', minHeight: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center' }}
                    >
                      View
                    </a>
                    <button 
                      type="button" 
                      onClick={handleRemoveReceipt} 
                      className="btn-icon" 
                      style={{ 
                        width: '28px', height: '28px', minWidth: '28px',
                        background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '8px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                      }} 
                      title="Remove Attachment"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label 
                    htmlFor="exp-file-upload" 
                    className="btn btn-secondary" 
                    style={{ 
                      width: '100%', 
                      gap: '8px', 
                      cursor: 'pointer', 
                      border: '1.5px dashed rgba(2, 132, 199, 0.25)', 
                      backgroundColor: 'rgba(2, 132, 199, 0.02)',
                      padding: '12px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      color: 'var(--primary)',
                      fontWeight: 700
                    }}
                  >
                    <Upload size={16} />
                    {selectedFile ? selectedFile.name : 'Choose PDF, Invoice or Image'}
                  </label>
                  <input
                    id="exp-file-upload"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {selectedFile && (
                    <button 
                      type="button" 
                      onClick={() => setSelectedFile(null)} 
                      className="btn btn-danger" 
                      style={{ alignSelf: 'center', padding: '6px 12px', fontSize: '0.74rem', border: 'none', borderRadius: '8px', minHeight: '28px' }}
                    >
                      Cancel Upload Selection
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit Action */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => navigate('/expenses')}
              className="btn btn-secondary"
              style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px' }}
              disabled={loading || uploadProgress}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploadProgress || isSalaryExpense}
              className="btn btn-primary"
              style={{ flex: 1, padding: '10px', fontSize: '0.8rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Save size={14} />
              {loading ? (uploadProgress ? 'Uploading...' : 'Saving...') : 'Save Expense'}
            </button>
          </div>

        </form>
      </div>

      {/* Inline Custom Category Dialog Modal */}
      {newCategoryModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(13, 27, 42, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' 
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '380px', margin: 0, borderRadius: '20px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-light)', animation: 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Tag size={16} style={{ color: 'var(--primary)' }} /> Add Custom Category
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer' }} onClick={() => setNewCategoryModal(false)}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddCustomCategory}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="filter-label" htmlFor="new-cat-name">Category Name</label>
                <input
                  id="new-cat-name"
                  type="text"
                  placeholder="e.g. Internet, Chemical shop"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  required
                  autoFocus
                  className="form-control"
                  style={{ fontSize: '0.8rem', height: '36px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.78rem', borderRadius: '10px' }} onClick={() => setNewCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '8px', fontSize: '0.78rem', borderRadius: '10px' }} disabled={savingCat || !newCatName.trim()}>
                  {savingCat ? 'Saving...' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
