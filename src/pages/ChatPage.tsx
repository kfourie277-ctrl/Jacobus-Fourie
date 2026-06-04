import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Clock, MessageSquare, Search, Sparkles, Filter, X, CheckCircle, AlertTriangle, Mic, MicOff, Loader2, Settings } from 'lucide-react';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ChatMessage } from '../types';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import AudioPlayer from '../components/AudioPlayer';

const QUICK_TEMPLATES = [
  { text: "🔧 Part delivered, starting work now", icon: "🔧", label: "Part Ready" },
  { text: "🚗 Vehicle ready for QC / Road Test", icon: "🚗", label: "QC / Road Test" },
  { text: "⚠️ Urgent: Need customer authorization", icon: "⚠️", label: "Needs Auth" },
  { text: "📋 Checklist completed and initialed", icon: "📋", label: "Checklist Done" },
  { text: "✅ Job fully completed & ready for collection", icon: "✅", label: "Ready to Go" },
];

export default function ChatPage() {
  const { user, isAdmin, isWorkshopSession } = useAuth();
  const myUid = user?.uid || (() => {
    let stored = localStorage.getItem('workshop_local_uid');
    if (!stored) {
      stored = 'local_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('workshop_local_uid', stored);
    }
    return stored;
  })();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFocused, setIsFocused] = useState(true);
  const isFocusedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = useRef<string | null>(null);

  // Custom worker identity state
  const [workerName, setWorkerName] = useState(() => {
    const saved = localStorage.getItem('workshop_worker_name');
    if (saved) return saved;
    if (isAdmin) return 'Office Admin';
    return '';
  });
  const [showNameModal, setShowNameModal] = useState(() => {
    if (isAdmin) return false;
    return !localStorage.getItem('workshop_worker_name');
  });
  const [tempName, setTempName] = useState(() => {
    const saved = localStorage.getItem('workshop_worker_name');
    if (saved) return saved;
    if (isAdmin) return 'Office Admin';
    return '';
  });

  // Voice note recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSendVoice = async (audioUrl: string, durationSec: number) => {
    try {
      await addDoc(collection(db, 'chatMessages'), {
        text: '🎤 Voice Note',
        senderId: myUid,
        senderName: workerName || user?.displayName || 'Staff Member',
        senderEmail: user?.email || 'local@eastrand.co.za',
        senderRole: isAdmin ? 'admin' : 'workshop',
        timestamp: serverTimestamp(),
        audioUrl,
        audioDuration: durationSec
      });
      // Auto-scroll
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 150);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chatMessages');
    }
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser or connection does not support audio recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert Blob to Base64 data URL
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          // Capture duration from state snapshot at end
          handleSendVoice(base64Audio, recordingDuration || 1);
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Failed to access microphone:", err);
      alert("Could not access your microphone. Please verify permission settings.");
    }
  };

  const stopAndSendRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const playNotificationSound = async () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      
      // Auto-resume if suspended (browser security)
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
      console.warn("Audio notification failed:", e);
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      setIsFocused(true);
      isFocusedRef.current = true;
      document.title = "Workshop My AI"; // Reset title
    };
    const handleBlur = () => {
      setIsFocused(false);
      isFocusedRef.current = false;
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'chatMessages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.id !== lastMessageId.current) {
        // If message is new and not from current user and tab not focused
        if (lastMessageId.current !== null && lastMsg.senderId !== myUid && !isFocusedRef.current) {
          playNotificationSound();
          document.title = `(1) New Message - Chat`;
        }
        lastMessageId.current = lastMsg.id;
      } else if (lastMsg) {
        lastMessageId.current = lastMsg.id;
      }

      setMessages(msgs);
      setLoading(false);
      
      // Auto scroll
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }, (error) => {
      console.error("Chat message subscriber error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [myUid]);

  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const messageToSend = customText || newMessage;
    if (!messageToSend.trim()) return;

    try {
      await addDoc(collection(db, 'chatMessages'), {
        text: messageToSend,
        senderId: myUid,
        senderName: workerName || user?.displayName || 'Staff Member',
        senderEmail: user?.email || 'local@eastrand.co.za',
        senderRole: isAdmin ? 'admin' : 'workshop',
        timestamp: serverTimestamp()
      });
      if (!customText) {
        setNewMessage('');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chatMessages');
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-purple-100 text-purple-700 border-purple-200',
      'bg-emerald-100 text-[#008037] border-emerald-200',
      'bg-amber-100 text-amber-700 border-amber-200',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-cyan-100 text-cyan-700 border-cyan-200'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  // Filter messages based on search query
  const filteredMessages = messages.filter((msg) => {
    if (!searchQuery.trim()) return true;
    const queryLower = (searchQuery || '').toLowerCase();
    return (
      (msg.text || '').toLowerCase().includes(queryLower) ||
      (msg.senderName || '').toLowerCase().includes(queryLower)
    );
  });

  return (
    <>
      <div className="max-w-6xl mx-auto h-[82vh] flex flex-col md:grid md:grid-cols-4 bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">
      
      {/* LEFT CHAT PORTION (Columns 1-3) */}
      <div className="md:col-span-3 flex flex-col h-full overflow-hidden border-r border-slate-100">
        
        {/* Chat Headers */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-[#cc0000] text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold font-display">Workshop Chat</h2>
              <p className="text-red-200 text-xs font-semibold uppercase tracking-wider">Internal Team Channel</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold flex items-center justify-end gap-1.5">
              <span>{workerName || user?.displayName || 'Staff Member'}</span>
              <button 
                onClick={() => {
                  setTempName(workerName || user?.displayName || '');
                  setShowNameModal(true);
                }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-red-100 hover:text-white cursor-pointer"
                title="Change display name"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="text-[10px] text-red-200 font-mono italic opacity-90">Staff ID: {user?.uid.slice(0, 8)}</div>
          </div>
        </div>

        {/* Message Container */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 shadow-inner"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cc0000]"></div>
              <span className="text-xs text-slate-400 font-semibold">Syncing safe channel...</span>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50/50">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-slate-500 font-bold text-sm">
                {searchQuery ? "No search results match your criteria" : "No messages in the workshop yet"}
              </p>
              <p className="text-slate-400 text-xs max-w-sm mt-1">
                {searchQuery 
                  ? "Try searching for simpler words or names instead." 
                  : "All workshop staff registered with this clinic will see these messages instantly."}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredMessages.map((msg, idx) => {
                const isMe = msg.senderId === myUid;
                const showDate = idx === 0 || (msg.timestamp && filteredMessages[idx-1].timestamp && 
                  format(msg.timestamp.toDate(), 'P') !== format(filteredMessages[idx-1].timestamp!.toDate(), 'P'));

                return (
                  <React.Fragment key={msg.id}>
                    {showDate && msg.timestamp && (
                      <div className="flex justify-center py-4">
                        <span className="px-3 py-1 bg-slate-200 text-slate-600 text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                          {format(msg.timestamp.toDate(), 'PPPP')}
                        </span>
                      </div>
                    )}
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] flex items-end gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        {!isMe && (
                          <div className={`w-9 h-9 text-xs rounded-xl flex items-center justify-center font-bold font-display shrink-0 shadow-sm border ${getAvatarColor(msg.senderName || 'Staff')}`}>
                            {getInitials(msg.senderName || 'Staff')}
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          {!isMe && (
                            <div className="flex items-center gap-1.5 ml-1">
                              <span className="text-[10px] font-bold text-slate-500">{msg.senderName}</span>
                              {msg.senderRole === 'admin' ? (
                                <span className="px-1.5 py-0.2 bg-red-100 text-[#cc0000] text-[8px] font-black uppercase rounded tracking-wider border border-red-200/80">
                                  Office Admin
                                </span>
                              ) : msg.senderRole === 'workshop' ? (
                                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[8px] font-black uppercase rounded tracking-wider border border-blue-200/80">
                                  Workshop
                                </span>
                              ) : null}
                            </div>
                          )}
                          {isMe && (
                            <div className="flex items-center justify-end gap-1.5 mr-1 text-right">
                              {msg.senderRole === 'admin' ? (
                                <span className="px-1.5 py-0.2 bg-red-100 text-[#cc0000] text-[8px] font-black uppercase rounded tracking-wider border border-red-200/80">
                                  Office Admin
                                </span>
                              ) : msg.senderRole === 'workshop' ? (
                                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[8px] font-black uppercase rounded tracking-wider border border-blue-200/80">
                                  Workshop
                                </span>
                              ) : null}
                              <span className="text-[10px] font-bold text-slate-500">You</span>
                            </div>
                          )}
                          <div className={`p-3.5 rounded-2xl shadow-sm text-sm font-medium leading-relaxed ${
                            isMe 
                              ? 'bg-[#cc0000] text-white rounded-br-none' 
                              : 'bg-white text-slate-800 border border-slate-200/60 rounded-bl-none'
                          }`}>
                            {msg.audioUrl ? (
                              <div className="text-white">
                                <AudioPlayer src={msg.audioUrl} duration={msg.audioDuration} />
                              </div>
                            ) : (
                              msg.text
                            )}
                          </div>
                          <div className={`flex items-center gap-1 text-[9px] text-slate-400 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <Clock className="h-2.5 w-2.5" />
                            {msg.timestamp ? format(msg.timestamp.toDate(), 'p') : 'Sending...'}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </React.Fragment>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Input area */}
        <div className="p-4 bg-white border-t border-slate-100">
          {isRecording ? (
            <div className="flex-1 select-none flex items-center justify-between px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#cc0000]"></span>
                </span>
                <span className="text-[#cc0000] font-black text-sm font-mono tracking-wider">
                  {formatDuration(recordingDuration)}
                </span>
                <span className="text-red-500 text-xs font-semibold ml-2 hidden sm:inline">Recording audio message...</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={cancelRecording}
                  className="px-4 py-2 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition-all font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={stopAndSendRecording}
                  className="px-4 py-2 bg-[#cc0000] hover:bg-red-700 text-white font-bold text-xs rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-red-900/10 cursor-pointer"
                >
                  Send Audio
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => handleSend(e)} className="flex gap-3 items-center">
              <input 
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message to the workshop..."
                className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#cc0000] focus:bg-white transition-all font-medium text-sm text-slate-800 placeholder-slate-400 shadow-inner font-sans"
              />
              <button
                type="button"
                onClick={startRecording}
                className="w-12 h-12 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-600 rounded-2xl flex items-center justify-center hover:text-[#cc0000] transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Record team voice note"
              >
                <Mic className="h-5 w-5" />
              </button>
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="w-12 h-12 bg-[#cc0000] disabled:opacity-40 text-white rounded-2xl flex items-center justify-center hover:bg-[#b30000] transition-all active:scale-95 shadow-lg shadow-red-900/15 cursor-pointer"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* RIGHT UTILITIES PANEL (Column 4 - Desktop Only mostly or scrollable underneath) */}
      <div className="hidden md:flex md:col-span-1 flex-col h-full bg-slate-50/40 p-5 space-y-6 overflow-y-auto">
        
        {/* Search tool block */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Search className="h-3 w-3" /> Search Messages
          </h3>
          <div className="relative">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat history..."
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-1.5 focus:ring-[#cc0000] transition-all"
            />
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2.5 p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Quick instant templates */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-yellow-500" /> Quick Templates
          </h3>
          <p className="text-[10px] text-slate-400 leading-normal">
            Tap a quick trigger below to instantly transmit the message update to the team:
          </p>
          <div className="space-y-2 pt-1">
            {QUICK_TEMPLATES.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  handleSend(undefined, tpl.text);
                  // Ensure auto scroll triggered
                  setTimeout(() => {
                    if (scrollRef.current) {
                      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }
                  }, 120);
                }}
                className="w-full flex items-start gap-2.5 p-2.5 bg-white hover:bg-red-50/50 border border-slate-200/80 hover:border-red-200 rounded-2xl text-left text-xs text-slate-700 font-semibold transition-all active:scale-[0.98] shadow-sm cursor-pointer group hover:shadow"
              >
                <span className="text-sm shrink-0">{tpl.icon}</span>
                <span className="leading-relaxed group-hover:text-[#cc0000] font-sans transition-colors">{tpl.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Informational checklist info */}
        <div className="mt-auto pt-6 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-2">
          <div className="flex gap-2 text-slate-600">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <span>Messages are safely saved in the cloud real-time and visible to all verified staff.</span>
          </div>
        </div>
      </div>

    </div>

      {/* Worker Name Modal */}
      <AnimatePresence>
        {showNameModal && (
          <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl space-y-4 relative"
            >
              {workerName && (
                <button
                  type="button"
                  onClick={() => setShowNameModal(false)}
                  className="absolute right-4 top-4 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-red-50 text-[#cc0000] rounded-2xl flex items-center justify-center mx-auto">
                  <User className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Identify Yourself</h3>
                <p className="text-slate-500 text-xs">
                  Please enter your name, role, or designation before posting updates inside the Workshop Chat.
                </p>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                if (tempName.trim()) {
                  localStorage.setItem('workshop_worker_name', tempName.trim());
                  setWorkerName(tempName.trim());
                  setShowNameModal(false);
                }
              }} className="space-y-4 pt-2">
                <input 
                  type="text"
                  required
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="e.g. Sipho (Technician)"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] focus:bg-white text-sm font-semibold text-slate-800 transition-all text-center"
                />
                
                <button
                  type="submit"
                  className="w-full py-3 bg-[#cc0000] text-white font-bold rounded-xl hover:bg-black transition-all text-xs uppercase tracking-wider shadow-lg shadow-red-900/15 cursor-pointer"
                >
                  Join Chat &amp; Start
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
