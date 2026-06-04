import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Home, MessageSquare, ClipboardList, Settings, Box, Sun, Moon, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import Logo from './Logo';

export default function Navbar() {
  const { user, isAdmin, isWorkshopSession, setWorkshopSession, setOfficeAdminSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        return savedTheme;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const [hasUnreadChat, setHasUnreadChat] = React.useState(false);
  const lastUnreadMsgId = React.useRef<string | null>(null);

  // Play notification beep sound
  const playBeep = async () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      if (context.state === 'suspended') {
        await context.resume();
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio context beep skipped:", e);
    }
  };

  React.useEffect(() => {
    if (!user) return;

    if (location.pathname === '/admin/chat') {
      setHasUnreadChat(false);
    }

    const q = query(
      collection(db, 'chatMessages'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;
      const lastDoc = snapshot.docs[0];
      const lastMsg = lastDoc.data();
      const msgId = lastDoc.id;

      if (!lastMsg.timestamp) return;

      if (lastMsg.senderId !== user.uid) {
        if (location.pathname !== '/admin/chat') {
          if (lastUnreadMsgId.current !== msgId && lastUnreadMsgId.current !== null) {
            setHasUnreadChat(true);
            playBeep();
          }
        }
        lastUnreadMsgId.current = msgId;
      } else {
        lastUnreadMsgId.current = msgId;
      }
    }, (err) => {
      console.warn("Global chat status subscriber error:", err);
    });

    return () => unsubscribe();
  }, [user, location.pathname]);

  React.useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    if (user) {
      await auth.signOut();
    }
    setWorkshopSession(false);
    if (setOfficeAdminSession) {
      setOfficeAdminSession(false);
    } else {
      localStorage.removeItem('isOfficeAdminSession');
    }
    navigate('/');
  };

  const isCustomerPage = location.pathname.includes('/customer');
  const isLocalStorageAdmin = localStorage.getItem('isOfficeAdminSession') === 'true';
  const isLoggedIn = user !== null || isWorkshopSession || isAdmin || isLocalStorageAdmin;

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 print:hidden">
      <div className="max-w-[1550px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Mobile menu button or empty space for left balance */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 lg:flex-none">
          {!isCustomerPage && (
            <Link to="/" className="p-2 text-slate-500 hover:text-[#cc0000] lg:hidden">
              <Home className="h-5 w-5" />
            </Link>
          )}

          {isLoggedIn ? (
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (!isCustomerPage && location.pathname !== '/admin-login' && location.pathname !== '/customer-login') ? (
            <Link 
              to="/admin-login"
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-white bg-[#cc0000] hover:bg-[#b30000] rounded-full transition-colors"
            >
              Login
            </Link>
          ) : null}

          {/* Dark Mode Toggle for Low-Light Workshop */}
          <button 
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center p-2 rounded-full text-slate-500 hover:text-[#cc0000] dark:text-slate-400 dark:hover:text-amber-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all border border-slate-200/50 dark:border-slate-700/50 cursor-pointer shadow-sm shrink-0"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle dark mode"
          >
            {theme === 'light' ? (
              <Moon className="h-[18px] w-[18px] text-slate-600" />
            ) : (
              <Sun className="h-[18px] w-[18px] text-amber-400" />
            )}
          </button>
        </div>

        {isLoggedIn && (
          <div className="hidden lg:flex flex-wrap items-center justify-center gap-2 flex-grow mx-4">
            <Link 
              to="/admin/dashboard" 
              className={`flex items-center gap-1.5 px-3.5 py-1.5 bg-white/30 backdrop-blur-sm border border-black rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:bg-black/5 hover:scale-[1.02] active:scale-95 shrink-0 ${
                location.pathname === '/admin/dashboard'
                  ? 'bg-black text-white hover:text-red-400 shadow-md'
                  : 'text-slate-700 hover:text-[#cc0000]'
              }`}
              title="Dashboard"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </Link>
            <Link 
              to="/admin/chat" 
              className={`relative flex items-center gap-1.5 px-3.5 py-1.5 bg-white/30 backdrop-blur-sm border border-black rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:bg-black/5 hover:scale-[1.02] active:scale-95 shrink-0 ${
                location.pathname === '/admin/chat'
                  ? 'bg-black text-white hover:text-red-400 shadow-md'
                  : 'text-slate-700 hover:text-[#cc0000]'
              }`}
              title="Workshop Chat"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Chat</span>
              {hasUnreadChat && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 border border-white"></span>
                </span>
              )}
            </Link>
            {!isWorkshopSession && (
              <Link 
                to="/admin/parts" 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 bg-white/30 backdrop-blur-sm border border-black rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:bg-black/5 hover:scale-[1.02] active:scale-95 shrink-0 ${
                  location.pathname === '/admin/parts'
                    ? 'bg-black text-white hover:text-red-400 shadow-md'
                    : 'text-slate-700 hover:text-[#cc0000]'
                }`}
                title="Parts Inventory"
              >
                <Box className="h-3.5 w-3.5" />
                <span>Parts</span>
              </Link>
            )}
            {!isWorkshopSession && (
              <Link 
                to="/admin/quotes" 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 bg-white/30 backdrop-blur-sm border border-black rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:bg-black/5 hover:scale-[1.02] active:scale-95 shrink-0 ${
                  location.pathname === '/admin/quotes'
                    ? 'bg-black text-white hover:text-red-400 shadow-md'
                    : 'text-slate-700 hover:text-[#cc0000]'
                }`}
                title="Quoting System"
              >
                <FileText className="h-3.5 w-3.5 text-red-500" />
                <span>Quotes</span>
              </Link>
            )}
            {!isWorkshopSession && (
              <Link 
                to="/admin/v2-job-cards" 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 bg-white/30 backdrop-blur-sm border border-black rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:bg-black/5 hover:scale-[1.02] active:scale-95 shrink-0 ${
                  location.pathname === '/admin/v2-job-cards'
                    ? 'bg-black text-white hover:text-red-400 shadow-md'
                    : 'text-indigo-600 hover:text-[#cc0000]'
                }`}
                title="V2 Job Cards Controller"
              >
                <ClipboardList className="h-3.5 w-3.5 text-indigo-500" />
                <span>V2 Job Cards</span>
              </Link>
            )}
            {isAdmin && (
              <Link 
                to="/admin/settings" 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 bg-white/30 backdrop-blur-sm border border-black rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:bg-black/5 hover:scale-[1.02] active:scale-95 shrink-0 ${
                  location.pathname === '/admin/settings'
                    ? 'bg-black text-white hover:text-red-400 shadow-md'
                    : 'text-slate-700 hover:text-[#cc0000]'
                }`}
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Settings</span>
              </Link>
            )}
          </div>
        )}

        <Link to={isCustomerPage ? "/customer-login" : "/"} className="flex items-center justify-end flex-1 hover:opacity-95 transition-all outline-none">
          <Logo className="h-4 sm:h-6" outlined />
        </Link>
      </div>
    </nav>
  );
}
