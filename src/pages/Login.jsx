import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import { useToast } from '../components/ToastNotification';

export default function Login() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { reportError } = useNetwork();
  const toast = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(emailRef.current.value, passwordRef.current.value);
      toast.success('Welcome back to Dhobiq!', { title: 'Signed In Successfully' });
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      reportError(err);
      if (isNetworkError(err)) {
        setError('No internet connection. Please check your network and try again.');
        toast.error('Network Error. Please try again.');
      } else {
        setError('Invalid email or password. Please try again.');
        toast.error('Authentication failed.');
      }
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb1" />
      <div className="login-bg-orb2" />

      <div className="login-brand">
        <div className="login-logo-wrap">
          <div className="login-logo-ring" />
          <img src="/fflogo.png" alt="Dhobiq" onError={e => { e.target.style.display = 'none'; }} />
        </div>
        <h1 className="login-app-name">Dhobiq Laundry</h1>
        <p className="login-tagline">Freshness Delivered to Your Doorstep</p>
      </div>

      <div className="login-card">
        <h2 className="login-card-title">Welcome Admin</h2>
        <p className="login-card-subtitle">Please enter your credentials to access the console</p>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} className="alert-icon" />
            <div className="alert-body">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="email-input">
              <span className="label-icon"><Mail size={12} /></span>
              Email Address
            </label>
            <input
              id="email-input"
              type="email"
              ref={emailRef}
              required
              className="form-control"
              placeholder="admin@dhobiq.com"
              autoComplete="email"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="password-input">
              <span className="label-icon"><Lock size={12} /></span>
              Security Password
            </label>
            <input
              id="password-input"
              type="password"
              ref={passwordRef}
              required
              className="form-control"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {loading ? (
              <>
                <span className="btn-spinner" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <LogIn size={18} />
                <span>Sign In to Dashboard</span>
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          Dhobiq Enterprise Solutions v3.0
        </p>
      </div>
    </div>
  );
}
