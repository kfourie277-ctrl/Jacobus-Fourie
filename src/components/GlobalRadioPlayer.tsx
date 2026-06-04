import React, { useRef } from 'react';
import { useRadio } from '../contexts/RadioContext';
import { 
  Pause, Volume2, VolumeX, Youtube, 
  Minimize2, Maximize2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const getPlayerUrl = (media: { type: string; value: string }) => {
  const base = "https://www.youtube.com/embed";
  if (media.type === 'channel') {
    return `${base}/live_stream?channel=${media.value}&autoplay=1&enablejsapi=1&controls=1&modestbranding=1&rel=0`;
  }
  if (media.type === 'playlist') {
    return `${base}?listType=playlist&list=${media.value}&autoplay=1&enablejsapi=1&controls=1&modestbranding=1&rel=0`;
  }
  if (media.type === 'video') {
    return `${base}/${media.value}?autoplay=1&enablejsapi=1&controls=1&modestbranding=1&rel=0`;
  }
  return `${base}?listType=search&list=${encodeURIComponent(media.value)}&autoplay=1&enablejsapi=1&controls=1&modestbranding=1&rel=0`;
};

export default function GlobalRadioPlayer() {
  const { 
    isPlaying, 
    setIsPlaying, 
    activeMedia, 
    isMuted, 
    setIsMuted, 
    isMinimised, 
    setIsMinimised 
  } = useRadio();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Send youtube iframe js api commands to mute/unmute without reloading the iframe
  React.useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const command = isMuted ? 'mute' : 'unMute';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: [] }),
        '*'
      );
    }
  }, [isMuted]);

  if (!isPlaying) return null;

  return (
    <AnimatePresence>
      <div className="fixed bottom-24 right-6 z-50 pointer-events-none select-none">
        
        {/* Floating Controller Widget - Now DRAGGABLE and ULTRA-COMPACT with SINGLE continuous stream iframe */}
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.05}
          whileDrag={{ scale: 1.02, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)" }}
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.9 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`pointer-events-auto bg-slate-950/95 dark:bg-black/95 border border-slate-800/80 dark:border-red-950/60 text-white backdrop-blur-md shadow-2xl transition-all duration-300 cursor-grab active:cursor-grabbing ${
            isMinimised 
              ? 'rounded-full py-1.5 px-3 flex items-center gap-2.5 w-44' 
              : 'rounded-xl p-2.5 flex flex-col gap-2 w-56'
          }`}
        >
          {/* THE SINGLE PERSISTENT INSTANCE OF IFRAME - PREVENTS AUDIO DUPLICATION OR DISRUPTION */}
          <div className={isMinimised ? "absolute w-0 h-0 opacity-0 pointer-events-none overflow-hidden" : "aspect-video bg-black rounded-lg overflow-hidden border border-slate-900 relative shadow-inner w-full shrink-0"}>
            <iframe
              ref={iframeRef}
              src={getPlayerUrl(activeMedia)}
              className="w-full h-full border-0 absolute inset-0 pointer-events-auto"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              title="Global Radio Player Background Stream"
              tabIndex={-1}
              allowFullScreen={false}
            />
          </div>

          {isMinimised ? (
            /* ================= ULTRA COMPACT MINIMISED PILL STATE ================= */
            <div className="flex items-center justify-between w-full min-w-0">
              {/* Music / Equalizer visualization icon */}
              <div 
                className="flex items-end gap-0.5 h-3 shrink-0 cursor-pointer" 
                onClick={() => setIsMinimised(false)}
                title="Double click or click to expand"
              >
                <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.1s' }} />
                <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.4s' }} />
                <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.2s' }} />
              </div>

              {/* Tiniest radio text info */}
              <div className="flex-1 min-w-0 px-1 select-none" onClick={() => setIsMinimised(false)}>
                <span className="text-[8px] font-bold text-slate-200 block truncate leading-none">
                  {activeMedia.title.split(' ')[0]} {activeMedia.title.split(' ').slice(1).join(' ').substring(0, 10)}
                </span>
                <span className="text-[6px] font-mono font-black text-[#cc0000] tracking-wider block uppercase mt-0.5">ON AIR</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-900 transition-colors cursor-pointer border-0 bg-transparent outline-none"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="h-3 w-3 text-[#cc0000]" /> : <Volume2 className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimised(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-900 transition-colors cursor-pointer border-0 bg-transparent outline-none"
                  title="Expand Player"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying(false)}
                  className="p-1 text-slate-400 hover:text-[#cc0000] rounded-full hover:bg-red-950/20 transition-colors cursor-pointer border-0 bg-transparent outline-none"
                  title="Stop Stream"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            /* ================= ELEVENTH HOUR COMPACT EXPANDED STATE ================= */
            <>
              {/* Header Drag Area */}
              <div className="flex items-center justify-between gap-1.5 border-b border-slate-900/80 pb-1.5 select-none dragging-handle">
                <div className="flex items-center gap-1 min-w-0">
                  <Youtube className="h-3.5 w-3.5 text-[#cc0000] shrink-0 animate-pulse" />
                  <div className="truncate">
                    <span className="text-[6.5px] font-mono font-black text-[#cc0000] tracking-widest block uppercase">Workshop Radio</span>
                    <span className="text-[9.5px] font-bold text-slate-200 block truncate leading-tight mt-0.5">
                      {activeMedia.title}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMinimised(true)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 rounded-md transition-colors cursor-pointer border-0 bg-transparent outline-none"
                    title="Minimize"
                  >
                    <Minimize2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlaying(false)}
                    className="p-1 text-slate-400 hover:text-[#cc0000] hover:bg-red-950/20 rounded-md transition-colors cursor-pointer border-0 bg-transparent outline-none"
                    title="Stop Stream"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Bottom Control Bar */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-900/60 pt-1.5 mt-0.5">
                {/* Micro Equalizer Wave */}
                <div className="flex items-end gap-0.5 h-2.5 px-0.5">
                  <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.1s' }} />
                  <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.4s' }} />
                  <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.2s' }} />
                  <span className="w-0.5 bg-[#cc0000] animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.6s' }} />
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 rounded-md transition-colors cursor-pointer border-0 bg-transparent"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="h-3.5 w-3.5 text-[#cc0000]" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setIsPlaying(false)}
                    className="flex items-center gap-1 px-2 py-0.5 bg-red-950/20 hover:bg-[#cc0000]/90 border border-[#cc0000]/30 hover:border-transparent rounded-lg text-[8px] font-mono font-black uppercase tracking-wider text-red-400 hover:text-white transition-all cursor-pointer border-0 outline-none"
                  >
                    <Pause className="h-2 w-2 fill-current" /> Standby
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
