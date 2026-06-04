import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserSearch, KeyRound, ArrowRight, AlertCircle, FileText, Settings, Sparkles, 
  Car, Clock, CheckCircle2, Info, Phone, MapPin, Wrench, RefreshCw, LogOut 
} from 'lucide-react';
import { auth, db } from '../firebase';
import { JobCard } from '../types';
import Logo from '../components/Logo';

export default function CustomerLogin() {
  const [customerCode, setCustomerCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Real-time live HUD tracking state
  const [activeJobCardId, setActiveJobCardId] = useState<string | null>(() => {
    return localStorage.getItem('customer_active_job_card_id');
  });
  const [liveJobCard, setLiveJobCard] = useState<JobCard | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const navigate = useNavigate();

  // Save active job card id to localStorage whenever it changes
  useEffect(() => {
    if (activeJobCardId) {
      localStorage.setItem('customer_active_job_card_id', activeJobCardId);
    } else {
      localStorage.removeItem('customer_active_job_card_id');
    }
  }, [activeJobCardId]);

  // Listen to Firestore real-time updates for live progress if identified
  useEffect(() => {
    if (!activeJobCardId) {
      setLiveJobCard(null);
      return;
    }

    setIsSubscribing(true);
    const unsubscribe = onSnapshot(
      doc(db, 'jobCards', activeJobCardId), 
      (snapshot) => {
        if (snapshot.exists()) {
          setLiveJobCard({ id: snapshot.id, ...snapshot.data() } as JobCard);
        } else {
          setActiveJobCardId(null);
          setLiveJobCard(null);
        }
        setIsSubscribing(false);
      },
      (err) => {
        console.error("Live lookup subscription error:", err);
        setIsSubscribing(false);
      }
    );

    return () => unsubscribe();
  }, [activeJobCardId]);

  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try to sign in anonymously for future cloud features, but don't block if disabled
      if (!auth.currentUser) {
        try {
          const { signInAnonymously } = await import('firebase/auth');
          await signInAnonymously(auth);
        } catch (anonError) {
          console.warn("Anonymous sign-in skipped (likely disabled):", anonError);
        }
      }

      const codeClean = customerCode.trim().toUpperCase();
      if (!codeClean) {
        setError('Please enter your unique access code.');
        setLoading(false);
        return;
      }

      // 1. Fetch from zero-trust customerCodes map collection
      const codeSnap = await getDoc(doc(db, 'customerCodes', codeClean));
      if (!codeSnap.exists()) {
        setError('Invalid Access Code. Please verify your 6-digit code and try again.');
        setLoading(false);
        return;
      }

      const jobCardId = codeSnap.data().jobCardId;

      // 2. Fetch the actual jobCard using the secure single-doc getDoc
      const jobSnap = await getDoc(doc(db, 'jobCards', jobCardId));
      if (jobSnap.exists()) {
        // Set the active real-time tracking element instead of immediately leaving
        setActiveJobCardId(jobCardId);
      } else {
        setError('Job Card details not found. Please contact the workshop.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { label: 'Check-in', icon: <Info className="h-5 w-5" /> },
    { label: 'In Progress', icon: <Clock className="h-5 w-5" /> },
    { label: 'Awaiting Parts', icon: <AlertCircle className="h-5 w-5" /> },
    { label: 'Quality Control', icon: <CheckCircle2 className="h-5 w-5" /> },
    { label: 'Ready for Collection', icon: <Car className="h-5 w-5" /> }
  ];

  const getCurrentStepIndex = (status: string) => {
    const idx = steps.findIndex(s => s.label === status);
    return idx === -1 ? (status === 'Completed' ? 4 : 0) : idx;
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
      <AnimatePresence mode="wait">
        {!liveJobCard ? (
          // LOGIN FORM VIEW
          <motion.div 
            key="login-form-view"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="w-full max-w-lg mx-auto border border-slate-200/90 bg-white/80 backdrop-blur-md rounded-3xl p-6 md:p-10 shadow-md relative overflow-hidden group hover:border-slate-300 transition-colors duration-450"
          >
            {/* Aesthetic design element */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-red-50 rounded-full blur-2xl opacity-60 pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#cc0000]/5 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            <div className="relative z-10 w-full flex flex-col items-center">
              {/* Dynamic CSS Turbofan Status Loop (Eastrand Engine & Turbo Theme, No Static Icons) */}
              <motion.div 
                 animate={{ y: [0, -8, 0] }}
                 transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                 className="flex justify-center mt-1 mb-6"
              >
                <Logo className="h-11 md:h-12" outlined />
              </motion.div>

              <h2 className="text-2xl md:text-3xl font-black text-slate-900 text-center tracking-tight mb-2">Customer Portal</h2>
              <p className="text-slate-500 text-center text-sm md:text-base font-medium mb-8">
                Enter your unique 6-character access code to view your live vehicle service status.
              </p>

              <form onSubmit={handleAccess} className="space-y-4 w-full">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">
                    Unique Access Code
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      required
                      value={customerCode}
                      onChange={(e) => setCustomerCode(e.target.value)}
                      placeholder="e.g. 6-character code"
                      className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-[#cc0000] focus:border-[#cc0000] rounded-xl outline-none transition-all pl-11 text-sm font-bold tracking-wider text-slate-800 uppercase"
                    />
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">
                    This was sent to you via SMS/Email (e.g. XP4T7A).
                  </p>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3.5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-red-600 text-xs font-medium leading-relaxed"
                  >
                    <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-500 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <motion.button 
                  whileHover={{ scale: 1.015, y: -1, boxShadow: "0 12px 25px -5px rgba(204, 0, 0, 0.45)" }}
                  whileTap={{ scale: 0.985 }}
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-[#cc0000] hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-900/10 transition-all flex items-center justify-center gap-2 silenced-btn disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Settings className="h-4 w-4 animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Track Live Progress</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </motion.button>
              </form>

              <p className="mt-8 text-center text-xs text-slate-400 leading-relaxed">
                Misplaced your code? Contact our workshop office directly at <span className="font-bold text-slate-600">065 925 3612</span> for quick assistance.
              </p>
            </div>
          </motion.div>
        ) : (
          // DYNAMIC LIVE HUD VIEW (THE INTUITIVE LIVE VEHICLE PROGRESS GRAPHIC)
          <motion.div 
            key="live-hud-view"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden relative"
          >
            {/* Real-time sync pulsing indicator */}
            <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-100 text-[10px] font-black uppercase tracking-widest text-[#008037]">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping shrink-0" />
              <span>LIVE TRACKING ACTIVE</span>
            </div>

            {/* Glowing Aura BG */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-[#cc0000]/5 rounded-full blur-3xl -z-10 -translate-x-1/2 -translate-y-1/2" />

            {/* Header portion */}
            <div className="p-8 border-b border-slate-50">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase leading-none block mb-1">REAL-TIME WORKSHOP TUNER</span>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
                {liveJobCard.vehicleDetails?.make || ''} <span className="text-[#cc0000]">{liveJobCard.vehicleDetails?.model || ''}</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 border border-slate-200/50 rounded-xl font-bold uppercase tracking-wider">
                  JC No: #{liveJobCard.jobCardNo}
                </span>
                <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 border border-slate-200/50 rounded-xl font-bold font-mono tracking-widest uppercase">
                  Reg: {liveJobCard.vehicleDetails?.registrationNo || 'N/A'}
                </span>
                {liveJobCard.vehicleDetails?.year && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-xl font-bold">
                    {liveJobCard.vehicleDetails?.year}
                  </span>
                )}
              </div>
            </div>

            {/* Live Progress Graphic Section */}
            <div className="p-8 bg-slate-50/50 border-b border-slate-50">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Repair Lifecycle Progress</h4>
              
              <div className="relative flex justify-between items-center max-w-lg mx-auto">
                {/* Horizontal progress bar backbone */}
                <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 rounded-full" />
                
                {/* Visual filled current progress segment */}
                <motion.div 
                  className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-[#cc0000] rounded-full" 
                  initial={false}
                  animate={{
                    width: `${(getCurrentStepIndex(liveJobCard.status) / (steps.length - 1)) * 90}%`
                  }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                />

                {steps.map((step, idx) => {
                  const currentIdx = getCurrentStepIndex(liveJobCard.status);
                  const isPast = idx < currentIdx;
                  const isCurrent = idx === currentIdx;
                  
                  return (
                    <div key={idx} className="relative z-10 flex flex-col items-center">
                      <motion.div 
                        initial={false}
                        animate={isCurrent ? {
                          scale: [1, 1.15, 1],
                          boxShadow: [
                            "0px 0px 0px 0px rgba(204, 0, 0, 0)",
                            "0px 0px 0px 6px rgba(254, 226, 226, 1)",
                            "0px 0px 0px 0px rgba(204, 0, 0, 0)"
                          ],
                          backgroundColor: '#cc0000',
                          borderColor: '#cc0000',
                        } : isPast ? {
                          scale: 1,
                          backgroundColor: '#cc0000',
                          borderColor: '#cc0000',
                          boxShadow: "0px 0px 0px 0px rgba(0, 0, 0, 0)"
                        } : {
                          scale: 1,
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          boxShadow: "0px 0px 0px 0px rgba(0, 0, 0, 0)"
                        }}
                        transition={isCurrent ? {
                          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                          boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                          default: { duration: 0.4 }
                        } : { duration: 0.4 }}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center border-2 transition-all ${
                          isPast || isCurrent ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        <motion.div
                          animate={isCurrent ? { 
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, -5, 0] 
                          } : { scale: 1, rotate: 0 }}
                          transition={isCurrent ? { repeat: Infinity, duration: 2.5, ease: "easeInOut" } : { duration: 0.3 }}
                        >
                          {step.icon}
                        </motion.div>
                      </motion.div>
                      <span className={`absolute top-13 text-[9px] font-black uppercase tracking-widest text-center whitespace-nowrap ${
                        isCurrent ? 'text-[#cc0000]' : 'text-slate-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="h-10" /> {/* Spacer to allow absolute steps layout room */}
            </div>

            {/* Inner Dashboard Cards */}
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                
                {/* Live Info card (Full Width) */}
                <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-2xl space-y-4">
                  <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                    <Info className="h-4.5 w-4.5 text-[#cc0000]" /> Vehicle Details
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold text-slate-700">
                    <div className="flex justify-between sm:flex-col sm:items-start p-3 bg-white rounded-xl border border-slate-200/40">
                      <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Owner</span>
                      <span className="text-slate-800 text-sm font-black pt-1">{liveJobCard.clientInfo?.firstName || ''} {liveJobCard.clientInfo?.surname || ''}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:items-start p-3 bg-white rounded-xl border border-slate-200/40">
                      <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Odometer In</span>
                      <span className="text-slate-800 text-sm font-black pt-1">
                        {liveJobCard.vehicleDetails?.odometerIn 
                          ? (isNaN(Number(liveJobCard.vehicleDetails?.odometerIn)) 
                              ? liveJobCard.vehicleDetails?.odometerIn 
                              : `${Number(liveJobCard.vehicleDetails?.odometerIn).toLocaleString()} km`)
                          : 'Pending'}
                      </span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:items-start p-3 bg-white rounded-xl border border-slate-200/40">
                      <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Fuel Level</span>
                      <span className="capitalize text-slate-800 text-sm font-black pt-1">{liveJobCard.condition?.fuelLevel || 'Not noted'}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Buttons for simplified customer inspection videos experience */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  onClick={() => navigate(`/customer/view/${liveJobCard.id}`)}
                  className="flex-1 py-4 bg-[#cc0000] hover:bg-red-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-red-900/10 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                >
                  <Sparkles className="h-4.5 w-4.5" />
                  <span>Watch Check-In & Check-Out Videos</span>
                  <ArrowRight className="h-4.5 w-4.5" />
                </button>
                <button 
                  onClick={() => {
                    setActiveJobCardId(null);
                    setCustomerCode('');
                  }}
                  className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 border border-slate-200/50"
                >
                  <LogOut className="h-4.5 w-4.5" />
                  <span>Disconnect</span>
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
