import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { format } from 'date-fns';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { ArrowLeft, Save, Upload, Link2, X, Plus } from 'lucide-react';
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
      // 1. Fetch categories
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

      // 2. Fetch expense if editing
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

  // Auto-reload on reconnect
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
    
    // Check if category already exists in local list
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

      // Update state
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

      // Handle file upload if a new file is chosen
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
      <div className="card">
        <div className="loading-pulse">
          <div className="loading-pulse__bar" style={{ width: '40%' }} />
          <div className="loading-pulse__bar" />
          <div className="loading-pulse__bar" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Back button */}
      <div className="mb-2">
        <button className="btn btn-secondary" onClick={() => navigate('/expenses')}>
          <ArrowLeft size={16} /> Back to Expenses
        </button>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ paddingBottom: '12px' }}>
          {id ? 'Edit Expense Record' : 'Record Business Expense'}
        </h2>

        {isSalaryExpense && (
          <div className="alert-danger mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--danger)', padding: '12px', borderRadius: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div style={{ fontSize: '0.85rem' }}>
              <strong>Salary Ledger Locked:</strong> This expense was automatically generated via salary payments.
              Please go to **Staff & Salaries** to update salary payouts.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="exp-date">Date <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="exp-date"
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                disabled={isSalaryExpense}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="exp-category" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Category <span style={{ color: 'var(--danger)' }}>*</span></span>
                {!isSalaryExpense && (
                  <button 
                    type="button" 
                    onClick={() => setNewCategoryModal(true)} 
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '2px', padding: 0 }}
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
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="exp-amount">Amount (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
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
            />
          </div>

          <div className="form-group">
            <label htmlFor="exp-desc">Description / Purpose <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              id="exp-desc"
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              disabled={isSalaryExpense}
              className="form-control"
              placeholder="e.g. Purchased 10L Chlorine bleach"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="exp-vendor">Vendor / Payee</label>
              <input
                id="exp-vendor"
                type="text"
                name="vendor"
                value={formData.vendor}
                onChange={handleChange}
                disabled={isSalaryExpense}
                className="form-control"
                placeholder="Shop or person name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="exp-payment">Payment Method</label>
              <select
                id="exp-payment"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                disabled={isSalaryExpense}
                className="form-control"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI (GPay/PhonePe)</option>
                <option value="Card">Debit/Credit Card</option>
                <option value="Net Banking">Net Banking</option>
                <option value="Check">Check</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="exp-notes">Notes</label>
            <textarea
              id="exp-notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              disabled={isSalaryExpense}
              className="form-control"
              placeholder="Any additional details..."
              rows={2}
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          {/* Receipt Upload Block */}
          {!isSalaryExpense && (
            <div className="form-group">
              <label>Receipt or Invoice Attachment (Optional)</label>
              
              {formData.receiptUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Link2 size={16} className="text-muted" />
                    <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formData.receiptName || 'Attached Receipt'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={formData.receiptUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}>
                      View
                    </a>
                    <button type="button" onClick={handleRemoveReceipt} className="btn-icon delete" style={{ minWidth: 0, minHeight: 0, padding: '4px' }} title="Remove Attachment">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label htmlFor="exp-file-upload" className="btn btn-secondary" style={{ width: '100%', gap: '8px', cursor: 'pointer', borderStyle: 'dashed', backgroundColor: 'transparent' }}>
                    <Upload size={18} />
                    {selectedFile ? selectedFile.name : 'Choose File (PDF, Image)'}
                  </label>
                  <input
                    id="exp-file-upload"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {selectedFile && (
                    <button type="button" onClick={() => setSelectedFile(null)} className="btn btn-danger" style={{ alignSelf: 'center', padding: '4px 8px', fontSize: '0.75rem', border: 'none' }}>
                      Cancel Upload
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit Action */}
          <div style={{ marginTop: '8px' }}>
            <button
              type="submit"
              disabled={loading || uploadProgress || isSalaryExpense}
              className="btn btn-primary btn-mobile-full"
              style={{ gap: '8px' }}
            >
              <Save size={18} />
              {loading ? (uploadProgress ? 'Uploading Receipt...' : 'Saving...') : 'Save Expense'}
            </button>
          </div>

        </form>
      </div>

      {/* Inline Custom Category Dialog Modal */}
      {newCategoryModal && (
        <div className="bottom-sheet-overlay active" onClick={() => setNewCategoryModal(false)}>
          <div className="bottom-sheet-content" onClick={e => e.stopPropagation()} style={{ borderRadius: '16px 16px 16px 16px', maxWidth: '400px', margin: 'auto', bottom: 'auto', top: '50%', transform: 'translateY(-50%)' }}>
            <div className="bottom-sheet-header">
              <h3 className="bottom-sheet-title">Add Custom Category</h3>
              <button className="bottom-sheet-close" onClick={() => setNewCategoryModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddCustomCategory}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="new-cat-name">Category Name</label>
                <input
                  id="new-cat-name"
                  type="text"
                  placeholder="e.g. Rent, Internet, Chemicals"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  required
                  autoFocus
                  className="form-control"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setNewCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingCat || !newCatName.trim()}>
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
