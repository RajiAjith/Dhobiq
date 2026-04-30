import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/CustomerList';
import CustomerForm from './pages/CustomerForm';
import InvoiceHistory from './pages/InvoiceHistory';
import InvoiceCreate from './pages/InvoiceCreate';
import ServiceList from './pages/ServiceList';
import InstallPrompt from './components/InstallPrompt';

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
        <Route index           element={<Dashboard />} />
        <Route path="customers"        element={<CustomerList />} />
        <Route path="customers/new"    element={<CustomerForm />} />
        <Route path="customers/:id"    element={<CustomerForm />} />
        <Route path="invoices"         element={<InvoiceHistory />} />
        <Route path="create-invoice"   element={<InvoiceCreate />} />
        <Route path="edit-invoice/:id" element={<InvoiceCreate />} />
        <Route path="services"         element={<ServiceList />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        {/* PWA install prompt — rendered outside routes so it's always visible */}
        <InstallPrompt />
      </Router>
    </AuthProvider>
  );
}

export default App;
