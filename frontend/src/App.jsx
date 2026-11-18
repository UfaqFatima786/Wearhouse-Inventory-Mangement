import { useEffect, useState } from 'react';
import { ArrowLeft, Boxes, LockKeyhole, Mail, ShieldAlert, UserRound } from 'lucide-react';
import Dashboard from './Dashboard.jsx';
import { api, clearSession, readUser, saveSession } from './api.js';

export default function App() {
  const [user, setUser] = useState(readUser);
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(window.location.pathname === '/unauthorized');

  useEffect(() => {
    const showAccessDenied = () => {
      window.history.pushState({}, '', '/unauthorized');
      setAccessDenied(true);
    };
    window.addEventListener('warehouse:access-denied', showAccessDenied);
    return () => window.removeEventListener('warehouse:access-denied', showAccessDenied);
  }, []);

  useEffect(() => {
    if (!user || !localStorage.getItem('warehouse-token')) return;
    api('/auth/me').then(({ user: current }) => {
      localStorage.setItem('warehouse-user', JSON.stringify(current));
      setUser(current);
    }).catch(() => {
      clearSession();
      setUser(null);
    });
  }, []);

  if (accessDenied) {
    return (
      <main className="access-page">
        <div className="access-card">
          <div className="access-icon"><ShieldAlert size={25} /></div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <h1>Access denied</h1>
          <p>Your account does not have permission to view this page or perform this action. Contact your workspace administrator if you need access.</p>
          <button className="button primary" onClick={() => {
            window.history.pushState({}, '', '/');
            setAccessDenied(false);
          }}><ArrowLeft size={16} /> Return to workspace</button>
        </div>
      </main>
    );
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const result = await api(path, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      saveSession(result);
      setUser(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (user && localStorage.getItem('warehouse-token')) {
    return <Dashboard user={user} onUserChange={setUser} onLogout={() => { clearSession(); setUser(null); }} />;
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark"><Boxes size={23} /></div>
          <div><strong>stockroom</strong><span>WAREHOUSE OPERATIONS</span></div>
        </div>
        <div className="auth-intro">
          <div className="eyebrow">YOUR INVENTORY, IN CONTROL</div>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p>One clear view of every product, movement, and order.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>Full name</span>
              <div className="input-icon"><UserRound size={17} /><input name="name" required placeholder="Alex Morgan" /></div>
            </label>
          )}
          <label className="field">
            <span>Email address</span>
            <div className="input-icon"><Mail size={17} /><input name="email" type="email" required placeholder="you@company.com" /></div>
          </label>
          <label className="field">
            <span>Password</span>
            <div className="input-icon"><LockKeyhole size={17} /><input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></div>
          </label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <div className="auth-switch">
          {mode === 'login' ? 'New to Stockroom?' : 'Already have an account?'}
          <button onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'Create account' : 'Sign in'}
          </button>
        </div>
        <div className="auth-footnote">Account role is assigned securely by your workspace administrator.</div>
      </section>
      <div className="auth-aside">
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
        <div className="aside-content">
          <div className="aside-tag"><span className="live-dot" /> INVENTORY PLATFORM</div>
          <h2>Every item<br />has its place.</h2>
          <p>Connect your warehouses, follow stock in real time, and move orders forward with confidence.</p>
          <div className="aside-stats">
            <div><strong>01</strong><span>Unified inventory</span></div>
            <div><strong>02</strong><span>Clear stock movement</span></div>
            <div><strong>03</strong><span>Smarter fulfilment</span></div>
          </div>
        </div>
        <div className="aside-footer">MADE FOR TEAMS THAT MOVE THINGS</div>
      </div>
    </main>
  );
}
