import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Save, Plus, Trash2, Settings as SettingsIcon, Sliders, Briefcase, Tag, Info } from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';

export default function Settings() {
  const [loading,        setLoading]        = useState(false);
  const [dataReady,      setDataReady]      = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);
  
  const [businessSettings, setBusinessSettings] = useState({
    name: 'Dhobiq Laundry',
    tagline: 'Your Clothes Our Care!',
    phone: '+91-9061504910, +91-7902958593',
    address: "Near MacDonald's | Thumpoly P.O, Alappuzha",
    footerText: 'Freshness Delivered to Your Doorstep'
  });

  const [customCategories, setCustomCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();

  const loadData = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOfflineError(true);
      setDataReady(false);
      return;
    }
    setDataReady(false);
    setIsOfflineError(false);

    try {
      // 1. Load general settings
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) {
        setBusinessSettings(settingsSnap.data());
      }

      // 2. Load custom expense categories
      const catSnap = await getDocs(collection(db, 'expense_categories'));
      const catList = [];
      catSnap.forEach(d => {
        const cat = d.data();
        if (!cat.isSystem) {
          catList.push({ id: d.id, ...cat });
        }
      });
      setCustomCategories(catList);

      clearWasOffline();
    } catch (err) {
      console.error('Error loading settings:', err);
      reportError(err);
      if (isNetworkError(err)) setIsOfflineError(true);
    } finally {
      setDataReady(true);
    }
  }, [reportError, clearWasOffline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-reload on reconnect
  useEffect(() => {
    if (isOnline && wasOffline) loadData();
  }, [isOnline, wasOffline, loadData]);

  const handleSettingChange = (e) => {
    setBusinessSettings({ ...businessSettings, [e.target.name]: e.target.value });
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), businessSettings);
      alert('Business configurations saved successfully!');
    } catch (err) {
      console.error('Error saving business settings:', err);
      reportError(err);
      alert('Failed to save business settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setSavingCategory(true);
    const catNameNormalized = newCategoryName.trim();

    // Check system category collision
    const systemCats = [
      'salary', 'rent', 'electricity', 'water', 'chemical purchase', 
      'packaging materials', 'food', 'fuel', 'repairs', 'maintenance', 'miscellaneous'
    ];
    if (systemCats.includes(catNameNormalized.toLowerCase())) {
      alert("This is a built-in default category and cannot be added again.");
      setSavingCategory(false);
      return;
    }

    // Check custom category duplicate
    if (customCategories.some(c => c.name.toLowerCase() === catNameNormalized.toLowerCase())) {
      alert("This custom category already exists.");
      setSavingCategory(false);
      return;
    }

    try {
      const newCatRef = doc(collection(db, 'expense_categories'));
      const newCatObj = {
        id: newCatRef.id,
        name: catNameNormalized,
        isSystem: false,
        createdAt: new Date().toISOString()
      };

      await setDoc(newCatRef, newCatObj);
      setCustomCategories([...customCategories, newCatObj].sort((a,b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
    } catch (err) {
      console.error('Error adding category:', err);
      alert('Failed to save category.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId, catName) => {
    if (!window.confirm(`Are you sure you want to delete custom category "${catName}"?`)) return;

    try {
      await deleteDoc(doc(db, 'expense_categories', catId));
      setCustomCategories(customCategories.filter(c => c.id !== catId));
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category.');
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

  const systemDefaultCategories = [
    'Salary', 'Rent', 'Electricity', 'Water', 'Chemical Purchase', 
    'Packaging Materials', 'Food', 'Fuel', 'Repairs', 'Maintenance', 'Miscellaneous'
  ].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="card-title" style={{ border: 'none', margin: 0 }}>Business Settings</h2>
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>Configure company invoices, bill receipts, and custom categories</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }} className="invoice-grid">
        
        {/* General Business Profile Settings */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} /> Company Branding & Details
          </h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            <div className="form-group">
              <label htmlFor="biz-name">Business Name</label>
              <input
                id="biz-name"
                type="text"
                name="name"
                value={businessSettings.name}
                onChange={handleSettingChange}
                required
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="biz-tagline">Marketing Tagline</label>
              <input
                id="biz-tagline"
                type="text"
                name="tagline"
                value={businessSettings.tagline}
                onChange={handleSettingChange}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="biz-phone">Contact Phone Numbers</label>
              <input
                id="biz-phone"
                type="text"
                name="phone"
                value={businessSettings.phone}
                onChange={handleSettingChange}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="biz-address">Physical Address</label>
              <textarea
                id="biz-address"
                name="address"
                value={businessSettings.address}
                onChange={handleSettingChange}
                className="form-control"
                rows={3}
                style={{ fontFamily: 'inherit' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="biz-footer">Invoice Thank You Footer</label>
              <input
                id="biz-footer"
                type="text"
                name="footerText"
                value={businessSettings.footerText}
                onChange={handleSettingChange}
                className="form-control"
              />
            </div>

            <div style={{ marginTop: '6px' }}>
              <button type="submit" disabled={loading} className="btn btn-primary btn-mobile-full">
                <Save size={16} /> {loading ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>

          </form>
        </div>

        {/* Expense Category Settings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Tag size={18} /> Expense Categories
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>Create custom expense tags to match your operational accounts</p>
          </div>

          {/* Quick Add Form */}
          <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. Internet, Marketing"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              required
              className="form-control"
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={savingCategory || !newCategoryName.trim()} className="btn btn-primary" style={{ padding: '0 16px' }}>
              <Plus size={16} />
            </button>
          </form>

          {/* List of Custom Categories */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>Custom Categories</h4>
            {customCategories.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {customCategories.map(cat => (
                  <span key={cat.id} className="badge badge-warning" style={{ gap: '6px', padding: '6px 10px', fontSize: '0.78rem', textTransform: 'none' }}>
                    {cat.name}
                    <button 
                      type="button" 
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>No custom categories configured yet.</p>
            )}
          </div>

          {/* List of default Categories */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>Built-in Default Categories</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {systemDefaultCategories.map(cat => (
                <span key={cat} className="badge badge-info" style={{ padding: '6px 10px', fontSize: '0.75rem', textTransform: 'none' }}>
                  {cat}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--primary-light)', padding: '10px', borderRadius: '8px', marginTop: 'auto' }}>
            <Info size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--primary)', margin: 0 }}>
              Default categories are built into the system reports and cannot be deleted or renamed.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
