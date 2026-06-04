import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInAnonymously, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, LogIn, Key, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Logo from '../components/Logo';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, isAdmin, isWorkshopSession, setWorkshopSession, setOfficeAdminSession } = useAuth();
  const [activeTab, setActiveTab] = useState<'options' | 'pin' | 'password'>('options');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      
      if (cred.user) {
        try {
          await setDoc(doc(db, 'workshop_sessions', cred.user.uid), {
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
            isAdminSession: true,
            role: 'admin'
          });
          await setDoc(doc(db, 'admin_sessions', cred.user.uid), {
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
          });
        } catch (sessionError) {
          console.error("Failed to create cloud admin session during Google login:", sessionError);
        }
      }

      if (setOfficeAdminSession) {
        setOfficeAdminSession(true);
      }
      navigate('/admin/dashboard');
    } catch (error) {
      console.error("Google authentication failed:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if ((user && isAdmin) || isWorkshopSession) {
      navigate('/admin/dashboard');
    }
  }, [user, isAdmin, isWorkshopSession, navigate]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError(false);
    try {
      let uid = auth.currentUser?.uid;
      if (!uid) {
        try {
          const cred = await signInAnonymously(auth);
          uid = cred.user.uid;
        } catch (anonError) {
          console.warn("Anonymous sign-in skipped (proceeding with local session):", anonError);
        }
      }

      const dbDoc = await getDoc(doc(db, 'settings', 'admin_password'));
      let correctPassword = 'admin'; // default
      if (dbDoc.exists()) {
        correctPassword = dbDoc.data().password || 'admin';
      } else {
        await setDoc(doc(db, 'settings', 'admin_password'), { password: 'admin' });
      }

      if (password.trim() === correctPassword.trim()) {
        if (uid) {
          try {
            await setDoc(doc(db, 'workshop_sessions', uid), {
              createdAt: serverTimestamp(),
              expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
              isAdminSession: true,
              role: 'admin'
            });
            await setDoc(doc(db, 'admin_sessions', uid), {
              createdAt: serverTimestamp(),
              expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
            });
          } catch (sessionError) {
            console.error("Failed to create cloud admin session:", sessionError);
          }
        }

        setOfficeAdminSession(true);
        navigate('/admin/dashboard');
      } else {
        setPasswordError(true);
      }
    } catch (error) {
      console.error("Password verification error:", error);
      setPasswordError(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPinError(false);
    try {
      let uid = auth.currentUser?.uid;
      if (!uid) {
        try {
          const cred = await signInAnonymously(auth);
          uid = cred.user.uid;
        } catch (anonError: any) {
          console.warn("Anonymous sign-in skipped (proceeding with local session):", anonError);
        }
      }

      const settingsDoc = await getDoc(doc(db, 'settings', 'workshop'));
      const correctPin = settingsDoc.exists() ? settingsDoc.data().pin : '1234';
      
      if (correctPin && correctPin.toString().trim() === pin.trim()) {
        if (uid) {
          try {
            await setDoc(doc(db, 'workshop_sessions', uid), {
              createdAt: serverTimestamp(),
              expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
            });
          } catch (sessionError) {
            console.error("Failed to create cloud session:", sessionError);
          }
        }
        
        setWorkshopSession(true);
        navigate('/admin/dashboard');
      } else {
        setPinError(true);
      }
    } catch (error: any) {
      console.error("PIN check failed:", error);
      setPinError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[75vh] px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg mx-auto border border-slate-200/90 bg-white/80 backdrop-blur-md rounded-3xl p-6 md:p-10 shadow-md relative overflow-hidden group hover:border-[#cc0000]/40 transition-colors duration-450 text-center"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#cc0000]/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="flex flex-col items-center relative z-10">
          <motion.div 
             animate={{ y: [0, -8, 0] }}
             transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
             className="flex justify-center mt-1 mb-6"
          >
            <Logo className="h-11 md:h-12" outlined />
          </motion.div>

          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-2">Staff Portal</h2>
          <p className="text-slate-500 text-sm md:text-base font-medium mb-8 max-w-sm mx-auto">
            Authorized access only. Identify yourself below to connect.
          </p>

          <div className="space-y-4 w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'options' && (
              <motion.div
                key="options"
                initial={{ opacity: 0, x: -15, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 15, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="space-y-3"
              >
                <motion.button 
                  whileHover={{ scale: 1.015, y: -2, boxShadow: "0 10px 20px -5px rgba(204, 0, 0, 0.4)" }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setActiveTab('password')}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-4 py-4 px-6 bg-[#cc0000] text-white border-2 border-transparent rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-red-900/10 disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="h-5 w-5" />
                  Office Admin Login
                </motion.button>

                <div className="flex items-center gap-4 my-6 select-none">
                  <div className="h-[1px] flex-1 bg-slate-100"></div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">OR</span>
                  <div className="h-[1px] flex-1 bg-slate-100"></div>
                </div>

                <motion.button 
                  whileHover={{ scale: 1.015, y: -2, borderColor: "#cc0000", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)" }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setActiveTab('pin')}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-4 py-4 px-6 bg-white border-2 border-slate-200 rounded-2xl text-slate-700 font-bold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Key className="h-5 w-5 text-[#cc0000]" />
                  Workshop Staff PIN
                </motion.button>

                <div className="flex items-center gap-4 my-6 select-none">
                  <div className="h-[1px] flex-1 bg-slate-100"></div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">OR</span>
                  <div className="h-[1px] flex-1 bg-slate-100"></div>
                </div>

                <motion.button 
                  whileHover={{ scale: 1.015, y: -2, borderColor: "#e2e8f0", boxShadow: "0 10px 15px -3px rgba(66, 133, 244, 0.15)" }}
                  whileTap={{ scale: 0.985 }}
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-4 py-4 px-6 bg-white border-2 border-slate-200/80 rounded-2xl text-slate-700 font-bold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.63c-.29 1.5-.1.3-1.12 3.14l3.14 2.43c1.84-1.7 2.91-4.2 2.91-7.42z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.14-2.43c-.88.59-2 .95-3.3 1.04-3.13 0-5.78-2.11-6.73-4.96L3.54 18.1c2 3.97 6.11 6.63 11.08 6.63z"/>
                    <path fill="#FBBC05" d="M5.27 14.74c-.25-.74-.39-1.53-.39-2.34s.14-1.6.39-2.34L1.75 6.94C.63 8.98 0 11.38 0 13.91s.63 4.93 1.75 6.97l3.52-2.14z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.93 1.19 15.24 0 12 0 7.03 0 2.92 2.66 1.75 6.93l3.52 3.13c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  Sign in with Google
                </motion.button>
              </motion.div>
            )}

            {activeTab === 'password' && (
              <motion.form
                key="password"
                initial={{ opacity: 0, x: 15, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -15, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                onSubmit={handlePasswordLogin}
                className="space-y-4"
              >
                <div className="text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-2 block">Enter Admin Password</label>
                  <div className="relative">
                    <input 
                      type={showPasswordText ? "text" : "password"}
                      autoFocus
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter office admin password"
                      className={`w-full pl-6 pr-12 py-4 bg-slate-50 border ${passwordError ? 'border-red-500' : 'border-slate-200'} rounded-2xl focus:ring-2 focus:ring-[#cc0000] outline-none transition-all font-semibold text-center text-slate-800`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showPasswordText ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-2 text-red-600 text-xs font-bold px-4 py-3 bg-red-50 rounded-xl"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Invalid Office Admin Password. Please try again.
                  </motion.div>
                )}

                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setActiveTab('options');
                      setPassword('');
                      setPasswordError(false);
                    }}
                    className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                  >
                    Back
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.015, y: -2 }}
                    whileTap={{ scale: 0.985 }}
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-[#cc0000] text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-red-900/10 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Verifying...' : 'Unlock Admin'}
                    <ArrowRight className="h-5 w-5" />
                  </motion.button>
                </div>
              </motion.form>
            )}

            {activeTab === 'pin' && (
              <motion.form
                key="pin"
                initial={{ opacity: 0, x: 15, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -15, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                onSubmit={handlePinLogin}
                className="space-y-4"
              >
                <div className="text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-2 block">Enter Workshop PIN</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                      type="password"
                      autoFocus
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="••••"
                      className={`w-full pl-12 pr-4 py-4 bg-slate-50 border ${pinError ? 'border-red-500' : 'border-slate-200'} rounded-2xl focus:ring-2 focus:ring-[#cc0000] outline-none transition-all font-mono text-xl tracking-[0.5em] text-center`}
                    />
                  </div>
                </div>

                {pinError && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-2 text-red-600 text-xs font-bold px-4 py-3 bg-red-50 rounded-xl"
                  >
                    <AlertCircle className="h-4 w-4" />
                    Invalid Workshop PIN. Please try again.
                  </motion.div>
                )}

                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setActiveTab('options');
                      setPin('');
                      setPinError(false);
                    }}
                    className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                  >
                    Back
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.015, y: -2 }}
                    whileTap={{ scale: 0.985 }}
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-[#cc0000] text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-red-900/10 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Verifying...' : 'Unlock Portal'}
                    <ArrowRight className="h-5 w-5" />
                  </motion.button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          By continuing, you agree to follow the company internal security protocols.
        </p>
        </div>
      </motion.div>
    </div>
  );
}
