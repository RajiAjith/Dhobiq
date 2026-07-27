import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LogOut, Home, Users, Receipt, FileText, Settings,
  Menu, X, Briefcase, CreditCard, BarChart3, Sliders, ChevronDown
} from 'lucide-react';

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close bottom sheet on route change
  useEffect(() => {
    setMoreSheetOpen(false);
  }, [location.pathname]);

  // Handle glassmorphism scrolled header effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Body scroll lock during active mobile bottom sheet overlay
  useEffect(() => {
    if (moreSheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [moreSheetOpen]);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/' ? 'active' : '';
    }
    return location.pathname.startsWith(path) ? 'active' : '';
  };

  const moreItems = [
    { to: '/expenses', icon: CreditCard, label: 'Expenses', color: 'var(--accent-expenses)', bg: 'var(--orange-bg)' },
    { to: '/employees', icon: Briefcase, label: 'Employees', color: 'var(--accent-employees)', bg: 'var(--pink-bg)' },
    { to: '/reports', icon: BarChart3, label: 'Reports', color: 'var(--accent-reports)', bg: 'var(--teal-bg)' },
    { to: '/services', icon: Settings, label: 'Services', color: 'var(--accent-services)', bg: 'var(--purple-bg)' },
    { to: '/settings', icon: Sliders, label: 'Settings', color: 'var(--accent-settings)', bg: 'var(--primary-light)' },
  ];

  return (
    <div className="app-container">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <Link to="/" className="header-brand">
          <div className="header-brand-logo">
            <img src="/fflogo.png" alt="Dhobiq Logo" onError={e => e.target.style.display = 'none'} />
          </div>
          <div className="flex-col">
            <span className="header-brand-name">Dhobiq Laundry</span>
            <span className="header-brand-tagline">Business Admin</span>
          </div>
        </Link>

        {/* Desktop Main Navigation */}
        <nav className="desktop-nav">
          <Link to="/" className={`desktop-nav-link nav-home ${isActive('/')}`}>
            <Home size={16} />
            <span>Home</span>
          </Link>
          <Link to="/bills" className={`desktop-nav-link nav-bills ${isActive('/bills')}`}>
            <Receipt size={16} />
            <span>Bills</span>
          </Link>
          <Link to="/invoices" className={`desktop-nav-link nav-invoices ${isActive('/invoices')}`}>
            <FileText size={16} />
            <span>Invoices</span>
          </Link>
          <Link to="/customers" className={`desktop-nav-link nav-customers ${isActive('/customers')}`}>
            <Users size={16} />
            <span>Customers</span>
          </Link>

          {/* More options dropdown for Desktop */}
          <div className="desktop-nav-dropdown">
            <button className="desktop-nav-dropdown-trigger">
              <Sliders size={16} />
              <span>Configure</span>
              <ChevronDown size={12} />
            </button>
            <div className="desktop-nav-dropdown-menu">
              <Link to="/expenses" className={`desktop-nav-dropdown-item ${isActive('/expenses')}`}>
                <div className="icon-box icon-box-sm icon-box--orange" style={{ marginRight: 8 }}><CreditCard size={14} /></div>
                Expenses
              </Link>
              <Link to="/employees" className={`desktop-nav-dropdown-item ${isActive('/employees')}`}>
                <div className="icon-box icon-box-sm icon-box--pink" style={{ marginRight: 8 }}><Briefcase size={14} /></div>
                Employees
              </Link>
              <Link to="/reports" className={`desktop-nav-dropdown-item ${isActive('/reports')}`}>
                <div className="icon-box icon-box-sm icon-box--teal" style={{ marginRight: 8 }}><BarChart3 size={14} /></div>
                Reports
              </Link>
              <div className="dropdown-divider" />
              <Link to="/services" className={`desktop-nav-dropdown-item ${isActive('/services')}`}>
                <div className="icon-box icon-box-sm icon-box--purple" style={{ marginRight: 8 }}><Settings size={14} /></div>
                Services
              </Link>
              <Link to="/settings" className={`desktop-nav-dropdown-item ${isActive('/settings')}`}>
                <div className="icon-box icon-box-sm icon-box--primary" style={{ marginRight: 8 }}><Sliders size={14} /></div>
                Settings
              </Link>
              <div className="dropdown-divider" />
              <button onClick={handleLogout} className="desktop-nav-dropdown-item danger">
                <div className="icon-box icon-box-sm icon-box--danger" style={{ marginRight: 8 }}><LogOut size={14} /></div>
                Logout
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* ── MOBILE BOTTOM NAVIGATION ──────────────────────────────────────── */}
      <nav className="mobile-nav">
        <Link to="/" className={`mobile-nav-item nav-home ${isActive('/')}`}>
          <span className="mobile-nav-icon"><Home size={20} /></span>
          <span className="mobile-nav-label">Home</span>
        </Link>
        <Link to="/bills" className={`mobile-nav-item nav-bills ${isActive('/bills')}`}>
          <span className="mobile-nav-icon"><Receipt size={20} /></span>
          <span className="mobile-nav-label">Bills</span>
        </Link>
        <Link to="/invoices" className={`mobile-nav-item nav-invoices ${isActive('/invoices')}`}>
          <span className="mobile-nav-icon"><FileText size={20} /></span>
          <span className="mobile-nav-label">Invoices</span>
        </Link>
        <Link to="/customers" className={`mobile-nav-item nav-customers ${isActive('/customers')}`}>
          <span className="mobile-nav-icon"><Users size={20} /></span>
          <span className="mobile-nav-label">Customers</span>
        </Link>
        <button
          onClick={() => setMoreSheetOpen(true)}
          className={`mobile-nav-item ${moreSheetOpen ? 'active' : ''}`}
          aria-label="Open management menu"
        >
          <span className="mobile-nav-icon"><Menu size={20} /></span>
          <span className="mobile-nav-label">More</span>
        </button>
      </nav>

      {/* ── MOBILE MORE BOTTOM SHEET ──────────────────────────────────────── */}
      <div
        className={`sheet-overlay ${moreSheetOpen ? 'open' : ''}`}
        onClick={() => setMoreSheetOpen(false)}
      >
        <div className="sheet-content" onClick={e => e.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-header">
            <h3 className="sheet-title">Management Menu</h3>
            <button className="sheet-close" onClick={() => setMoreSheetOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="more-grid">
            {moreItems.map(item => {
              const IconComp = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`more-grid-item ${isActive(item.to) ? 'active' : ''}`}
                >
                  <div
                    className="icon-box icon-box-lg"
                    style={{ backgroundColor: item.bg, color: item.color }}
                  >
                    <IconComp size={22} />
                  </div>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button onClick={handleLogout} className="more-grid-item danger">
              <div
                className="icon-box icon-box-lg"
                style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}
              >
                <LogOut size={22} />
              </div>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
