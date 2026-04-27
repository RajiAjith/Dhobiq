import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Home, Users, FileText, PlusCircle, Settings } from 'lucide-react';

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

        <nav className="nav-links">
          <Link to="/" className={isActive('/')} title="Dashboard">
            <Home size={18} />
            <span className="nav-label">Home</span>
          </Link>
          <Link to="/customers" className={isActive('/customers')} title="Customers">
            <Users size={18} />
            <span className="nav-label">Customers</span>
          </Link>
          <Link to="/invoices" className={isActive('/invoices')} title="Invoice History">
            <FileText size={18} />
            <span className="nav-label">History</span>
          </Link>
          <Link to="/create-invoice" className={isActive('/create-invoice')} title="New Invoice">
            <PlusCircle size={18} />
            <span className="nav-label">New</span>
          </Link>
          <Link to="/services" className={isActive('/services')} title="Services">
            <Settings size={18} />
            <span className="nav-label">Services</span>
          </Link>
          <button onClick={handleLogout} className="btn-icon-nav" title="Logout">
            <LogOut size={18} />
          </button>
        </nav>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
