import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { api, DEMO_MODE } from './api/index.js';
import { initAuth, currentUser, onUserChange, switchDemoUser, demoUsers, authMode, can, signOut } from './auth/auth.js';
import { ToastProvider, useToast } from './components/ui.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { CaptureScreen } from './screens/CaptureScreen.jsx';
import { ReviewScreen } from './screens/ReviewScreen.jsx';
import { TemplatesScreen } from './screens/TemplatesScreen.jsx';
import { AdminScreen } from './screens/AdminScreen.jsx';
import { onConnectivity, queued, dequeue } from './lib/offlineQueue.js';

const NAV = [['home', 'Home', 'view'], ['capture', 'Capture', 'capture'], ['review', 'Review', 'view'], ['templates', 'Templates', 'view'], ['admin', 'Admin', 'admin']];

function ReviewWrapper({ catalog, user, onOpenCapture }) {
  const { focusId } = useParams();
  return <ReviewScreen catalog={catalog} user={user} focusId={focusId} onOpenCapture={onOpenCapture} />;
}

function Shell() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(queued().length);

  useEffect(() => { initAuth().then(setUser); return onUserChange(setUser); }, []);
  const reloadCatalog = useCallback(() => api.getCatalog().then(setCatalog), []);
  useEffect(() => { if (user) reloadCatalog(); }, [user, reloadCatalog]);

  useEffect(() => onConnectivity(async (isOnline) => {
    setOnline(isOnline);
    if (!isOnline) return;
    for (const item of queued()) {
      try { await api.submitObservation(item.doc, []); dequeue(item.id); toast(`Synced queued observation for ${item.doc.context.sampleCode}`, 'ok'); } catch { /* keep in queue */ }
    }
    setPending(queued().length);
  }), [toast]);

  const go = useCallback((name, params = {}) => {
    if (name === 'capture' && params.ctx) {
      navigate('/capture', { state: { ctx: params.ctx } });
    } else if (name === 'review' && params.focusId) {
      navigate(`/review/${params.focusId}`);
    } else if (name === 'review') {
      navigate('/review');
    } else {
      navigate(`/${name}`);
    }
    window.scrollTo({ top: 0 });
  }, [navigate]);

  if (!user || !catalog) return <div className="empty"><h3>Loading Stability Capture</h3>{authMode() === 'msal' ? 'Signing in with Microsoft Entra ID' : 'Preparing demo data'}</div>;

  const initials = user.displayName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const captureState = location.state || {};
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" role="button" tabIndex={0} onClick={() => go('home')} onKeyDown={(e) => e.key === 'Enter' && go('home')}><span className="brand-mark">SC</span>Stability Capture</div>
        <nav className="nav" aria-label="Main">
          {NAV.filter(([, , perm]) => can(user, perm)).map(([k, l]) => (
            <button key={k} onClick={() => go(k)} aria-current={(k === 'home' && (location.pathname === '/' || location.pathname === '/home')) || (k === 'capture' && location.pathname === '/capture') || (k === 'review' && location.pathname.startsWith('/review')) || (k === 'templates' && location.pathname === '/templates') || (k === 'admin' && location.pathname === '/admin') ? 'page' : undefined}>{l}</button>
          ))}
        </nav>
        <div className="topbar-right">
          {!online && <span className="pill offline">Offline</span>}
          {pending > 0 && <span className="pill watch">{pending} queued</span>}
          {DEMO_MODE && <span className="pill">Demo, no backend</span>}
          <div className="user-menu">
            <span className="avatar" aria-hidden="true">{initials}</span>
            {authMode() === 'demo' ? (
              <select value={user.userId} onChange={(e) => switchDemoUser(e.target.value)} aria-label="Switch demo persona" title="Switch persona to exercise role-based access">
                {demoUsers.map((u) => <option key={u.userId} value={u.userId}>{u.displayName} · {u.role.toLowerCase()}</option>)}
              </select>
            ) : (
              <><span className="small"><b>{user.displayName}</b> · {user.role.toLowerCase()}</span><button className="btn xs" onClick={signOut}>Sign out</button></>
            )}
          </div>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomeScreen catalog={catalog} user={user} onCapture={(ctx) => go('capture', { ctx })} onReview={(id) => go('review', { focusId: id })} />} />
          <Route path="/home" element={<HomeScreen catalog={catalog} user={user} onCapture={(ctx) => go('capture', { ctx })} onReview={(id) => go('review', { focusId: id })} />} />
          <Route path="/capture" element={<CaptureScreen catalog={catalog} user={user} online={online} initialContext={captureState.ctx} onSubmitted={(doc) => { setPending(queued().length); go('review', { focusId: doc.observationId }); }} />} />
          <Route path="/review" element={<ReviewWrapper catalog={catalog} user={user} onOpenCapture={(ctx) => go('capture', { ctx })} />} />
          <Route path="/review/:focusId" element={<ReviewWrapper catalog={catalog} user={user} onOpenCapture={(ctx) => go('capture', { ctx })} />} />
          <Route path="/templates" element={<TemplatesScreen catalog={catalog} user={user} />} />
          <Route path="/admin" element={can(user, 'admin') ? <AdminScreen catalog={catalog} user={user} onCatalogChange={reloadCatalog} /> : <div className="card">Administration is limited to the admin role.</div>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </BrowserRouter>
  );
}
