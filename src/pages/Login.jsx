import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNetwork, isNetworkError } from '../context/NetworkContext';

export default function Login() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { reportError } = useNetwork();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(emailRef.current.value, passwordRef.current.value);
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      reportError(err);
      if (isNetworkError(err)) {
        setError('No internet connection. Please check your network and try again.');
      } else {
        setError('Failed to log in: ' + err.message);
      }
    }
    setLoading(false);
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="text-center mb-2">
          <img
            src="/logo.png"
            alt="Dhobiq Logo"
            style={{ height: '100px', width: 'auto', marginBottom: '12px', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <h2 className="card-title" style={{ borderBottom: 'none', marginBottom: '4px' }}>Dhobiq Admin</h2>
          <p className="text-muted">Sign in to your account</p>
        </div>

        {error && <div className="alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              ref={emailRef}
              required
              className="form-control"
              autoComplete="email"
              inputMode="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              ref={passwordRef}
              required
              className="form-control"
              autoComplete="current-password"
            />
          </div>
          <button disabled={loading} className="btn btn-primary w-100 mt-2" type="submit">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
