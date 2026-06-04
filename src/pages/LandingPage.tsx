import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ClipboardList, UserSearch, MessageSquare, ShieldCheck, Clock as ClockIcon, Video } from 'lucide-react';
import Logo from '../components/Logo';

export default function LandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    show: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center relative w-full overflow-hidden">
      {/* Decorative dynamic background blob */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#cc0000]/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: -20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-10 flex flex-col items-center max-w-xl mx-auto w-full px-4"
      >
        <div className="w-full max-w-lg mx-auto bg-white/60 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden group hover:shadow-[0_8px_30px_rgba(204,0,0,0.08)] transition-all duration-500">
          <div className="flex flex-col items-center relative z-10">
            <div className="mb-8 mt-2">
              <Logo className="h-12 md:h-14 drop-shadow-sm" />
            </div>
            
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight leading-tight mb-4">
              Vehicle Service <br className="hidden sm:block" /> Management
            </h1>
            
            <p className="text-sm md:text-base text-slate-500 max-w-sm font-medium leading-relaxed mb-8">
              Streamlined job cards, real-time tracking, and seamless updates for Eastrand Engine & Turbo.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants as any}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4"
      >
        <Link to="/admin-login" className="block outline-none focus:outline-none focus:ring-4 focus:ring-red-500/30 rounded-[2rem]">
          <motion.div 
            variants={cardVariants as any}
            whileHover={{ 
              y: -5, 
              scale: 1.02,
              boxShadow: "0 20px 40px -15px rgba(204, 0, 0, 0.4)"
            }}
            whileTap={{ scale: 0.98 }}
            className="p-8 md:p-10 bg-[#cc0000] text-white rounded-[2rem] shadow-xl border border-[#cc0000] flex flex-col items-center text-center gap-5 cursor-pointer transition-all duration-300 min-h-[240px] justify-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-10 -mt-10" />
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-2xl relative z-10">
              <ShieldCheck className="h-10 w-10 md:h-12 md:w-12 text-white" />
            </div>
            <div className="relative z-10">
              <div className="text-xl md:text-2xl font-black tracking-tight mb-2">Staff Portal</div>
              <p className="text-red-100/90 text-sm font-medium leading-relaxed">
                Access advanced workshop tools, dispatch job status, and manage active operations.
              </p>
            </div>
          </motion.div>
        </Link>

        <Link to="/customer-login" className="block outline-none focus:outline-none focus:ring-4 focus:ring-slate-300/50 rounded-[2rem]">
          <motion.div 
            variants={cardVariants as any}
            whileHover={{ 
              y: -5, 
              scale: 1.02,
              boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.1)"
            }}
            whileTap={{ scale: 0.98 }}
            className="p-8 md:p-10 bg-white text-slate-800 border-2 border-slate-100 hover:border-slate-200 rounded-[2rem] shadow-xl flex flex-col items-center text-center gap-5 cursor-pointer transition-all duration-300 min-h-[240px] justify-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-stone-50 rounded-bl-full -mr-10 -mt-10" />
            <div className="p-4 bg-red-50 rounded-2xl relative z-10">
              <UserSearch className="h-10 w-10 md:h-12 md:w-12 text-[#cc0000]" />
            </div>
            <div className="relative z-10">
              <div className="text-xl md:text-2xl font-black tracking-tight mb-2 text-[#cc0000]">Customer Portal</div>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Unlock your unique code to monitor current repairs and view diagnostic media.
              </p>
            </div>
          </motion.div>
        </Link>
      </motion.div>

    </div>
  );
}
