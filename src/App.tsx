import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './pages/LandingPage';
import AdminLogin from './pages/AdminLogin';
import CustomerLogin from './pages/CustomerLogin';
import AdminDashboard from './pages/AdminDashboard';
import JobCardForm from './pages/JobCardForm';
import ChatPage from './pages/ChatPage';
import PartsPage from './pages/PartsPage';
import SettingsPage from './pages/SettingsPage';
import CustomerView from './pages/CustomerView';
import V2JobCardsPage from './pages/V2JobCardsPage';
import QuotesPage from './pages/QuotesPage';
import Navbar from './components/Navbar';
import NotificationSimulator from './components/NotificationSimulator';
import EngineBackground from './components/EngineBackground';
import { db } from './firebase';
import { doc, setDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { RadioProvider } from './contexts/RadioContext';
import GlobalRadioPlayer from './components/GlobalRadioPlayer';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading, isWorkshopSession } = useAuth();
  const location = useLocation();
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="rounded-full h-12 w-12 border-b-2 border-[#cc0000]"
      />
      <p className="font-bold text-slate-400 animate-pulse">Establishing secure connection...</p>
    </div>
  );

  if (!isAdmin && isWorkshopSession && location.pathname === '/admin/settings') {
    return <Navigate to="/admin/dashboard" />;
  }

  if (!isWorkshopSession && !isAdmin) return <Navigate to="/admin-login" />;
  return <>{children}</>;
}

const pageVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -15 },
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full flex flex-col flex-1"
      >
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/customer-login" element={<CustomerLogin />} />
          <Route path="/customer/view/:id" element={<CustomerView />} />
          
          <Route path="/admin/dashboard" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/job-card/new" element={<PrivateRoute><JobCardForm /></PrivateRoute>} />
          <Route path="/admin/job-card/:id" element={<PrivateRoute><JobCardForm /></PrivateRoute>} />
          <Route path="/admin/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/admin/parts" element={<PrivateRoute><PartsPage /></PrivateRoute>} />
          <Route path="/admin/quotes" element={<PrivateRoute><QuotesPage /></PrivateRoute>} />
          <Route path="/admin/v2-job-cards" element={<PrivateRoute><V2JobCardsPage /></PrivateRoute>} />
          <Route path="/admin/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}

function AppContent() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout;
    let reconnectTimeout: NodeJS.Timeout;
    let fallbackInterval: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    let isFallbackActive = false;

    const startFallback = () => {
      if (isFallbackActive) return;
      isFallbackActive = true;
      console.log('WebSocket unavailable, starting fallback polling...');
      fallbackInterval = setInterval(async () => {
        try {
           const res = await fetch('/api/health');
           if (!res.ok) {
             // Silently retry
           }
        } catch (e) {
           // Silently retry
        }
      }, 30000);
    };

    const stopFallback = () => {
      if (!isFallbackActive) return;
      isFallbackActive = false;
      clearInterval(fallbackInterval);
      console.log('Restoring WebSocket, stopped fallback polling.');
    };

    const connect = () => {
      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        startFallback();
        return;
      }
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/keepalive`;
      
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Keep-alive WebSocket connected');
          reconnectAttempts = 0; // reset
          stopFallback();
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 30000);
        };

        ws.onmessage = async (event) => {
          if (event.data === 'pong') return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'EXTERNAL_SYNC_DATA') {
              console.log("Received EXTERNAL_SYNC_DATA via WS:", message.payload);
            }
          } catch (err) {
            // Ignore parse errors from keep-alive polling
          }
        };

        ws.onclose = (event) => {
          clearInterval(pingInterval);
          ws = null;
          startFallback();
          
          reconnectAttempts++;
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // exponential backoff max 30s
          reconnectTimeout = setTimeout(connect, timeout);
        };

        ws.onerror = (err) => {
          // Silent failure, rely on onclose handler
        };
      } catch (err) {
        startFallback();
      }
    };

    connect();

    return () => {
      clearInterval(pingInterval);
      clearInterval(fallbackInterval);
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // prevent reconnect trigger
        ws.close();
      }
    };
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <div className="min-h-screen bg-transparent font-sans text-slate-900 dark:text-slate-100 selection:bg-[#cc0000] selection:text-white">
        <EngineBackground />
        <Navbar />
        <main className="max-w-[1550px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <AnimatedRoutes />
        </main>
        <NotificationSimulator />
        <GlobalRadioPlayer />
      </div>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RadioProvider>
        <AppContent />
      </RadioProvider>
    </AuthProvider>
  );
}
