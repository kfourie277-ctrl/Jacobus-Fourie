import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Car, Clock, CheckCircle2, AlertCircle, MapPin, Phone, Info, Video, Box, ArrowLeft } from 'lucide-react';
import { db } from '../firebase';
import { JobCard, Part, Recording } from '../types';
import Logo from '../components/Logo';

export default function CustomerView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [jobCard, setJobCard] = useState<JobCard | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const unsubscribeCard = onSnapshot(doc(db, 'jobCards', id), (snapshot) => {
        if (snapshot.exists()) {
          setJobCard({ id: snapshot.id, ...snapshot.data() } as JobCard);
        }
        setLoading(false);
      }, (error) => {
        console.error("Customer job card snapshot listener error:", error);
        setLoading(false);
      });

      const partsQuery = query(collection(db, 'parts'), where('jobCardId', '==', id));
      const unsubscribeParts = onSnapshot(partsQuery, (snapshot) => {
        setParts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Part)));
      }, (error) => {
        console.error("Customer parts snapshot listener error:", error);
      });

      return () => {
        unsubscribeCard();
        unsubscribeParts();
      };
    }
  }, [id]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#cc0000]"></div>
      <p className="font-bold text-slate-400 animate-pulse">Retrieving Vehicle Status...</p>
    </div>
  );

  if (!jobCard) return (
    <div className="text-center py-24">
      <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-slate-900">Information Not Found</h2>
      <p className="text-slate-500">We couldn't find a job card with this ID. Please contact us for support.</p>
    </div>
  );

  const steps = [
    { label: 'Check-in', icon: <Info /> },
    { label: 'In Progress', icon: <Clock /> },
    { label: 'Awaiting Parts', icon: <AlertCircle /> },
    { label: 'Quality Control', icon: <CheckCircle2 /> },
    { label: 'Ready for Collection', icon: <Car /> },
    { label: 'Completed', icon: <CheckCircle2 /> }
  ];

  const currentStepIdx = steps.findIndex(s => s.label === jobCard.status);

  const checkInRecordings = (jobCard.recordings || []).filter((rec: any) => !rec.type || rec.type === 'check-in');
  const checkOutRecordings = (jobCard.recordings || []).filter((rec: any) => rec.type === 'check-out');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-start">
        <button 
          onClick={() => navigate('/customer-login')}
          className="inline-flex items-center gap-2 text-[#cc0000] hover:text-white font-black text-xs uppercase tracking-wider transition-all group px-5 py-3 bg-red-50 hover:bg-[#cc0000] rounded-2xl border border-red-100 flex items-center shadow-md cursor-pointer"
        >
          <ArrowLeft className="h-4.5 w-4.5 transition-transform group-hover:-translate-x-1" />
          <span>Back to Portal Login</span>
        </button>
      </div>

      <div className="text-center space-y-4">
        <Logo className="h-12 w-12 mx-auto" iconOnly />
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vehicle Status Update</h1>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-[#cc0000] rounded-full font-bold text-sm">
          Job No: <span className="font-black text-slate-900">#{jobCard.jobCardNo}</span>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
           <Logo className="h-48 w-48" iconOnly />
        </div>
        
        <div className="relative z-10 space-y-12">
          {/* Prominent Vehicle Header Section */}
          <div className="p-6 md:p-8 bg-slate-50 border border-slate-200/60 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-sm animate-fade-in">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#cc0000]/5 rounded-full blur-3xl -z-10" />
            <div className="flex items-center gap-4.5">
              <div className="w-14 h-14 bg-[#cc0000]/10 border border-[#cc0000]/20 text-[#cc0000] rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <Car className="h-8 w-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Tracked Vehicle</div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none">
                  {jobCard.vehicleDetails?.make || ''} <span className="text-[#cc0000]">{jobCard.vehicleDetails?.model || ''}</span>
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-slate-500">
                  {jobCard.vehicleDetails?.year && (
                    <span className="px-2 py-0.5 bg-slate-200/50 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200/10">
                      {jobCard.vehicleDetails?.year}
                    </span>
                  )}
                  {jobCard.vehicleDetails?.color && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-200/50 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200/10">
                      <span 
                        className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block" 
                        style={{ backgroundColor: (jobCard.vehicleDetails?.color || '').toLowerCase() }} 
                      />
                      <span>{jobCard.vehicleDetails?.color}</span>
                    </span>
                  )}
                  {jobCard.vehicleDetails?.transmission && (
                    <span className="px-2 py-0.5 bg-slate-200/50 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200/10">
                      {jobCard.vehicleDetails?.transmission}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0 self-start md:self-center">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none md:pr-1">Registration No</div>
              <div className="inline-flex items-center gap-2.5 px-4.5 py-2.5 bg-white border-2 border-slate-300 rounded-2xl font-mono text-base font-bold tracking-widest text-slate-800 shadow-sm ring-1 ring-slate-100 select-all">
                <span className="text-[9px] font-sans font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-md leading-none tracking-normal">GP</span>
                <span className="uppercase text-slate-900 font-extrabold">{jobCard.vehicleDetails?.registrationNo || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {steps.filter(s => s.label !== 'Completed').map((step, idx) => {
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              
              return (
                <div key={idx} className="flex flex-col items-center text-center gap-3">
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
                    } : isPast ? {
                      scale: 1,
                      backgroundColor: '#cc0000',
                      boxShadow: "0px 0px 0px 0px rgba(0, 0, 0, 0)"
                    } : {
                      scale: 1,
                      backgroundColor: '#f1f5f9',
                      boxShadow: "0px 0px 0px 0px rgba(0, 0, 0, 0)"
                    }}
                    transition={isCurrent ? {
                      scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                      boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                      default: { duration: 0.4 }
                    } : { duration: 0.4 }}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all ${
                      isPast ? 'text-white border-[#cc0000]' : 
                      isCurrent ? 'text-white border-[#cc0000]' : 
                      'text-slate-300 border-transparent'
                    }`}
                  >
                    <motion.div
                      animate={isCurrent ? { 
                        scale: [1, 1.1, 1],
                        rotate: [0, 5, -5, 0] 
                      } : { scale: 1, rotate: 0 }}
                      transition={isCurrent ? { repeat: Infinity, duration: 2.5, ease: "easeInOut" } : { duration: 0.3 }}
                    >
                      {React.cloneElement(step.icon as React.ReactElement, { className: "h-6 w-6" } as any)}
                    </motion.div>
                  </motion.div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    isCurrent ? 'text-[#cc0000]' : 'text-slate-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-8 bg-[#cc0000] rounded-2xl text-white shadow-lg shadow-red-900/30">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="space-y-1 text-center md:text-left">
                <div className="text-red-200 text-xs font-bold uppercase tracking-[0.2em]">Current Status</div>
                <div className="text-3xl font-black">{jobCard.status}</div>
              </div>
              <div className="h-12 w-px bg-red-800 hidden md:block" />
              <div className="text-center md:text-right">
                <div className="text-red-200 text-xs font-bold uppercase tracking-[0.2em] mb-1">Odometer & Fuel</div>
                <div className="text-xl font-bold">
                  {jobCard.vehicleDetails?.odometerIn 
                    ? (isNaN(Number(jobCard.vehicleDetails.odometerIn)) 
                        ? jobCard.vehicleDetails.odometerIn 
                        : `${Number(jobCard.vehicleDetails.odometerIn).toLocaleString()} km`)
                    : 'Not recorded'}
                </div>
                <div className="text-xs font-semibold text-red-100">{jobCard.vehicleDetails?.fuelType || 'Petrol'} / {jobCard.vehicleDetails?.driveType || '4x2'}</div>
              </div>
            </div>
          </div>

          {/* Extraneous details, parts, and notes removed to focus purely on progress and inspection videos */}

          {jobCard.recordings && jobCard.recordings.length > 0 && (
            <div className="space-y-10 pt-8 border-t border-slate-100">
              <div className="text-center md:text-left">
                <h3 className="text-2xl font-black text-slate-900 flex items-center justify-center md:justify-start gap-2">
                  <Video className="h-7 w-7 text-[#cc0000]" />
                  <span>Quality Assurance & Vehicle Inspection Videos</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl font-medium">
                  We record comprehensive vehicle condition reports at arrival and vehicle completion to guarantee 100% service transparency and security.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* CHECK-IN STAGE */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                      Stage 1: Vehicle Check-In Inspection
                    </h4>
                  </div>
                  
                  {checkInRecordings.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs font-semibold text-slate-400 italic">
                      No check-in inspection video registered for this job card.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {checkInRecordings.map((rec: any, idx) => {
                        const url = typeof rec === 'string' ? rec : rec.url;
                        const thumbnail = typeof rec === 'string' ? null : rec.thumbnail;

                        return (
                          <div key={idx} className="space-y-3 bg-white p-5 rounded-3xl border border-slate-200/60 shadow-lg transition-transform hover:scale-[1.01]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                                Check-In Part {idx + 1}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 tracking-wider">INCOMING REPORT</span>
                            </div>

                            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-300/40">
                              <video 
                                key={url}
                                poster={thumbnail || undefined}
                                className="w-full h-full object-contain" 
                                controls 
                                playsInline
                                preload="auto"
                              >
                                <source src={url} type="video/webm" />
                                <source src={url} type="video/mp4" />
                                Your browser does not support the video tag.
                              </video>
                            </div>

                            {rec.description ? (
                              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 font-medium leading-relaxed">
                                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Inspector Observations:</span>
                                <span className="italic">"{rec.description}"</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* CHECK-OUT STAGE */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                      Stage 2: Vehicle Handover & Check-Out
                    </h4>
                  </div>

                  {checkOutRecordings.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs font-semibold text-slate-400 italic">
                      No check-out handover video registered yet. Upon vehicle completion and collection, the handover video will show here.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {checkOutRecordings.map((rec: any, idx) => {
                        const url = typeof rec === 'string' ? rec : rec.url;
                        const thumbnail = typeof rec === 'string' ? null : rec.thumbnail;

                        return (
                          <div key={idx} className="space-y-3 bg-white p-5 rounded-3xl border border-slate-200/60 shadow-lg transition-transform hover:scale-[1.01]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-green-700 uppercase tracking-widest bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                Handover Part {idx + 1}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 tracking-wider">OUTGOING REPORT</span>
                            </div>

                            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-300/40">
                              <video 
                                key={url}
                                poster={thumbnail || undefined}
                                className="w-full h-full object-contain" 
                                controls 
                                playsInline
                                preload="auto"
                              >
                                <source src={url} type="video/webm" />
                                <source src={url} type="video/mp4" />
                                Your browser does not support the video tag.
                              </video>
                            </div>

                            {rec.description ? (
                              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 font-medium leading-relaxed">
                                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Inspector Observations:</span>
                                <span className="italic">"{rec.description}"</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 p-6 bg-white border border-slate-100 rounded-2xl flex items-center gap-4">
           <div className="w-12 h-12 bg-red-50 text-[#cc0000] rounded-full flex items-center justify-center">
              <Phone className="h-6 w-6" />
           </div>
           <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Office Contact</div>
              <div className="font-bold text-slate-800">065 925 3612</div>
           </div>
        </div>
        <div className="flex-1 p-6 bg-white border border-slate-100 rounded-2xl flex items-center gap-4">
           <div className="w-12 h-12 bg-red-50 text-[#cc0000] rounded-full flex items-center justify-center">
              <MapPin className="h-6 w-6" />
           </div>
           <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Location</div>
              <div className="font-bold text-slate-800">Spartan, Kempton Park</div>
           </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <button 
          onClick={() => navigate('/customer-login')}
          className="w-full max-w-md py-4 bg-[#cc0000] hover:bg-red-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-lg shadow-red-900/10 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] hover:shadow-xl cursor-pointer"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
          <span>Back to Tracker Portal Login</span>
        </button>
      </div>
    </div>
  );
}
