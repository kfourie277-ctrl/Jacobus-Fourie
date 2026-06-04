import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  Car, 
  User, 
  ClipboardList, 
  CheckCircle2, 
  X, 
  FileText, 
  Printer, 
  Share2, 
  Trash2, 
  Edit2, 
  Sparkles, 
  Calendar, 
  Percent, 
  Check, 
  Loader2, 
  AlertCircle, 
  Copy, 
  MessageSquare,
  Wrench,
  BadgeAlert,
  Save,
  Download
} from 'lucide-react';
import { db } from '../firebase';
import { Quote, QuoteItem, JobCard } from '../types';
import { format, addDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import Logo from '../components/Logo';

export default function QuotesPage() {
  const { user, isAdmin, isWorkshopSession } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<Partial<Quote> | null>(null);
  const [editorItems, setEditorItems] = useState<QuoteItem[]>([]);
  const [selectedJobCardId, setSelectedJobCardId] = useState<string>('');
  
  // Print / View State
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null);
  
  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string>('');

  // Auto-generate random quote number
  const generateQuoteNo = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `QT-${year}-${rand}`;
  };

  // Fetch Quotes and Job Cards on Load
  useEffect(() => {
    setLoading(true);
    const qQuotes = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
    const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
      const quotesList = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Quote));
      setQuotes(quotesList);
      setLoading(false);
    }, (error) => {
      console.error("Error loading quotes:", error);
      setLoading(false);
    });

    // Fetch Job Cards to prefill from
    const qJobs = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'));
    const unsubscribeJobs = onSnapshot(qJobs, (snapshot) => {
      const jobsList = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as JobCard));
      setJobCards(jobsList);
    }, (error) => {
      console.error("Error loading job cards:", error);
    });

    return () => {
      unsubscribeQuotes();
      unsubscribeJobs();
    };
  }, []);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // Pre-fill fields from Job Card selection
  const handleJobCardSelect = (jobId: string) => {
    setSelectedJobCardId(jobId);
    if (!jobId) return;

    const job = jobCards.find(j => j.id === jobId);
    if (!job) return;

    // Prefill details
    setCurrentQuote(prev => ({
      ...prev,
      jobCardId: job.id,
      jobCardNo: job.jobCardNo,
      clientInfo: {
        firstName: job.clientInfo?.firstName || '',
        surname: job.clientInfo?.surname || '',
        companyName: job.clientInfo?.companyName || '',
        email: job.clientInfo?.email || '',
        tel: job.clientInfo?.tel || '',
        cell: job.clientInfo?.cell || '',
        address: job.clientInfo?.address || ''
      },
      vehicleDetails: {
        make: job.vehicleDetails?.make || '',
        model: job.vehicleDetails?.model || '',
        year: job.vehicleDetails?.year || '',
        color: job.vehicleDetails?.color || '',
        registrationNo: job.vehicleDetails?.registrationNo || '',
        engineNo: job.vehicleDetails?.engineNo || '',
        chassisNo: job.vehicleDetails?.chassisNo || '',
        odometerIn: job.vehicleDetails?.odometerIn || '',
        odometerOut: job.vehicleDetails?.odometerOut || '',
        transmission: job.vehicleDetails?.transmission || 'Automatic',
        driveType: job.vehicleDetails?.driveType || '4x2',
        fuelType: job.vehicleDetails?.fuelType || 'Petrol'
      },
      notes: job.workDetails?.workshopNotes || 'Estimate for work requested: ' + (job.workDetails?.workRequested || '')
    }));

    // Auto add estimated cost as first line item
    if (job.workDetails?.estimatedCost) {
      setEditorItems([{
        id: 'est-1',
        description: job.workDetails.workRequested || 'General Servicing & Repairs',
        quantity: 1,
        unitPrice: job.workDetails.estimatedCost,
        total: job.workDetails.estimatedCost
      }]);
    } else {
      setEditorItems([{
        id: '1',
        description: job.workDetails?.workRequested || '',
        quantity: 1,
        unitPrice: 0,
        total: 0
      }]);
    }
  };

  // Editor item management
  const addLineItem = () => {
    setEditorItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        description: '',
        quantity: 1,
        unitPrice: 0,
        total: 0
      }
    ]);
  };

  const updateLineItem = (index: number, field: keyof QuoteItem, value: any) => {
    setEditorItems(prev => {
      const items = [...prev];
      const item = { ...items[index] };
      
      if (field === 'quantity') {
        item.quantity = Math.max(1, Number(value));
      } else if (field === 'unitPrice') {
        item.unitPrice = Math.max(0, Number(value));
      } else if (field === 'description') {
        item.description = String(value);
      }
      
      item.total = item.quantity * item.unitPrice;
      items[index] = item;
      return items;
    });
  };

  const removeLineItem = (index: number) => {
    if (editorItems.length <= 1) return;
    setEditorItems(prev => prev.filter((_, i) => i !== index));
  };

  // Recalculate Totals
  const calculateTotals = (items: QuoteItem[], includeVat: boolean) => {
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const vatAmount = includeVat ? subtotal * 0.15 : 0; // 15% VAT Standard in South Africa
    const totalAmount = subtotal + vatAmount;
    return { subtotal, vatAmount, totalAmount };
  };

  // Reset & Open Create Editor
  const openCreateEditor = () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const expStr = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    
    setCurrentQuote({
      quoteNo: generateQuoteNo(),
      date: todayStr,
      expiryDate: expStr,
      clientInfo: {
        firstName: '',
        surname: '',
        companyName: '',
        email: '',
        tel: '',
        cell: '',
        address: ''
      },
      vehicleDetails: {
        make: '',
        model: '',
        year: '',
        color: '',
        registrationNo: '',
        engineNo: '',
        chassisNo: '',
        odometerIn: '',
        odometerOut: '',
        transmission: 'Automatic',
        driveType: '4x2',
        fuelType: 'Petrol'
      },
      status: 'Draft',
      includeVat: true,
      notes: 'All quotation estimates are valid for 30 days. Spares and labor pricing are subject to vehicle inspection.'
    });
    setEditorItems([{
      id: '1',
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    }]);
    setSelectedJobCardId('');
    setIsEditorOpen(true);
  };

  // Open Edit Editor
  const openEditEditor = (quote: Quote) => {
    setCurrentQuote(quote);
    setEditorItems([...quote.items]);
    setSelectedJobCardId(quote.jobCardId || '');
    setIsEditorOpen(true);
  };

  // Save Quote to Firestore
  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuote) return;

    // Validate
    if (!currentQuote.clientInfo?.firstName && !currentQuote.clientInfo?.companyName) {
      showStatus("Please enter customer name or company name.", "error");
      return;
    }

    if (editorItems.some(item => !item.description.trim())) {
      showStatus("All line items must have a valid description.", "error");
      return;
    }

    setSaving(true);
    try {
      const { subtotal, vatAmount, totalAmount } = calculateTotals(editorItems, currentQuote.includeVat || false);
      
      const payload: Quote = {
        quoteNo: currentQuote.quoteNo || generateQuoteNo(),
        jobCardId: currentQuote.jobCardId || '',
        jobCardNo: currentQuote.jobCardNo || '',
        date: currentQuote.date || format(new Date(), 'yyyy-MM-dd'),
        expiryDate: currentQuote.expiryDate || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        clientInfo: currentQuote.clientInfo as any,
        vehicleDetails: currentQuote.vehicleDetails as any,
        items: editorItems,
        subtotal,
        includeVat: currentQuote.includeVat || false,
        vatAmount,
        totalAmount,
        status: currentQuote.status || 'Draft',
        notes: currentQuote.notes || '',
        createdAt: currentQuote.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        sharedWithOffice: currentQuote.sharedWithOffice || false
      };

      if (currentQuote.id) {
        // Update
        const path = `quotes/${currentQuote.id}`;
        await setDoc(doc(db, 'quotes', currentQuote.id), payload, { merge: true });
        showStatus(`Quote ${payload.quoteNo} updated successfully!`);
      } else {
        // Create
        await addDoc(collection(db, 'quotes'), payload);
        showStatus(`Quote ${payload.quoteNo} created successfully!`);
      }
      
      setIsEditorOpen(false);
      setCurrentQuote(null);
    } catch (error) {
      console.error("Error saving quote:", error);
      showStatus("Failed to save quote database entry.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuote = async (id: string, quoteNo: string) => {
    if (!window.confirm(`Are you certain you want to permanently delete Quote ${quoteNo}?`)) return;
    
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'quotes', id));
      showStatus(`Quote ${quoteNo} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting quote:", error);
      showStatus("Failed to delete quote.", "error");
    } finally {
      setDeletingId('');
    }
  };

  // Print function
  const handlePrint = (quote: Quote) => {
    setPreviewQuote(quote);
    setIsPrintPreviewOpen(true);
    // Delay to allow rendering, then trigger print
    setTimeout(() => {
      window.print();
    }, 400);
  };

  // Send / Share Quote to Office Workers via Chat
  const handleShareQuoteWithOffice = async (quote: Quote) => {
    try {
      const clientName = quote.clientInfo.companyName || `${quote.clientInfo.firstName} ${quote.clientInfo.surname}`;
      const vehicle = `${quote.vehicleDetails.make} ${quote.vehicleDetails.model} (${quote.vehicleDetails.registrationNo || 'No Reg'})`;
      const formattedTotal = `R ${quote.totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      
      const messageText = `📢 [QUOTE PREPARED] New official quote **${quote.quoteNo}** has been generated for client **${clientName}** on vehicle **${vehicle}**. Total amount: **${formattedTotal}**. Ready for office review and collection authority.`;

      // Save message to workshop chat messages collection
      await addDoc(collection(db, 'chatMessages'), {
        text: messageText,
        senderId: 'SYSTEM',
        senderName: 'SYSTEM QUOTE NOTIFIER',
        senderEmail: user?.email || 'admin@eastrand.co.za',
        timestamp: serverTimestamp()
      });

      // Update quote state as sharedWithOffice
      if (quote.id) {
        await setDoc(doc(db, 'quotes', quote.id), { sharedWithOffice: true }, { merge: true });
      }

      showStatus(`Quote ${quote.quoteNo} shared directly with the office workers via Chat!`);
    } catch (error) {
      console.error("Error sharing quote:", error);
      showStatus("Failed to share quote with the office.", "error");
    }
  };

  // Filter and Search Quotes
  const filteredQuotes = quotes.filter(quote => {
    const clientName = `${quote.clientInfo?.firstName} ${quote.clientInfo?.surname} ${quote.clientInfo?.companyName}`.toLowerCase();
    const vehicle = `${quote.vehicleDetails?.make} ${quote.vehicleDetails?.model} ${quote.vehicleDetails?.registrationNo}`.toLowerCase();
    const matchesSearch = 
      quote.quoteNo.toLowerCase().includes(search.toLowerCase()) ||
      (quote.jobCardNo || '').toLowerCase().includes(search.toLowerCase()) ||
      clientName.includes(search.toLowerCase()) ||
      vehicle.includes(search.toLowerCase());

    if (statusFilter === 'All') return matchesSearch;
    return matchesSearch && quote.status === statusFilter;
  });

  return (
    <div className="space-y-8">
      {/* Toast Alert */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-55 px-6 py-4.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-sm border backdrop-blur-md ${
              statusMsg.type === 'success' 
                ? 'bg-emerald-50/95 border-emerald-300 text-emerald-950' 
                : 'bg-red-50/95 border-red-300 text-red-950'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            )}
            <p className="text-xs font-black tracking-tight leading-normal">{statusMsg.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-black shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 text-[#cc0000]">
            <ClipboardList className="h-6 w-6 stroke-[2.5]" />
            <span className="text-xs font-black uppercase tracking-widest bg-red-50 text-[#cc0000] px-3 py-1 rounded-full border border-red-200">
              Admin & Office
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight">Administrative Quoting Portal</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Prepare, edit, print and submit professional garage repair quotes with the official Eastrand Engine & Turbo design. Instantly link with live job cards and dispatch quotes to workspace staff.
          </p>
        </div>

        <button
          onClick={openCreateEditor}
          className="px-6 py-4 bg-[#cc0000] text-white font-black rounded-2xl hover:bg-black hover:scale-[1.02] active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/20 text-xs uppercase tracking-wider cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[3]" /> Create New Estimate
        </button>
      </div>

      {/* Main Quoting Panel Layout */}
      <div className="grid grid-cols-1 gap-6 print:hidden">
        {/* Filter and Search Bar */}
        <div className="bg-white/65 backdrop-blur-md border border-slate-200/50 rounded-[2rem] p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search quotes by Quote #, Job Card #, Client, Registration..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-250/60 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#cc0000] focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {['All', 'Draft', 'Sent', 'Accepted', 'Rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  statusFilter === status
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* List of Quotes */}
        {loading ? (
          <div className="bg-white rounded-3xl p-16 border border-slate-100 flex flex-col items-center justify-center text-center gap-3 shadow-md">
            <Loader2 className="h-10 w-10 text-[#cc0000] animate-spin" />
            <p className="text-xs font-bold text-slate-400 animate-pulse">Retrieving system quotations...</p>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 border border-slate-100 flex flex-col items-center justify-center text-center gap-4 shadow-md">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-full text-slate-400">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">No Quotations Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                We couldn't find any quotes matching your filters. Create a new estimate or prefill from existing job card records.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredQuotes.map((quote) => {
              const clientName = quote.clientInfo.companyName 
                ? quote.clientInfo.companyName 
                : `${quote.clientInfo.firstName} ${quote.clientInfo.surname}`;

              const vehicle = `${quote.vehicleDetails.make} ${quote.vehicleDetails.model}`;
              const hasReg = quote.vehicleDetails.registrationNo;
              
              const statusColors = {
                Draft: 'bg-slate-100 text-slate-800 border-slate-300',
                Sent: 'bg-amber-50 text-amber-800 border-amber-300',
                Accepted: 'bg-emerald-50 text-emerald-800 border-emerald-300',
                Rejected: 'bg-red-50 text-red-800 border-red-300'
              };

              return (
                <motion.div
                  key={quote.id}
                  layout
                  className="bg-white rounded-[2rem] border border-black hover:shadow-xl transition-all p-8 flex flex-col justify-between gap-5 relative group overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="space-y-1.5 border-b border-slate-100 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-black text-slate-900 tracking-tight">
                        {quote.quoteNo}
                      </span>
                      <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-lg border tracking-wider ${statusColors[quote.status]}`}>
                        {quote.status}
                      </span>
                    </div>
                    
                    <div>
                      <h4 className="font-black text-slate-900 text-sm line-clamp-1">{clientName}</h4>
                      <p className="text-[11px] text-slate-400 font-medium">Prepared: {format(new Date(quote.date), 'dd MMM yyyy')}</p>
                    </div>

                    {quote.jobCardNo && (
                      <div className="inline-flex items-center gap-1 text-[10px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <Wrench className="h-3 w-3 text-[#cc0000]" />
                        <span className="font-semibold text-slate-600">Job Card: {quote.jobCardNo}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Body Components */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Car className="h-4.5 w-4.5 text-slate-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 line-clamp-1">{vehicle}</span>
                        {hasReg && <span className="font-mono text-[10px] bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded hover:bg-slate-100 block mt-0.5 w-max">{hasReg}</span>}
                      </div>
                    </div>

                    {quote.items && quote.items.length > 0 && (
                      <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/80">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Line items ({quote.items.length})</span>
                        <div className="space-y-1 max-h-[72px] overflow-y-auto pr-1">
                          {quote.items.map((it, idx) => (
                            <div key={it.id || idx} className="flex justify-between items-center text-[11px] text-slate-600 gap-2">
                              <span className="truncate flex-1 font-semibold">
                                {it.quantity}x {it.description}
                              </span>
                              <span className="font-bold text-slate-900">
                                R {(it.total).toLocaleString('en-ZA')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-baseline justify-between pt-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Estimate</span>
                      <span className="text-base font-black text-slate-950 font-sans">
                        R {quote.totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between pt-6 border-t border-slate-100 gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditEditor(quote)}
                        className="p-2 bg-slate-50 hover:bg-slate-950 hover:text-white rounded-xl border border-slate-200 text-slate-700 transition-all cursor-pointer"
                        title="Edit estimate"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuote(quote.id!, quote.quoteNo)}
                        disabled={deletingId === quote.id}
                        className="p-2 bg-red-50 hover:bg-red-650 hover:text-white rounded-xl border border-red-100 text-red-650 transition-all cursor-pointer"
                        title="Delete estimate"
                      >
                        {deletingId === quote.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleShareQuoteWithOffice(quote)}
                        className={`px-3 py-1.5 border rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 hover:scale-[1.02] active:scale-98 transition-all cursor-pointer ${
                          quote.sharedWithOffice 
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-[#cc0000]'
                        }`}
                        title="Share with office workers via Chat"
                      >
                        {quote.sharedWithOffice ? <Check className="h-3.5 w-3.5 text-blue-600 stroke-[3]" /> : <Share2 className="h-3.5 w-3.5" />}
                        <span>Share</span>
                      </button>
                      
                      <button
                        onClick={() => handlePrint(quote)}
                        className="px-3 py-1.5 bg-[#cc0000] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 hover:bg-black hover:scale-[1.02] active:scale-98 transition-all cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor Modal Overlay */}
      <AnimatePresence>
        {isEditorOpen && currentQuote && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-black max-h-[92vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-6 bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Wrench className="h-5 w-5 text-[#cc0000] animate-pulse" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Est Invoice Builder</h3>
                  </div>
                  <p className="text-[11px] text-slate-400">Generate, customize, and save professional client estimates for Eastrand Engine & Turbo.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-900 border border-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Scrollable Body */}
              <form onSubmit={handleSaveQuote} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
                {/* Prefill from Existing Job Cards Option */}
                <div className="bg-yellow-50 border border-yellow-250 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="h-5 w-5 text-[#cc0000] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">Prefill from Existing Job Card</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">Choose an active workshop Job Card to immediately populate client data, vehicle specs, and estimate notes.</p>
                    </div>
                  </div>
                  
                  <select
                    value={selectedJobCardId}
                    onChange={(e) => handleJobCardSelect(e.target.value)}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#cc0000] w-full md:w-60 cursor-pointer"
                  >
                    <option value="">-- Click to choose --</option>
                    {jobCards.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.jobCardNo} - {job.clientInfo?.firstName || 'Cust'} ({job.vehicleDetails?.make || ''} {job.vehicleDetails?.model || ''})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Estimate Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Document Reference Number</label>
                    <input
                      type="text"
                      required
                      value={currentQuote.quoteNo || ''}
                      onChange={(e) => setCurrentQuote(prev => ({ ...prev, quoteNo: e.target.value }))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] font-mono text-xs font-bold text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Quotation Date</label>
                    <input
                      type="date"
                      required
                      value={currentQuote.date || ''}
                      onChange={(e) => setCurrentQuote(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-xs font-bold text-slate-850"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Estimate Valid Until (Expiry)</label>
                    <input
                      type="date"
                      required
                      value={currentQuote.expiryDate || ''}
                      onChange={(e) => setCurrentQuote(prev => ({ ...prev, expiryDate: e.target.value }))}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-xs font-bold text-slate-850"
                    />
                  </div>
                </div>

                {/* Patient Client Profile Form */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#cc0000] border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <User className="h-4 w-4" /> Customer Contact Information
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">First Name</label>
                      <input
                        type="text"
                        value={currentQuote.clientInfo?.firstName || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          clientInfo: { ...(prev.clientInfo as any), firstName: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Surname</label>
                      <input
                        type="text"
                        value={currentQuote.clientInfo?.surname || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          clientInfo: { ...(prev.clientInfo as any), surname: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="Doe"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Company Name (Tax Invoice Name)</label>
                      <input
                        type="text"
                        value={currentQuote.clientInfo?.companyName || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          clientInfo: { ...(prev.clientInfo as any), companyName: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="Cape Town Logistics"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Email Address</label>
                      <input
                        type="email"
                        value={currentQuote.clientInfo?.email || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          clientInfo: { ...(prev.clientInfo as any), email: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Cell Number</label>
                      <input
                        type="text"
                        value={currentQuote.clientInfo?.cell || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          clientInfo: { ...(prev.clientInfo as any), cell: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="083 456 7890"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Physical Address</label>
                      <input
                        type="text"
                        value={currentQuote.clientInfo?.address || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          clientInfo: { ...(prev.clientInfo as any), address: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="12 Marine Drive, East Rand"
                      />
                    </div>
                  </div>
                </div>

                {/* Vehicle Specifications Information */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#cc0000] border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <Car className="h-4.5 w-4.5" /> Vehicle Technical Details
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Vehicle Make</label>
                      <input
                        type="text"
                        value={currentQuote.vehicleDetails?.make || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), make: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="e.g., Toyota"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Model Name</label>
                      <input
                        type="text"
                        value={currentQuote.vehicleDetails?.model || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), model: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="e.g., Hilux 3.0 D-4D"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Year</label>
                      <input
                        type="text"
                        value={currentQuote.vehicleDetails?.year || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), year: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="e.g., 2018"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Color Variant</label>
                      <input
                        type="text"
                        value={currentQuote.vehicleDetails?.color || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), color: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="e.g., Charcoal Silver"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Registration Number</label>
                      <input
                        type="text"
                        value={currentQuote.vehicleDetails?.registrationNo || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), registrationNo: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800"
                        placeholder="e.g., GP 88 KK GP"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Odometer In (KM)</label>
                      <input
                        type="text"
                        value={currentQuote.vehicleDetails?.odometerIn || ''}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), odometerIn: e.target.value }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="e.g., 141,300 KM"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Transmission</label>
                      <select
                        value={currentQuote.vehicleDetails?.transmission || 'Automatic'}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), transmission: e.target.value as any }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        <option value="Automatic">Automatic</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Fuel Type</label>
                      <select
                        value={currentQuote.vehicleDetails?.fuelType || 'Petrol'}
                        onChange={(e) => setCurrentQuote(prev => ({
                          ...prev,
                          vehicleDetails: { ...(prev.vehicleDetails as any), fuelType: e.target.value as any }
                        }))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        <option value="Petrol">Petrol</option>
                        <option value="Diesel">Diesel</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Quote Pricing Line Items Table */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#cc0000] flex items-center gap-1.5">
                      <FileText className="h-4.5 w-4.5" /> Service Pricing Line Items
                    </h4>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="px-3 py-1.5 bg-slate-950 text-white font-black rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1 hover:bg-[#cc0000] active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="h-3 w-3 stroke-[3]" /> Add Row
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editorItems.map((item, index) => (
                      <div key={item.id} className="flex gap-2 items-center flex-wrap md:flex-nowrap bg-slate-50 p-2.5 rounded-xl border border-slate-150 relative group">
                        <div className="flex-1 w-full md:w-auto">
                          <input
                            type="text"
                            required
                            placeholder="Description of spares, parts, materials, or workshop labor..."
                            value={item.description}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                          />
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Qty"
                            value={item.quantity || ''}
                            onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                          />
                        </div>
                        <div className="w-36 flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 px-2 select-none">
                          <span className="text-[11px] font-bold text-slate-400">R</span>
                          <input
                            type="number"
                            required
                            min="0"
                            placeholder="Unit Cost"
                            value={item.unitPrice || ''}
                            onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                            className="w-full p-2 bg-transparent text-xs font-bold pl-0 outline-none"
                          />
                        </div>
                        <div className="w-32 text-right px-2 py-2 select-none font-sans font-extrabold text-xs text-slate-800">
                          R {(item.total || 0).toLocaleString('en-ZA')}
                        </div>
                        {editorItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50/50 transition-colors cursor-pointer shrink-0"
                            title="Remove row"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pricing summary & calculations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                  {/* Notes and Terms */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Workshop Notes & Proposal Comments</label>
                      <textarea
                        rows={4}
                        placeholder="Provide customized text detailing workshop diagnostics, scope of work, warranty info..."
                        value={currentQuote.notes || ''}
                        onChange={(e) => setCurrentQuote(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full p-3.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold leading-relaxed"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Estimate Status</label>
                      <div className="flex gap-1.5">
                        {['Draft', 'Sent', 'Accepted', 'Rejected'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setCurrentQuote(prev => ({ ...prev, status: st as any }))}
                            className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-black rounded-lg border transition-all cursor-pointer ${
                              currentQuote.status === st
                                ? 'bg-[#cc0000] border-[#cc0000] text-white shadow-sm'
                                : 'bg-white text-slate-500 border-slate-250 hover:border-slate-350'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Calculations and tax toggles */}
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Pricing Base Subtotal</span>
                        <span className="text-sm font-bold text-slate-800">
                          R {calculateTotals(editorItems, false).subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            id="taxToggle"
                            checked={currentQuote.includeVat || false}
                            onChange={(e) => setCurrentQuote(prev => ({ ...prev, includeVat: e.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300 text-[#cc0000] focus:ring-[#cc0000]"
                          />
                          <label htmlFor="taxToggle" className="text-xs font-black uppercase tracking-wider text-slate-500 cursor-pointer">
                            Charge Value-Added Tax (VAT - 15%)
                          </label>
                        </div>
                        <span className="text-xs font-black text-slate-500 shrink-0">
                          R {calculateTotals(editorItems, currentQuote.includeVat || false).vatAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between pt-1">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-900">Total Estimated Cost</span>
                        <span className="text-2xl font-black text-[#cc0000] font-sans">
                          R {calculateTotals(editorItems, currentQuote.includeVat || false).totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 font-medium leading-normal">
                      * Values are securely tracked in the Central Firestore Cloud Database. Submitting an estimate notifies all offline system nodes.
                    </p>
                  </div>
                </div>

                {/* Action buttons footer */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-5 py-3 md:py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 md:py-3.5 bg-[#cc0000] text-white font-black rounded-xl hover:bg-black hover:scale-[1.02] active:scale-98 transition-all flex items-center gap-2 text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Save Estimate
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Sheet Print Area / Viewer (Hidden when not printing, optimized via custom @media print styles) */}
      <AnimatePresence>
        {isPrintPreviewOpen && previewQuote && (
          <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 overflow-y-auto print:absolute print:inset-0 print:bg-white print:z-auto">
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto print:overflow-visible print:max-h-none print:shadow-none print:p-0 print:rounded-none"
            >
              {/* Back to admin controls */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 h-10 print:hidden shrink-0">
                <span className="text-xs font-black text-slate-400 tracking-wider">Garagesoft PDF Print Assistant</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Are you absolutely sure you want to permanently delete Quote #${previewQuote.quoteNo}? This cannot be undone.`)) return;
                      try {
                        await deleteDoc(doc(db, 'quotes', previewQuote.id!));
                        setIsPrintPreviewOpen(false);
                        setPreviewQuote(null);
                        alert(`Quote #${previewQuote.quoteNo} was deleted successfully.`);
                      } catch (err) {
                        console.error(err);
                        alert('Error trying to delete the quote.');
                      }
                    }}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Quote
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPrintPreviewOpen(false);
                      setPreviewQuote(null);
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" /> Close Assistant
                  </button>
                </div>
              </div>

              {/* Printable sheet container starts */}
              <div id="quote-printable-area" className="bg-white text-slate-900 border border-slate-100 mx-auto max-w-[800px] p-8 md:p-12 space-y-8 select-all print:border-none print:p-0">
                {/* HEAD DETAILS - LADY LOGO BRANDING MAPPING */}
                <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-6 gap-6">
                  {/* Reusable corporate brand Logo component */}
                  <Logo className="h-16" />

                  {/* Document Metas */}
                  <div className="text-right space-y-1.5">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">OFFICIAL REPAIR QUOTE</h1>
                    <div className="text-slate-600 text-xs font-semibold leading-relaxed">
                      <div><strong className="text-slate-900">Quote No:</strong> {previewQuote.quoteNo}</div>
                      <div><strong className="text-slate-900">Date:</strong> {format(new Date(previewQuote.date), 'dd MMMM yyyy')}</div>
                      <div><strong className="text-slate-900">Expiry Limit:</strong> {format(new Date(previewQuote.expiryDate), 'dd MMMM yyyy')}</div>
                    </div>
                  </div>
                </div>

                {/* CLIENT & GARAGE ADDRESS GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-200 pb-6 text-xs">
                  <div className="space-y-2">
                    <span className="font-extrabold uppercase text-slate-400 tracking-wider text-[10px] block">Customer Profile</span>
                    <div className="space-y-1">
                      <div className="text-sm font-black text-slate-900">
                        {previewQuote.clientInfo.firstName || previewQuote.clientInfo.surname ? (
                          `${previewQuote.clientInfo.firstName} ${previewQuote.clientInfo.surname}`
                        ) : 'Private Client'}
                      </div>
                      {previewQuote.clientInfo.companyName && (
                        <div className="font-bold text-slate-700 italic">{previewQuote.clientInfo.companyName}</div>
                      )}
                      {previewQuote.clientInfo.address && <div className="text-slate-500 font-medium">{previewQuote.clientInfo.address}</div>}
                      {previewQuote.clientInfo.cell && <div className="text-slate-500 font-medium">Cell: {previewQuote.clientInfo.cell}</div>}
                      {previewQuote.clientInfo.email && <div className="text-slate-500 font-medium">{previewQuote.clientInfo.email}</div>}
                    </div>
                  </div>

                  <div className="space-y-2 sm:text-right">
                    <span className="font-extrabold uppercase text-slate-400 tracking-wider text-[10px] block">Garage Workshop Depot</span>
                    <div className="space-y-1 font-medium text-slate-600">
                      <div className="text-sm font-black text-[#cc0000] uppercase">Eastrand Engine & Turbo</div>
                      <div>42 Industry Boulevard, Apex Industrial Area</div>
                      <div>Johannesburg, South Africa, 1500</div>
                      <div>Phone: +27 (0) 11 845 2300</div>
                      <div>Email: workshop@eastrandengine.co.za</div>
                    </div>
                  </div>
                </div>

                {/* VEHICLE COMPONENT METADATA PANEL */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 text-xs">
                  <span className="font-extrabold uppercase text-slate-400 tracking-wider text-[10px] block mb-3">Vehicle Details</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-slate-650">
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Make & Model</div>
                      <div className="font-bold text-slate-900 mt-0.5">{previewQuote.vehicleDetails.make} {previewQuote.vehicleDetails.model}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Registration #</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5 bg-white border px-1.5 py-0.2 rounded inline-block">{previewQuote.vehicleDetails.registrationNo || 'No Reg'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Odometer In</div>
                      <div className="font-bold text-slate-900 mt-0.5">{previewQuote.vehicleDetails.odometerIn || 'Unrecorded'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Specs / Fuel</div>
                      <div className="font-bold text-slate-900 mt-0.5">{previewQuote.vehicleDetails.year || 'N/A'} - {previewQuote.vehicleDetails.fuelType} ({previewQuote.vehicleDetails.transmission})</div>
                    </div>
                  </div>
                </div>

                {/* PRICING SHEET TABLE */}
                <div className="space-y-2 text-xs">
                  <span className="font-extrabold uppercase text-slate-400 tracking-wider text-[10px] block">Estimated Services & Repairs Spares Grid</span>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-900 bg-slate-50 text-left">
                        <th className="py-2.5 px-4 font-black uppercase text-slate-800 text-[10px]">#</th>
                        <th className="py-2.5 px-4 font-black uppercase text-slate-800 text-[10px]">Description & Workshop Materials</th>
                        <th className="py-2.5 px-4 font-black uppercase text-slate-00 text-[10px] text-center w-16">Qty</th>
                        <th className="py-2.5 px-4 font-black uppercase text-slate-800 text-[10px] text-right w-32">Unit Price</th>
                        <th className="py-2.5 px-4 font-black uppercase text-slate-800 text-[10px] text-right w-32">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewQuote.items && previewQuote.items.map((it, idx) => (
                        <tr key={it.id || idx} className="border-b border-slate-200 text-slate-700">
                          <td className="py-3 px-4 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900 leading-relaxed">{it.description}</td>
                          <td className="py-3 px-4 text-center font-bold">{it.quantity}</td>
                          <td className="py-3 px-4 text-right font-semibold">R {it.unitPrice.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-slate-900">R {it.total.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* SHEET CALCULATIONS SUMMARY FLANK */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-8 pt-4">
                  <div className="flex-1 space-y-1.5 text-xs text-slate-500 leading-relaxed max-w-sm">
                    <span className="font-extrabold uppercase text-slate-400 tracking-wider text-[10px] block">Guarantee Warranty Terms & Notes</span>
                    <p className="font-medium bg-slate-50 p-3.5 rounded-xl border italic leading-normal">
                      {previewQuote.notes || 'All quotation estimates are valid for 30 days. Pricing subject to vehicle teardown and inspection.'}
                    </p>
                  </div>

                  <div className="w-full sm:w-80 space-y-2 text-xs">
                    <div className="flex justify-between font-bold text-slate-600">
                      <span>BASE SUBTOTAL:</span>
                      <span>R {previewQuote.subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {previewQuote.includeVat && (
                      <div className="flex justify-between font-bold text-slate-600">
                        <span>VALUE ADDED TAX (VAT 15%):</span>
                        <span>R {previewQuote.vatAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-black text-slate-950 pt-2 border-t border-slate-900">
                      <span>ESTIMATE TOTAL:</span>
                      <span>R {previewQuote.totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* SIGNATURE SIGN-OFFS BLOCKS */}
                <div className="grid grid-cols-2 gap-12 pt-16 border-t border-slate-200 text-xs">
                  <div className="space-y-4">
                    <div className="border-b border-slate-900 h-10 w-full"></div>
                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none">Workshop Authorized Assessor</div>
                  </div>

                  <div className="space-y-4">
                    <div className="border-b border-slate-900 h-10 w-full"></div>
                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none">Customer Approval / Authority</div>
                  </div>
                </div>
              </div>
              {/* Printable sheet container ends */}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
