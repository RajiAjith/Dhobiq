import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NetworkProvider } from './context/NetworkContext';
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

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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

        {/* Bills (daily entries) */}
        <Route path="bills"             element={<BillList />} />
        <Route path="bills/new"         element={<BillCreate />} />
        <Route path="bills/:id/edit"    element={<BillCreate />} />

        {/* Invoices (consolidated monthly) */}
        <Route path="invoices"          element={<InvoiceList />} />
        <Route path="invoices/new"      element={<InvoiceCreate />} />
        <Route path="invoices/:id"      element={<InvoiceDetail />} />

        {/* Services */}
        <Route path="services" element={<ServiceList />} />

        {/* New modules: Employees */}
        <Route path="employees"      element={<EmployeeList />} />
        <Route path="employees/new"  element={<EmployeeForm />} />
        <Route path="employees/:id"  element={<EmployeeForm />} />

        {/* New modules: Salaries */}
        <Route path="salaries/new"   element={<SalaryPaymentForm />} />

        {/* New modules: Expenses */}
        <Route path="expenses"          element={<ExpenseList />} />
        <Route path="expenses/new"      element={<ExpenseForm />} />
        <Route path="expenses/:id/edit" element={<ExpenseForm />} />

        {/* New modules: Reports */}
        <Route path="reports"           element={<Reports />} />

        {/* New modules: Settings */}
        <Route path="settings"          element={<Settings />} />

        {/* Legacy URL redirects — keep old bookmarks working */}
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
        <Router>
          <OfflineBanner />
          <AppRoutes />
          <InstallPrompt />
        </Router>
      </AuthProvider>
    </NetworkProvider>
  );
}

export default App;
