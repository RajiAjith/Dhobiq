import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NetworkProvider } from './context/NetworkContext';
import { ToastProvider } from './components/ToastNotification';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/CustomerList';
import CustomerForm from './pages/CustomerForm';

// Bill module (replaces old Invoice as daily entry)
import BillList   from './pages/BillList';
import BillCreate from './pages/BillCreate';

// Invoice module (new consolidated invoice)
import InvoiceList   from './pages/InvoiceList';
import InvoiceCreate from './pages/InvoiceCreate';
import InvoiceDetail from './pages/InvoiceDetail';

import ServiceList from './pages/ServiceList';
import InstallPrompt from './components/InstallPrompt';
import OfflineBanner from './components/OfflineBanner';

// New modules
import EmployeeList from './pages/EmployeeList';
import EmployeeForm from './pages/EmployeeForm';
import SalaryPaymentForm from './pages/SalaryPaymentForm';
import ExpenseList from './pages/ExpenseList';
import ExpenseForm from './pages/ExpenseForm';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ShareDoc from './pages/ShareDoc';
import { useEffect } from 'react';

// Scroll Restoration component to reset window scroll coordinates on route transitions
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/share" element={<ShareDoc />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        {/* Dashboard */}
        <Route index element={<Dashboard />} />

        {/* Customers */}
        <Route path="customers"      element={<CustomerList />} />
        <Route path="customers/new"  element={<CustomerForm />} />
        <Route path="customers/:id"  element={<CustomerForm />} />

        {/* Daily Bills */}
        <Route path="bills"             element={<BillList />} />
        <Route path="bills/new"         element={<BillCreate />} />
        <Route path="bills/:id/edit"    element={<BillCreate />} />

        {/* Consolidated Invoices */}
        <Route path="invoices"          element={<InvoiceList />} />
        <Route path="invoices/new"      element={<InvoiceCreate />} />
        <Route path="invoices/:id"      element={<InvoiceDetail />} />

        {/* Services */}
        <Route path="services" element={<ServiceList />} />

        {/* Employees */}
        <Route path="employees"      element={<EmployeeList />} />
        <Route path="employees/new"  element={<EmployeeForm />} />
        <Route path="employees/:id"  element={<EmployeeForm />} />

        {/* Salaries */}
        <Route path="salaries/new"   element={<SalaryPaymentForm />} />

        {/* Expenses */}
        <Route path="expenses"          element={<ExpenseList />} />
        <Route path="expenses/new"      element={<ExpenseForm />} />
        <Route path="expenses/:id/edit" element={<ExpenseForm />} />

        {/* Reports */}
        <Route path="reports"           element={<Reports />} />

        {/* Settings */}
        <Route path="settings"          element={<Settings />} />

        {/* Redirects */}
        <Route path="create-invoice"   element={<Navigate to="/bills/new"  replace />} />
        <Route path="edit-invoice/:id" element={<Navigate to="/bills"      replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <ScrollToTop />
            <OfflineBanner />
            <AppRoutes />
            <InstallPrompt />
          </Router>
        </ToastProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}

export default App;
