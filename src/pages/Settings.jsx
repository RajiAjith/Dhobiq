import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Save, Plus, Trash2, Settings as SettingsIcon, Sliders, Briefcase, Tag, Info } from 'lucide-react';
import OfflineScreen from '../components/OfflineScreen';
import { useConfirm } from '../components/ConfirmDialog';

export default function Settings() {
  const [loading,        setLoading]        = useState(false);
  const [dataReady,      setDataReady]      = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);
  
  const [businessSettings, setBusinessSettings] = useState({
    name: 'Dhobiq Laundry',
    tagline: 'Your Clothes Our Care!',
    phone: '+91-9061504910, +91-7902958593',
    address: "Near MacDonald's | Thumpoly P.O, Alappuzha",
    footerText: 'Freshness Delivered to Your Doorstep',
    analyticsStartDate: '2026-06-01'
  });

  const [customCategories, setCustomCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const { isOnline, wasOffline, clearWasOffline, reportError } = useNetwork();
  const [ConfirmUI, confirm] = useConfirm();

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
        setBusinessSettings({
          name: 'Dhobiq Laundry',
          tagline: 'Your Clothes Our Care!',
          phone: '+91-9061504910, +91-7902958593',
          address: "Near MacDonald's | Thumpoly P.O, Alappuzha",
          footerText: 'Freshness Delivered to Your Doorstep',
          analyticsStartDate: '2026-06-01',
          ...settingsSnap.data()
        });
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
    const ok = await confirm({
      title: 'Delete Category?',
      message: `The custom expense category "${catName}" will be permanently removed.`,
      confirmLabel: 'Delete Category',
    });
    if (!ok) return;

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
      <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
      {ConfirmUI}
      
      {/* Title Header */}
      <div>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Business Settings</h2>
        <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: '2px', margin: 0 }}>Configure company invoices, bill receipts, and custom categories</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* General Business Profile Settings */}
        <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', marginTop: 0, marginBottom: '14px' }}>
            <Sliders size={16} style={{ color: 'var(--primary)' }} /> Company Branding & Details
          </h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Grid 1: Name and Tagline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="biz-name">Business Name</label>
                <input
                  id="biz-name"
                  type="text"
                  name="name"
                  value={businessSettings.name}
                  onChange={handleSettingChange}
                  required
                  className="form-control"
                  style={{ fontSize: '0.8rem', height: '36px' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="biz-tagline">Marketing Tagline</label>
                <input
                  id="biz-tagline"
                  type="text"
                  name="tagline"
                  value={businessSettings.tagline}
                  onChange={handleSettingChange}
                  className="form-control"
                  style={{ fontSize: '0.8rem', height: '36px' }}
                />
              </div>
            </div>

            {/* Grid 2: Phone Numbers and Start Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="biz-phone">Contact Phone Numbers</label>
                <input
                  id="biz-phone"
                  type="text"
                  name="phone"
                  value={businessSettings.phone}
                  onChange={handleSettingChange}
                  className="form-control"
                  style={{ fontSize: '0.8rem', height: '36px' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="filter-label" htmlFor="analytics-start-date">Analytics Start Date</label>
                <input
                  id="analytics-start-date"
                  type="date"
                  name="analyticsStartDate"
                  value={businessSettings.analyticsStartDate || '2026-06-01'}
                  onChange={handleSettingChange}
                  className="form-control"
                  style={{ fontSize: '0.8rem', height: '36px' }}
                />
              </div>
            </div>

            {/* Physical Address */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="biz-address">Physical Address</label>
              <textarea
                id="biz-address"
                name="address"
                value={businessSettings.address}
                onChange={handleSettingChange}
                className="form-control"
                rows={2}
                style={{ fontSize: '0.8rem', padding: '8px 10px', minHeight: '50px' }}
              />
            </div>

            {/* Invoice Thank You Footer */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="filter-label" htmlFor="biz-footer">Invoice Thank You Footer</label>
              <input
                id="biz-footer"
                type="text"
                name="footerText"
                value={businessSettings.footerText}
                onChange={handleSettingChange}
                className="form-control"
                style={{ fontSize: '0.8rem', height: '36px' }}
              />
            </div>

            <div style={{ marginTop: '6px' }}>
              <button 
                type="submit" 
                disabled={loading} 
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px', fontSize: '0.8rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Save size={14} />
                {loading ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>

          </form>
        </div>

        {/* Expense Category Settings */}
        <div className="card" style={{ padding: '16px', borderRadius: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 0, marginBottom: '2px' }}>
              <Tag size={16} style={{ color: 'var(--primary)' }} /> Expense Categories
            </h3>
            <p className="text-muted" style={{ fontSize: '0.7rem', margin: 0 }}>Create custom expense tags to match your operational accounts</p>
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
              style={{ flex: 1, fontSize: '0.8rem', height: '36px' }}
            />
            <button 
              type="submit" 
              disabled={savingCategory || !newCategoryName.trim()} 
              className="btn btn-primary" 
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px' }}
            >
              <Plus size={16} />
            </button>
          </form>

          {/* List of Custom Categories */}
          <div>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 0, marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>Custom Categories</h4>
            {customCategories.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {customCategories.map(cat => (
                  <span 
                    key={cat.id} 
                    className="badge badge-warning" 
                    style={{ 
                      gap: '6px', 
                      padding: '4px 8px', 
                      fontSize: '0.72rem', 
                      textTransform: 'none', 
                      display: 'inline-flex', 
                      alignItems: 'center',
                      borderRadius: '8px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      color: '#d97706',
                      border: '1px solid rgba(245, 158, 11, 0.15)'
                    }}
                  >
                    {cat.name}
                    <button 
                      type="button" 
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.74rem', fontStyle: 'italic', margin: 0 }}>No custom categories configured yet.</p>
            )}
          </div>

          {/* List of default Categories */}
          <div>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 0, marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>Built-in Default Categories</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {systemDefaultCategories.map(cat => (
                <span 
                  key={cat} 
                  className="badge badge-info" 
                  style={{ 
                    padding: '4px 8px', 
                    fontSize: '0.72rem', 
                    textTransform: 'none',
                    borderRadius: '8px',
                    background: 'rgba(0, 82, 204, 0.05)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(0, 82, 204, 0.1)'
                  }}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', backgroundColor: 'rgba(0, 82, 204, 0.04)', padding: '10px', borderRadius: '10px', marginTop: '4px' }}>
            <Info size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.3 }}>
              Default categories are built into the system reports and cannot be deleted or renamed.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
