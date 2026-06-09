import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const DEMO_USER = {
  email: 'demo@example.com',
  password: 'password123'
};

const SESSION_KEY = 'logh.auth.email';

function currentPath() {
  return window.location.pathname;
}

function App() {
  const [path, setPath] = useState(currentPath);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem(SESSION_KEY));

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextPath) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  };

  const session = useMemo(
    () => ({
      email: userEmail,
      signIn(email) {
        localStorage.setItem(SESSION_KEY, email);
        setUserEmail(email);
        navigate('/dashboard');
      },
      signOut() {
        localStorage.removeItem(SESSION_KEY);
        setUserEmail(null);
        navigate('/');
      }
    }),
    [userEmail]
  );

  if (path === '/dashboard' && session.email) {
    return <Dashboard email={session.email} onSignOut={session.signOut} />;
  }

  if (path === '/dashboard') {
    window.history.replaceState({}, '', '/');
  }

  return <SignIn onSignIn={session.signIn} />;
}

function SignIn({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();

    if (email.trim() === DEMO_USER.email && password === DEMO_USER.password) {
      setError('');
      onSignIn(DEMO_USER.email);
      return;
    }

    setError('Enter the demo email and password to continue.');
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="signin-title">
        <div className="brand">LOGH-7</div>
        <h1 id="signin-title">Sign in</h1>
        <p className="hint">Use the demo account to open the command dashboard.</p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <p role="alert" className="error">{error}</p> : null}

          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ email, onSignOut }) {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-header" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Protected area</p>
          <h1 id="dashboard-title">Command dashboard</h1>
          <p>Signed in as {email}</p>
        </div>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </section>
      <section className="dashboard-grid" aria-label="Dashboard status">
        <article>
          <h2>Access</h2>
          <p>Authenticated session active.</p>
        </article>
        <article>
          <h2>Route guard</h2>
          <p>Unauthenticated visitors are returned to sign in.</p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
