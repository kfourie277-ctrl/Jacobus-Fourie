import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Phone, X, Check, ArrowRight, RefreshCw, Send, Smartphone, Clock, History, MessageSquare } from 'lucide-react';
import { JobCard } from '../types';

interface SimulatedNotification {
  id: string;
  timestamp: Date;
  jobCardNo: string;
  clientName: string;
  email: string;
  phone: string;
  vehicle: string;
  reg: string;
  customerCode: string;
  smsBody: string;
  whatsappBody: string;
  emailSubject: string;
  emailBody: string;
  isNewCreation?: boolean;
}

export function triggerNotificationSimulation(jobCard: JobCard) {
  const event = new CustomEvent('simulate-notification', { detail: jobCard });
  window.dispatchEvent(event);
}

export default function NotificationSimulator() {
  const [activeNotification, setActiveNotification] = useState<SimulatedNotification | null>(null);
  const [history, setHistory] = useState<SimulatedNotification[]>(() => {
    try {
      const saved = localStorage.getItem('simulated_notifications_history');
      if (saved) {
        return JSON.parse(saved).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      }
    } catch (e) {
      console.error('Failed to load notification history:', e);
    }
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [tab, setTab] = useState<'sms' | 'whatsapp' | 'email'>('whatsapp');
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Queueing, 2: Gateway routing, 3: Delivered

  // Listen to custom notification trigger event
  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const jobCard = (e as CustomEvent).detail as JobCard;
      if (!jobCard) return;

      const clientName = `${jobCard.clientInfo?.firstName || 'Valued'} ${jobCard.clientInfo?.surname || 'Customer'}`.trim();
      const vehicle = `${jobCard.vehicleDetails?.color || ''} ${jobCard.vehicleDetails?.make || ''} ${jobCard.vehicleDetails?.model || 'Vehicle'}`.trim();
      const reg = jobCard.vehicleDetails?.registrationNo || 'N/A';
      const cost = jobCard.workDetails?.authorisedCost || jobCard.workDetails?.estimatedCost || 0;
      const formattedCost = cost > 0 ? `R${cost.toLocaleString()}` : 'TBD';
      
      const isCreation = (jobCard as any).isNewCreation || false;
      const isCompleted = jobCard.status === 'Completed';

      const newNotif: SimulatedNotification = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        jobCardNo: jobCard.jobCardNo,
        clientName,
        email: jobCard.clientInfo?.email || 'N/A',
        phone: isCreation ? '0834696688' : (jobCard.clientInfo?.cell || jobCard.clientInfo?.tel || 'N/A'),
        vehicle,
        reg,
        customerCode: jobCard.customerCode,
        isNewCreation: isCreation,
        smsBody: isCreation
          ? `WS-SMS: Welcome ${clientName}, your ${vehicle} is checked in at Eastrand Engine & Turbo under JC ${jobCard.jobCardNo}. Use secure Access Code: ${jobCard.customerCode} to track live updates at ${window.location.origin}/customer-login`
          : isCompleted
            ? `WS-SMS: Dear ${clientName}, your ${vehicle} servicing and repairs are now 100% COMPLETED. Final Invoice: ${formattedCost}. Secure customer access code: ${jobCard.customerCode}`
            : `WS-SMS: Dear ${clientName}, your ${vehicle} (Reg: ${reg}) is READY FOR COLLECTION. Present your Access Code: ${jobCard.customerCode} upon collection. Thank you!`,
        whatsappBody: isCreation
          ? `Dear *${clientName}*, welcome to Eastrand Engine & Turbo! 🛠️ Your *${vehicle}* (Reg: ${reg}) has been checked in under Job Card *${jobCard.jobCardNo}*.\n\nYou can track live progress and view active inspection videos using your secure customer login code:\n👉 Access Code: *${jobCard.customerCode}*\n\nTrack here: ${window.location.origin}/customer-login\n\nThank you for choosing us!`
          : `Dear *${clientName}*, we are pleased to inform you that your *${vehicle}* (Reg: ${reg}) under Job Card *${jobCard.jobCardNo}* is now *READY FOR COLLECTION*! 🎉\n\nPlease use your secure customer login code to view details & handover sheets:\n👉 Access Code: *${jobCard.customerCode}*\n\nTrack here: ${window.location.origin}/customer-login\n\nWe look forward to handing over your vehicle!\n\nBest regards,\nEastrand Engine & Turbo Team`,
        emailSubject: isCreation
          ? `Vehicle Checked In Successfully - ${vehicle} (${reg})`
          : isCompleted
            ? `Job Completed & Final Invoice Prepared - ${vehicle} (${reg})`
            : `Vehicle Ready for Collection - ${vehicle} (${reg})`,
        emailBody: isCreation
          ? `Dear ${clientName},\n\nWelcome to Eastrand Engine & Turbo!\n\nWe would like to confirm that your ${vehicle} (Registration: ${reg}) has been successfully checked in at our workshop under Job Card ${jobCard.jobCardNo}.\n\nTo view real-time status, checklist updates, and inspection recordings, please use your private secure customer login code:\n👉 Access Code: ${jobCard.customerCode}\n\nLogin page:\n🔗 ${window.location.origin}/customer-login\n\nIf you have any questions, feel free to respond to this email.\n\nBest regards,\nWorkshop Management Team`
          : isCompleted
            ? `Dear ${clientName},\n\nWe are pleased to inform you that your ${vehicle} (Registration: ${reg}) servicing and repairs are now 100% Completed.\n\nOur certified master technician has quality checked all aspects and approved it for immediate handover.\n\nInvoice Summary:\n• Job Card: ${jobCard.jobCardNo}\n• Final Authorized Cost: ${formattedCost}\n• Status: Full Quality Check Approved\n\nPlease find your secure customer access code to view the final invoice breakdown online:\n👉 Customer Code: ${jobCard.customerCode}\n\nOur workshop closes at 17:30 daily. Thank you for your business!\n\nBest regards,\nEastrand Engine & Turbo Team`
            : `Dear ${clientName},\n\nWe are pleased to inform you that your ${vehicle} (Registration: ${reg}) is now fully repaired, tested, and Ready for Collection.\n\nSummary:\n• Job Card: ${jobCard.jobCardNo}\n• Work Completed: ${jobCard.workDetails?.workRequested || 'Scheduled Service'}\n\nTo view real-time status and detailed inspection checklist reports, please use your private Access Code:\n👉 Access Code: ${jobCard.customerCode}\n\nFeel free to contact us if you need directions or have any questions.\n\nBest regards,\nWorkshop Management Team`
      };

      setActiveNotification(newNotif);
      setStep(1);
      setTab('whatsapp'); // Enable whatsapp as primary view

      // Trigger automatic server-side WhatsApp dispatch
      fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: isCreation ? '0834696688' : (jobCard.clientInfo?.cell || jobCard.clientInfo?.tel || ''),
          message: newNotif.whatsappBody,
          clientName,
          jobCardNo: jobCard.jobCardNo,
          type: isCreation ? 'creation' : 'collection'
        })
      })
      .then(r => r.json())
      .then(d => {
        console.log("[AUTOMATED_DISPATCH] API dispatch result:", d);
      })
      .catch(err => {
        console.error("[AUTOMATED_DISPATCH_FAILED] Server error posting WhatsApp:", err);
      });

      // Update history
      setHistory(prev => {
        const newHistory = [newNotif, ...prev].slice(0, 15);
        localStorage.setItem('simulated_notifications_history', JSON.stringify(newHistory));
        return newHistory;
      });

      // Simple slide transition simulation
      setTimeout(() => {
        setStep(2);
        setTimeout(() => {
          setStep(3);
        }, 1500);
      }, 1200);
    };

    const handleCustomTrigger = (e: Event) => {
      const customNotif = (e as CustomEvent).detail as SimulatedNotification;
      if (!customNotif) return;

      const fullCustomNotif = {
        ...customNotif,
        whatsappBody: customNotif.whatsappBody || `Attention ${customNotif.clientName}: Update regarding Job Card ${customNotif.jobCardNo}. Code: ${customNotif.customerCode}`
      };

      setActiveNotification(fullCustomNotif);
      setStep(1);
      setTab('whatsapp');

      // Trigger server-side dispatch
      fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: fullCustomNotif.phone,
          message: fullCustomNotif.whatsappBody,
          clientName: fullCustomNotif.clientName,
          jobCardNo: fullCustomNotif.jobCardNo,
          type: 'custom'
        })
      }).catch(err => console.error("Custom dispatch server fail:", err));

      // Update history
      setHistory(prev => {
        const newHistory = [fullCustomNotif, ...prev].slice(0, 15);
        localStorage.setItem('simulated_notifications_history', JSON.stringify(newHistory));
        return newHistory;
      });

      // Simple slide transition simulation
      setTimeout(() => {
        setStep(2);
        setTimeout(() => {
          setStep(3);
        }, 1500);
      }, 1200);
    };

    window.addEventListener('simulate-notification', handleTrigger);
    window.addEventListener('simulate-notification-custom', handleCustomTrigger);
    return () => {
      window.removeEventListener('simulate-notification', handleTrigger);
      window.removeEventListener('simulate-notification-custom', handleCustomTrigger);
    };
  }, []);

  const handleDismiss = () => {
    setActiveNotification(null);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('simulated_notifications_history');
  };

  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin/');

  if (!isAdminPage) return null;

  // Render a clean South Africans E.164 wa.me prefilled click-to-transmit fallback
  const getWhatsAppWebUrl = () => {
    if (!activeNotification) return '#';
    const rawNumber = activeNotification.phone || '';
    const digits = rawNumber.replace(/\D/g, '');
    let e164 = digits;
    if (digits.startsWith('0') && digits.length === 10) {
      e164 = '27' + digits.substring(1);
    }
    return `https://wa.me/${e164}?text=${encodeURIComponent(activeNotification.whatsappBody)}`;
  };

  return (
    <>
      {/* Simulation Banner & Viewer Widget */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                <h3 className="font-extrabold text-xs uppercase tracking-widest text-emerald-400">Customer WA/SMS Automated Gateway</h3>
              </div>
              <button 
                onClick={handleDismiss} 
                className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Delivery Progress Flow */}
            <div className="mb-5 bg-slate-950 p-3.5 rounded-2xl border border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gateway status</span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  step === 1 ? 'bg-amber-500/10 text-amber-500' :
                  step === 2 ? 'bg-blue-500/10 text-blue-500' :
                  'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {step === 1 ? 'Queueing' : step === 2 ? 'Routing' : 'Live / Simulated Dispatched'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                  <motion.div 
                    className="absolute top-0 bottom-0 left-0 bg-emerald-500 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ 
                      width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' 
                    }}
                    transition={{ ease: 'easeInOut', duration: 0.5 }}
                  />
                </div>
                {step < 3 ? (
                  <RefreshCw className="h-3 w-3 text-emerald-400 animate-spin flex-shrink-0" />
                ) : (
                  <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed font-semibold">
                {step === 1 && `Preparing communication package with Access Code *${activeNotification.customerCode}*...`}
                {step === 2 && `Attempting automated live API dispatch over Twilio service routing ...`}
                {step === 3 && `Dispatched! Automatic text logged on server for recipient: ${activeNotification.clientName} (${activeNotification.phone})`}
              </p>
            </div>

            {/* Tabs for channels */}
            <div className="flex bg-slate-950 p-1 rounded-xl mb-4 border border-slate-800/50">
              <button
                onClick={() => setTab('whatsapp')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === 'whatsapp' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                WhatsApp
              </button>
              <button
                onClick={() => setTab('sms')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === 'sms' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5 text-blue-400" />
                SMS Mobile
              </button>
              <button
                onClick={() => setTab('email')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === 'email' ? 'bg-[#cc0000]/20 text-[#ff4444]' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mail className="h-3.5 w-3.5 text-[#cc0000]" />
                Email
              </button>
            </div>

            {/* Simulated Smartphone Frame / Email Frame */}
            <div className="relative overflow-hidden bg-slate-950 rounded-2xl border border-slate-800 h-52 flex flex-col">
              {tab === 'whatsapp' ? (
                /* WHATSAPP INTERFACE */
                <div className="p-3.5 flex flex-col h-full bg-[#0b141a] font-sans text-xs">
                  <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                      {activeNotification.clientName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-[11px] text-white leading-tight">{activeNotification.clientName}</h4>
                      <p className="text-[8px] text-emerald-400">online</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-1">
                    <div className="self-end ml-auto max-w-[85%] bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-sm px-3.5 py-2 leading-relaxed shadow-sm text-[11px] relative">
                      <p className="whitespace-pre-wrap">{activeNotification.whatsappBody}</p>
                      <div className="text-[8px] text-neutral-300 text-right mt-1 font-semibold flex items-center justify-end gap-1">
                        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-sky-400">✓✓</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[9px] text-[#8696a0] font-medium text-center italic">
                    WhatsApp recipient: {activeNotification.phone}
                  </div>
                </div>
              ) : tab === 'sms' ? (
                /* SMS INTERFACE */
                <div className="p-3.5 flex flex-col h-full bg-slate-950 font-sans text-xs">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-2.5 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                    <span>Sender: ABC-WORKSHOP</span>
                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1">
                    <div className="self-start max-w-[85%] bg-slate-800 text-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed shadow-md">
                      <p className="font-semibold text-[11px] mb-1 text-slate-400 uppercase tracking-widest text-[9px]">SMS GATEWAY SIMULATION</p>
                      {activeNotification.smsBody}
                    </div>
                  </div>
                  <div className="mt-2 text-[9px] text-slate-500 font-medium text-center italic">
                    To: {activeNotification.phone}
                  </div>
                </div>
              ) : (
                /* EMAIL INTERFACE */
                <div className="p-3.5 flex flex-col h-full bg-slate-950 font-sans text-xs">
                  <div className="border-b border-white/5 pb-2 mb-2.5 space-y-1 text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <div><span className="font-bold text-slate-500">From:</span> service@abcworkshop.co.za</div>
                      <div className="text-[9px] text-slate-500">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div><span className="font-bold text-slate-500">To:</span> {activeNotification.email}</div>
                    <div><span className="font-bold text-slate-500">Subject:</span> {activeNotification.emailSubject}</div>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-slate-900 border border-slate-800 p-2 text-[11px] leading-relaxed rounded-xl text-slate-300 font-serif whitespace-pre-line">
                    {activeNotification.emailBody}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Helper Trigger for testing */}
            <div className="mt-4 flex items-center justify-between gap-3 text-[10px]">
              <button 
                onClick={() => {
                  setStep(1);
                  setTimeout(() => setStep(2), 1200);
                  setTimeout(() => setStep(3), 2700);
                }}
                className="flex items-center gap-1.5 text-emerald-400 hover:text-white transition-colors uppercase font-black tracking-widest"
              >
                <Send className="h-3 w-3" /> Resend Simulation
              </button>

              <a 
                href={getWhatsAppWebUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold tracking-wider uppercase rounded-xl transition-all shadow-md"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Manual Web WA Send
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Panel Button to view past Simulation Logs */}
      <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={() => setShowHistory(prev => !prev)}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full border border-slate-800 shadow-xl text-xs font-black uppercase tracking-wider transition-all"
        >
          <History className="h-4 w-4 text-[#cc0000]" />
          <span>Simulation Logs {history.length > 0 && `(${history.length})`}</span>
        </button>

        {/* History Modal / Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: -10 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="absolute bottom-full left-0 mb-2 w-80 max-h-96 overflow-y-auto bg-slate-950 border border-slate-800 text-white rounded-2xl shadow-2xl p-4 flex flex-col font-sans"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#cc0000]">Simulation Logs</span>
                {history.length > 0 && (
                  <button 
                    onClick={clearHistory}
                    className="text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  <span className="block text-2xl mb-1">📭</span>
                  No notifications simulated yet. Update a Job Card to "Ready for Collection" to trigger!
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((h, i) => (
                    <div 
                      key={h.id} 
                      onClick={() => {
                        setActiveNotification(h);
                        setStep(3);
                        setTab('sms');
                      }}
                      className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl hover:bg-[#cc0000]/10 hover:border-[#cc0000]/30 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[9px] text-slate-400 mb-1 font-bold">
                        <span>JC: {h.jobCardNo}</span>
                        <span>{h.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="font-black text-[10px] text-slate-100 uppercase tracking-wide truncate mb-1">{h.clientName}</p>
                      <p className="text-[9px] text-slate-500 truncate">{h.vehicle}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
