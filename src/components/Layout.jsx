import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LogOut, Home, Users, Receipt, FileText, Settings, 
  Menu, X, Briefcase, CreditCard, BarChart3, Sliders, ChevronDown 
} from 'lucide-react';

export default function Layout() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  // Close sheet on path change
  useEffect(() => {
    setMoreSheetOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  const isActive = (path) =>
    location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(path))
      ? 'active'
      : '';

  return (
    <div className="app-container">
      <header className="header">
        <Link to="/" className="header-brand">
          <img
            src="/fflogo.png"
            alt="Dhobiq Logo"
            style={{ height: '34px', width: 'auto', marginRight: '8px' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <h1>Dhobiq Laundry</h1>
        </Link>

        {/* Desktop Navigation (min-width: 768px) */}
        <nav className="nav-links desktop-nav-links">
          <Link to="/" className={isActive('/')} title="Dashboard">
            <Home size={16} />
            <span className="nav-label">Home</span>
          </Link>
          <Link to="/bills" className={isActive('/bills')} title="Bills">
            <Receipt size={16} />
            <span className="nav-label">Bills</span>
          </Link>
          <Link to="/invoices" className={isActive('/invoices')} title="Invoices">
            <FileText size={16} />
            <span className="nav-label">Invoice</span>
          </Link>
          <Link to="/customers" className={isActive('/customers')} title="Customers">
            <Users size={16} />
            <span className="nav-label">Customers</span>
          </Link>
          <Link to="/expenses" className={isActive('/expenses')} title="Expenses">
            <CreditCard size={16} />
            <span className="nav-label">Expenses</span>
          </Link>
          <Link to="/employees" className={isActive('/employees')} title="Employees">
            <Briefcase size={16} />
            <span className="nav-label">Employees</span>
          </Link>
          <Link to="/reports" className={isActive('/reports')} title="Reports">
            <BarChart3 size={16} />
            <span className="nav-label">Reports</span>
          </Link>

          {/* More Dropdown for Desktop */}
          <div className="nav-dropdown">
            <button className="nav-dropdown-trigger" title="More Options">
              <Settings size={16} />
              <span className="nav-label">Configure</span>
              <ChevronDown size={12} />
            </button>
            <div className="nav-dropdown-menu">
              <Link to="/services" className={isActive('/services')}>
                <Settings size={14} /> Services
              </Link>
              <Link to="/settings" className={isActive('/settings')}>
                <Sliders size={14} /> Settings
              </Link>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <button onClick={handleLogout} style={{ color: 'var(--danger)' }}>
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Mobile Navigation Bottom Bar (max-width: 767px) */}
      <nav className="nav-links mobile-nav-links">
        <Link to="/" className={isActive('/')} title="Dashboard">
          <Home size={18} />
          <span className="nav-label">Home</span>
        </Link>
        <Link to="/bills" className={isActive('/bills')} title="Bills">
          <Receipt size={18} />
          <span className="nav-label">Bills</span>
        </Link>
        <Link to="/invoices" className={isActive('/invoices')} title="Invoices">
          <FileText size={18} />
          <span className="nav-label">Invoice</span>
        </Link>
        <Link to="/customers" className={isActive('/customers')} title="Customers">
          <Users size={18} />
          <span className="nav-label">Customers</span>
        </Link>
        <button 
          onClick={() => setMoreSheetOpen(true)} 
          className={`btn-icon-nav ${moreSheetOpen ? 'active' : ''}`} 
          title="More Menus"
          style={{ borderTop: moreSheetOpen ? '2px solid var(--primary)' : 'none' }}
        >
          <Menu size={18} />
          <span className="nav-label">More</span>
        </button>
      </nav>

      {/* Mobile Drawer Slide-up Bottom Sheet (max-width: 767px) */}
      <div 
        className={`bottom-sheet-overlay ${moreSheetOpen ? 'active' : ''}`}
        onClick={() => setMoreSheetOpen(false)}
      >
        <div 
          className="bottom-sheet-content" 
          onClick={e => e.stopPropagation()}
        >
          <div className="bottom-sheet-header">
            <h3 className="bottom-sheet-title">Management Menu</h3>
            <button className="bottom-sheet-close" onClick={() => setMoreSheetOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="bottom-sheet-grid">
            <Link to="/expenses" className="bottom-sheet-item">
              <CreditCard size={22} className="text-muted" />
              <span>Expenses</span>
            </Link>
            <Link to="/employees" className="bottom-sheet-item">
              <Briefcase size={22} className="text-muted" />
              <span>Employees</span>
            </Link>
            <Link to="/reports" className="bottom-sheet-item">
              <BarChart3 size={22} className="text-muted" />
              <span>Reports</span>
            </Link>
            <Link to="/services" className="bottom-sheet-item">
              <Settings size={22} className="text-muted" />
              <span>Services</span>
            </Link>
            <Link to="/settings" className="bottom-sheet-item">
              <Sliders size={22} className="text-muted" />
              <span>Settings</span>
            </Link>
            <button onClick={handleLogout} className="bottom-sheet-item danger">
              <LogOut size={22} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
