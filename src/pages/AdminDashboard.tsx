import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, writeBatch, where, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Filter, MoreHorizontal, Eye, Edit2, Trash2, Clock, Car, User, KeyRound, ClipboardList, Wrench, ShieldCheck, CheckCircle2, CheckSquare, Square, Trash, Loader2, X, Box, AlertCircle, RefreshCw, Database, ArrowUpDown, Calendar, SlidersHorizontal, Send } from 'lucide-react';
import { db } from '../firebase';
import { JobCard, JobStatus } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { triggerNotificationSimulation } from '../components/NotificationSimulator';
import ConfirmModal from '../components/ConfirmModal';
import LiveRadioPlayer from '../components/LiveRadioPlayer';

const STATUS_ORDER: Record<string, number> = {
  'Check-in': 1,
  'In Progress': 2,
  'Awaiting Parts': 3,
  'Quality Control': 4,
  'Ready for Collection': 5,
  'Completed': 6
};

async function safeFetchJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  
  if (contentType.toLowerCase().includes("text/html") || text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
    throw new Error("Server returned HTML markup instead of API JSON response. This typically means the API endpoint was not found or the backend Express server is starting up.");
  }
  
  try {
    return JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Failed to parse response as JSON. Format error: ${err.message}`, { cause: err });
  }
}

export default function AdminDashboard() {
  const { user, isAdmin, isWorkshopSession, loading: loadingAuth } = useAuth();
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nextRefreshTime, setNextRefreshTime] = useState(30);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const [isSyncingV2, setIsSyncingV2] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const fetchJobCards = async (showLoadingIndicator = false, isAutoRefresh = false) => {
    if (showLoadingIndicator) setLoading(true);
    try {
      const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard));
      setJobCards(cards);
      setPermissionsError(null);
      if (isAutoRefresh) {
        setShowRefreshToast(true);
        setTimeout(() => {
          setShowRefreshToast(false);
        }, 2000);
      }
    } catch (error: any) {
      console.error("Dashboard data fetch error:", error);
      if (error.message.includes('insufficient permissions') || error.message.includes('permission-denied')) {
        setPermissionsError('Workshop Access Error: You don\'t have the required database permissions. If using PIN, please ensure Anonymous Authentication is enabled in Firebase Console.');
        handleFirestoreError(error, OperationType.LIST, 'jobCards');
      }
    } finally {
      if (showLoadingIndicator) setLoading(false);
    }
  };

  const handleSyncV2 = async () => {
    setIsSyncingV2(true);
    setSyncStatus("Connecting to V2 system...");
    try {
      const response = await fetch('/api/pull-v2-jobs');
      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status}`);
      }
      const resData = await safeFetchJson(response);
      if (!resData.success) {
        throw new Error(resData.error || "Failed to fetch job cards from V2");
      }
      
      const v2Jobs = resData.data;
      let jobList: any[] = [];
      if (Array.isArray(v2Jobs)) {
        jobList = v2Jobs;
      } else if (v2Jobs && Array.isArray(v2Jobs.data)) {
        jobList = v2Jobs.data;
      } else if (v2Jobs && typeof v2Jobs === 'object') {
        const foundArray = Object.values(v2Jobs).find(v => Array.isArray(v));
        if (foundArray) {
          jobList = foundArray as any[];
        }
      }

      if (jobList.length === 0) {
        setSyncStatus("No V2 job cards found to sync.");
        setTimeout(() => setSyncStatus(null), 3000);
        return;
      }

      setSyncStatus(`Syncing ${jobList.length} V2 job card(s)...`);
      
      const batch = writeBatch(db);
      let syncCount = 0;
      
      for (const job of jobList) {
        if (!job.id) continue;
        
        const syncPayload = { ...job };
        
        if (!syncPayload.jobCardNo) syncPayload.jobCardNo = job.jobCardNo || `JC-V2-${job.id.slice(0,4).toUpperCase()}`;
        if (!syncPayload.status) syncPayload.status = job.status || 'In Progress';
        
        // Structure map support (flattener / builder)
        if (!syncPayload.clientInfo && (job.firstName || job.surname || job.email)) {
          syncPayload.clientInfo = {
            firstName: job.firstName || '',
            surname: job.surname || '',
            email: job.email || '',
            cell: job.cell || job.phone || '',
            companyName: job.companyName || '',
            tel: job.tel || '',
            address: job.address || ''
          };
        }
        if (!syncPayload.vehicleDetails && (job.make || job.model || job.registrationNo)) {
          syncPayload.vehicleDetails = {
            make: job.make || '',
            model: job.model || '',
            registrationNo: job.registrationNo || job.reg || '',
            odometerIn: job.odometerIn || '',
            kmIn: job.kmIn || '',
            odometerOut: job.odometerOut || '',
            year: job.year || '',
            color: job.color || '',
            engineNo: job.engineNo || '',
            chassisNo: job.chassisNo || job.vin || '',
            transmission: job.transmission || 'Automatic',
            driveType: job.driveType || '4x2',
            fuelType: job.fuelType || 'Petrol'
          };
        }
        if (!syncPayload.workDetails && (job.workRequested || job.workDetails)) {
          syncPayload.workDetails = {
            workRequested: job.workRequested || job.workDetails || '',
            estimatedCost: job.estimatedCost || 0,
            authorisedCost: job.authorisedCost || 0,
            workshopNotes: job.workshopNotes || '',
            serviceType: job.serviceType || []
          };
        }
        
        delete (syncPayload as any).updatedAt;
        delete (syncPayload as any).createdAt;

        batch.set(doc(db, 'jobCards', job.id), syncPayload, { merge: true });
        syncCount++;
      }
      
      await batch.commit();
      setSyncStatus(`Sync complete! Synced ${syncCount} V2 Job Cards.`);
      setTimeout(() => setSyncStatus(null), 3000);
      
      fetchJobCards(false);
    } catch (err: any) {
      console.error("V2 sync error:", err);
      setSyncStatus(`Sync Error: ${err.message || "Unknown error"}`);
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setIsSyncingV2(false);
    }
  };

  useEffect(() => {
    if (loadingAuth) return;
    if (!isAdmin && !isWorkshopSession) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchJobCards(true);
    // Auto-sync V2 Job Cards if authenticated
    handleSyncV2();

    if (!autoRefresh) return;

    // Polling every 30 seconds
    const interval = setInterval(() => {
      fetchJobCards(false, true);
    }, 30000);

    // Dynamic countdown timer
    setNextRefreshTime(30);
    const countdown = setInterval(() => {
      setNextRefreshTime((prev) => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdown);
    };
  }, [loadingAuth, isAdmin, isWorkshopSession, autoRefresh]);

  const handleDelete = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: "Delete Job Card?",
      message: "Are you sure you want to delete this job card? This action cannot be undone and will permanently remove all associated parts, notes, and records.",
      confirmText: "Delete Permanently",
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setDeletingId(id);
        try {
          // 1. Delete associated parts
          const partsQ = query(collection(db, 'parts'), where('jobCardId', '==', id));
          const partsSnap = await getDocs(partsQ);
          const batch = writeBatch(db);
          
          partsSnap.forEach(p => batch.delete(doc(db, `parts/${p.id}`)));
          
          // 2. Delete associated notes
          const notesQ = collection(db, `jobCards/${id}/notes`);
          const notesSnap = await getDocs(notesQ);
          notesSnap.forEach(n => batch.delete(doc(db, `jobCards/${id}/notes/${n.id}`)));

          // 3. Delete the job card itself
          batch.delete(doc(db, `jobCards/${id}`));

          await batch.commit();
          
          // Update local state immediately so UI reflects deletion instantly
          setJobCards(prev => prev.filter(c => c.id !== id));
          
          // Sync delete to external app using proxy
          fetch('/api/sync-external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'DELETE_JOB_CARD', payload: { id } })
          }).catch(err => console.error("External sync failed", err));

          setBulkSuccessMessage('Successfully deleted job card and all associated data.');
          setTimeout(() => setBulkSuccessMessage(null), 3000);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `jobCards/${id}`);
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('date-desc');

  // Custom Ephemeral Toast Notifications for sandboxed preview safety
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const triggerToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Advanced simultaneous search state
  const [searchCustomer, setSearchCustomer] = useState('');
  const [searchReg, setSearchReg] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  const filteredCards = jobCards.filter(card => {
    // 1. General search term filters by Job Card, Client Name or Vehicle Reg
    const matchesGeneralSearch = !searchTerm.trim() || 
      (card.jobCardNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.clientInfo?.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.clientInfo?.surname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.vehicleDetails?.registrationNo || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // 2. Simultaneous Advanced Customer Name filter
    const fullName = `${card.clientInfo?.firstName || ''} ${card.clientInfo?.surname || ''}`.toLowerCase();
    const matchesCustomer = !searchCustomer.trim() || fullName.includes(searchCustomer.toLowerCase());

    // 3. Simultaneous Advanced Registration Number filter
    const matchesReg = !searchReg.trim() || 
      (card.vehicleDetails?.registrationNo || '').toLowerCase().includes(searchReg.toLowerCase());

    // 4. Simultaneous Advanced Date Range filter
    let matchesDateRange = true;
    if (startDate || endDate) {
      const cardDate = card.createdAt?.toDate 
        ? card.createdAt.toDate() 
        : (card.createdAt?.seconds 
          ? new Date(card.createdAt.seconds * 1000) 
          : (card.createdAt ? new Date(card.createdAt) : null));
      
      if (cardDate) {
        const cardTime = cardDate.getTime();
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (cardTime < start.getTime()) {
            matchesDateRange = false;
          }
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (cardTime > end.getTime()) {
            matchesDateRange = false;
          }
        }
      } else {
        matchesDateRange = false;
      }
    }

    // 5. Status filter
    const matchesStatus = statusFilter === 'All' || card.status === statusFilter;
    
    return matchesGeneralSearch && matchesCustomer && matchesReg && matchesDateRange && matchesStatus;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'date-desc': {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      }
      case 'date-asc': {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      }
      case 'status-asc': {
        const orderA = STATUS_ORDER[a.status] || 99;
        const orderB = STATUS_ORDER[b.status] || 99;
        if (orderA !== orderB) return orderA - orderB;
        // Fallback to date
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      }
      case 'customer-asc': {
        const nameA = `${a.clientInfo?.firstName || ''} ${a.clientInfo?.surname || ''}`.trim().toLowerCase();
        const nameB = `${b.clientInfo?.firstName || ''} ${b.clientInfo?.surname || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case 'customer-desc': {
        const nameA = `${a.clientInfo?.firstName || ''} ${a.clientInfo?.surname || ''}`.trim().toLowerCase();
        const nameB = `${b.clientInfo?.firstName || ''} ${b.clientInfo?.surname || ''}`.trim().toLowerCase();
        return nameB.localeCompare(nameA);
      }
      default:
        return 0;
    }
  });

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedCards);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedCards(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedCards.size === filteredCards.length) {
      setSelectedCards(new Set());
    } else {
      setSelectedCards(new Set(filteredCards.map(c => c.id!)));
    }
  };

  const handleBulkDelete = () => {
    setConfirmModalConfig({
      isOpen: true,
      title: `Delete ${selectedCards.size} Job Cards?`,
      message: `Are you sure you want to delete ${selectedCards.size} selected job card(s)? This action cannot be undone and will permanently delete all associated parts, notes, and records for each.`,
      confirmText: `Delete ${selectedCards.size} Job Cards`,
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setIsBulkUpdating(true);
        try {
          const count = selectedCards.size;
          const batch = writeBatch(db);
          
          // We need to fetch and delete parts for ALL selected cards
          // For simplicity in client side batch, we'll iterate and add to batch
          // (Batch limit is 500, so this should be fine for typical usage)
          for (const id of Array.from(selectedCards)) {
            const partsQ = query(collection(db, 'parts'), where('jobCardId', '==', id));
            const partsSnap = await getDocs(partsQ);
            partsSnap.forEach(p => batch.delete(doc(db, `parts/${p.id}`)));

            const notesQ = collection(db, `jobCards/${id}/notes`);
            const notesSnap = await getDocs(notesQ);
            notesSnap.forEach(n => batch.delete(doc(db, `jobCards/${id}/notes/${n.id}`)));

            batch.delete(doc(db, `jobCards/${id}`));
          }

          await batch.commit();
          
          // Update local state immediately so UI reflects deletions instantly
          const deletedIds = Array.from(selectedCards);
          setJobCards(prev => prev.filter(c => !deletedIds.includes(c.id!)));

          setSelectedCards(new Set());
          setBulkSuccessMessage(`Successfully deleted ${count} job cards and associated data.`);
          setTimeout(() => setBulkSuccessMessage(null), 3000);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'jobCards/bulk');
        } finally {
          setIsBulkUpdating(false);
        }
      }
    });
  };

  const handleStatusUpdate = async (cardId: string, newStatus: string) => {
    // Optimistic local state update for super snappy responses
    setJobCards(prev => prev.map(c => c.id === cardId ? { ...c, status: newStatus as JobStatus } : c));

    try {
      await updateDoc(doc(db, 'jobCards', cardId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      const card = jobCards.find(c => c.id === cardId);
      if (card) {
        // Sync status update to external app V2 directly
        const syncData = { ...card, status: newStatus };
        delete (syncData as any).updatedAt;
        delete (syncData as any).createdAt;
        
        fetch('/api/sync-external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'JOB_CARD_SYNC', payload: { id: cardId, ...syncData } })
        }).catch(err => console.error("External sync failed", err));

        if (newStatus === 'Ready for Collection' || newStatus === 'Completed') {
          triggerNotificationSimulation({
            ...card,
            status: newStatus
          });
        }
      }
    } catch (err) {
      // Revert if error occurs
      fetchJobCards(false);
      handleFirestoreError(err, OperationType.UPDATE, `jobCards/${cardId}`);
    }
  };

  const handleBulkStatusUpdate = async (newStatus: string) => {
    setIsBulkUpdating(true);
    try {
      const count = selectedCards.size;
      const batch = writeBatch(db);
      
      selectedCards.forEach(id => {
        batch.update(doc(db, 'jobCards', id), { 
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();

      // Sync bulk status to external app V2 directly
      selectedCards.forEach(id => {
        const card = jobCards.find(c => c.id === id);
        if (card) {
          const syncData = { ...card, status: newStatus };
          delete (syncData as any).updatedAt;
          delete (syncData as any).createdAt;
          
          fetch('/api/sync-external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'JOB_CARD_SYNC', payload: { id, ...syncData } })
          }).catch(err => console.error("External sync failed", err));
        }
      });

      if (newStatus === 'Ready for Collection' || newStatus === 'Completed') {
        selectedCards.forEach(id => {
          const card = jobCards.find(c => c.id === id);
          if (card) {
            triggerNotificationSimulation({
              ...card,
              status: newStatus
            });
          }
        });
      }

      setSelectedCards(new Set());
      setBulkSuccessMessage(`Successfully updated ${count} job cards to ${newStatus}.`);
      setTimeout(() => setBulkSuccessMessage(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'jobCards/bulk');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Check-in': return 'bg-slate-100 text-slate-700';
      case 'In Progress': return 'bg-red-100 text-red-700';
      case 'Awaiting Parts': return 'bg-orange-100 text-orange-700';
      case 'Quality Control': return 'bg-purple-100 text-purple-700';
      case 'Ready for Collection': return 'bg-green-100 text-green-700';
      case 'Completed': return 'bg-slate-800 text-white';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (!isAdmin && !isWorkshopSession) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="bg-red-50 p-6 rounded-full mb-6">
          <ShieldCheck className="h-12 w-12 text-[#cc0000]" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Staff Verification Required</h2>
        <p className="text-slate-500 text-center max-w-sm mb-8 leading-relaxed">
          The main job list is restricted. Please use the <strong>Staff PIN Login</strong> to unlock workshop access if you are a technician.
        </p>
        <div className="flex gap-4">
          <Link 
            to="/admin-login" 
            className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg"
          >
           Staff PIN Login
          </Link>
          <Link 
            to="/admin-login" 
            className="px-6 py-3 bg-white border border-slate-200 text-slate-900 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
           Switch Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className={`${isWorkshopSession ? 'xl:col-span-3' : 'xl:col-span-2'} grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6`}>
          <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 lg:gap-4 mb-4">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-red-50 text-[#cc0000] rounded-2xl flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="overflow-hidden">
                <div className="text-xl lg:text-2xl font-black text-slate-900 truncate">{jobCards.length}</div>
                <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Total Jobs</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 lg:gap-4 mb-4">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="overflow-hidden">
                <div className="text-xl lg:text-2xl font-black text-slate-900 truncate">
                  {jobCards.filter(c => !['Completed', 'Ready for Collection'].includes(c.status)).length}
                </div>
                <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Active Load</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 lg:gap-4 mb-4">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="overflow-hidden">
                <div className="text-xl lg:text-2xl font-black text-slate-900 truncate">
                   {jobCards.filter(c => c.status === 'Ready for Collection').length}
                </div>
                <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Pick-up</div>
              </div>
            </div>
          </div>
        </div>
        {!isWorkshopSession && (
          <div className="xl:col-span-1">
            <LiveRadioPlayer />
          </div>
        )}
      </div>

      {permissionsError && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 bg-red-50 border-2 border-red-100 rounded-3xl flex flex-col items-center gap-4 text-center"
        >
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-900 mb-1">Database Access Error</h3>
            <p className="text-red-600 max-w-md">{permissionsError}</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
          >
            Retry Connection
          </button>
        </motion.div>
      )}

      {/* Bulk Action Result Notification */}
      <AnimatePresence>
        {bulkSuccessMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-green-600 text-white rounded-2xl shadow-2xl font-bold flex items-center gap-3"
          >
            <CheckCircle2 className="h-5 w-5" />
            {bulkSuccessMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Workshop Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage automotive repairs and engine services.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Auto Refresh Toggle */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 px-4 py-2.5 rounded-2xl transition-colors select-none">
            <span className="relative flex h-2 w-2 mr-1">
              {autoRefresh && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${autoRefresh ? 'bg-green-500' : 'bg-slate-300'}`}></span>
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={autoRefresh} 
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#cc0000]"></div>
              <span className="ml-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                {autoRefresh ? `Auto-Refresh (${nextRefreshTime}s)` : 'Auto-Refresh OFF'}
              </span>
            </label>
          </div>

          {/* V2 Sync Controller */}
          {!isWorkshopSession && (
            <button 
              onClick={handleSyncV2}
              disabled={isSyncingV2}
              className={`flex items-center gap-2 px-5 py-3 ${
                isSyncingV2 ? 'bg-purple-50 text-purple-700' : 'bg-purple-50 text-purple-700 hover:bg-purple-100/80 border border-purple-200'
              } font-bold rounded-2xl shadow-sm transition-all cursor-pointer text-xs disabled:opacity-75`}
              title="Pull all latest Job Cards from the V2 system"
            >
              {isSyncingV2 ? (
                <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
              ) : (
                <RefreshCw className="h-4 w-4 text-purple-600" />
              )}
              <span>{isSyncingV2 ? 'Syncing V2...' : 'Sync V2 Jobs'}</span>
            </button>
          )}

          {!isWorkshopSession && (
            <Link to="/admin/job-card/new" className="flex items-center gap-2 px-6 py-3 bg-[#cc0000] text-white font-bold rounded-2xl hover:bg-black transition-all shadow-lg shadow-red-900/20">
              <Plus className="h-5 w-5" /> New Job Card
            </Link>
          )}
        </div>
      </div>

      {syncStatus && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-purple-50/70 border border-purple-200 text-purple-800 rounded-3xl flex items-center gap-3 shadow-sm text-xs font-semibold"
        >
          <Database className="h-4 w-4 text-purple-600 animate-pulse" />
          <span>{syncStatus}</span>
        </motion.div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isWorkshopSession ? 'xl:grid-cols-3' : 'xl:grid-cols-4 lg:grid-cols-2'} gap-4 md:gap-6`}>
        {[
          { label: 'Total Jobs', count: jobCards.length, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Repairs', count: jobCards.filter(c => !['Completed', 'Ready for Collection'].includes(c.status)).length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Ready / Done', count: jobCards.filter(c => ['Completed', 'Ready for Collection'].includes(c.status)).length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          ...(isWorkshopSession ? [] : [{ label: 'Parts Inventory', count: 'View list', icon: Box, color: 'text-purple-600', bg: 'bg-purple-50', link: '/admin/parts' }]),
        ].map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label} 
            className="bg-white px-5 py-4 lg:px-6 lg:py-5 rounded-full border border-black shadow-sm flex items-center gap-4 group hover:border-[#cc0000] transition-all overflow-hidden"
          >
            <div className={`${stat.bg} ${stat.color} p-3 rounded-full group-hover:scale-110 transition-transform`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              {stat.link ? (
                <Link to={stat.link} className="text-sm font-extrabold text-slate-900 hover:text-[#cc0000] block">{stat.count} →</Link>
              ) : (
                <div className="text-xl font-black text-slate-900 leading-tight">{stat.count}</div>
              )}
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">{stat.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        {/* Main Search Controls */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center">
          {!isWorkshopSession && (
            <div className="flex items-center gap-4 pr-6 border-r border-slate-100">
              <button 
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-[#cc0000] transition-colors shrink-0 cursor-pointer"
              >
                {selectedCards.size === filteredCards.length && filteredCards.length > 0 ? (
                  <CheckSquare className="h-5 w-5 text-[#cc0000]" />
                ) : (
                  <Square className="h-5 w-5" />
                )}
                {selectedCards.size > 0 ? `${selectedCards.size} Selected` : 'Select All'}
              </button>
            </div>
          )}
          
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Quick search by Job Card No..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#cc0000] outline-none text-sm transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
              type="button"
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all text-xs font-bold uppercase tracking-wider cursor-pointer ${
                showAdvancedSearch || searchCustomer || searchReg || startDate || endDate
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Advanced Search</span>
              {(searchCustomer || searchReg || startDate || endDate) && (
                <span className="w-2 h-2 rounded-full bg-amber-500 anim-pulse inline-block" />
              )}
            </button>

            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
              <Filter className="h-4 w-4 text-slate-400" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-bold uppercase tracking-widest outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Check-in">Check-in</option>
                <option value="In Progress">In Progress</option>
                <option value="Awaiting Parts">Awaiting Parts</option>
                <option value="Quality Control">Quality Control</option>
                <option value="Ready for Collection">Ready Collection</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
              <ArrowUpDown className="h-4 w-4 text-slate-400" />
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-xs font-bold uppercase tracking-widest outline-none cursor-pointer"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="status-asc">Status: Progress</option>
                <option value="customer-asc">Customer A-Z</option>
                <option value="customer-desc">Customer Z-A</option>
              </select>
            </div>

            {(searchTerm || searchCustomer || searchReg || startDate || endDate || statusFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSearchCustomer('');
                  setSearchReg('');
                  setStartDate('');
                  setEndDate('');
                  setStatusFilter('All');
                }}
                className="px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Expandable Advanced Multi-filter Drawer */}
        <AnimatePresence>
          {(showAdvancedSearch || searchCustomer || searchReg || startDate || endDate) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-slate-100 pt-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                {/* Advanced: Customer Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Customer Name</label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={searchCustomer}
                      onChange={(e) => setSearchCustomer(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#cc0000] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Advanced: Registration Number */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Registration Number</label>
                  <div className="relative">
                    <Car className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. CAA 123456"
                      value={searchReg}
                      onChange={(e) => setSearchReg(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#cc0000] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Advanced: Start Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Date Range - Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#cc0000] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Advanced: End Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Date Range - End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#cc0000] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cc0000]"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence>
            {filteredCards.map((card) => (
              <motion.div 
                key={card.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group ${selectedCards.has(card.id!) ? 'ring-2 ring-[#cc0000] ring-inset' : ''}`}
              >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-3">
                      {!isWorkshopSession && (
                        <button 
                          onClick={() => toggleSelection(card.id!)}
                          className="mt-1 transition-colors"
                        >
                          {selectedCards.has(card.id!) ? (
                            <CheckSquare className="h-5 w-5 text-[#cc0000]" />
                          ) : (
                            <Square className="h-5 w-5 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </button>
                      )}
                      <div className="flex flex-col gap-1 items-start">
                        <motion.div
                          key={card.status}
                          initial={{ scale: 0.92, opacity: 0.8 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 450, damping: 14 }}
                          whileHover={isWorkshopSession ? undefined : { scale: 1.05, translateY: -0.5 }}
                          whileTap={isWorkshopSession ? undefined : { scale: 0.95 }}
                          className={`relative flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${getStatusColor(card.status)} ${isWorkshopSession ? '' : 'cursor-pointer border border-transparent hover:border-current/20 shadow-sm'}`}
                        >
                          {!isWorkshopSession && (
                            <select
                              value={card.status}
                              onChange={(e) => handleStatusUpdate(card.id!, e.target.value)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-slate-800"
                            >
                              <option value="Check-in">Check-in</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Awaiting Parts">Awaiting Parts</option>
                              <option value="Quality Control">Quality Control</option>
                              <option value="Ready for Collection">Ready for Collection</option>
                              <option value="Completed">Completed</option>
                            </select>
                          )}
                          <span>{card.status}</span>
                          {!isWorkshopSession && <span className="text-[7px] opacity-70">▼</span>}
                        </motion.div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-widest border border-slate-200">
                          <KeyRound className="h-2.5 w-2.5" /> {card.customerCode}
                        </div>
                      </div>
                    </div>
                    <span className="text-xl font-black text-red-600">#{card.jobCardNo}</span>
                  </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <User className="h-5 w-5 text-slate-400 shrink-0 mt-1" />
                    <div>
                      <div className="font-bold text-slate-900">{card.clientInfo?.firstName || 'Unknown'} {card.clientInfo?.surname || 'Customer'}</div>
                      <div className="text-xs text-slate-500 italic">{card.clientInfo?.companyName || 'Private Client'}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Car className="h-5 w-5 text-slate-400 shrink-0 mt-1" />
                    <div>
                      <div className="font-semibold text-slate-700">{card.vehicleDetails?.make || ''} {card.vehicleDetails?.model || ''}</div>
                      <div className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded inline-block mt-1">
                        {card.vehicleDetails?.registrationNo || 'No Reg'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-red-50 group-hover:border-red-100 transition-colors">
                    <Wrench className="h-4 w-4 text-slate-400 group-hover:text-[#cc0000]" />
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1 group-hover:text-[#cc0000]">Workshop Assignment</div>
                      <div className={`text-sm font-bold leading-none ${card.assignedTechnicianName ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                        {card.assignedTechnicianName || 'Unassigned'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{card.createdAt ? format(card.createdAt.toDate(), 'p') : 'Just now'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link 
                        to={`/admin/job-card/${card.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#cc0000]/10 text-[#cc0000] hover:bg-[#cc0000] hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        {isWorkshopSession ? (
                          <>
                            <Eye className="h-3.5 w-3.5" /> View
                          </>
                        ) : (
                          <>
                            <Edit2 className="h-3.5 w-3.5" /> Edit
                          </>
                        )}
                      </Link>
                      {!isWorkshopSession && (
                        <button 
                          onClick={() => {
                            triggerNotificationSimulation({
                              ...card,
                              isNewCreation: true
                            } as any);
                            triggerToast(`Manual WhatsApp/SMS dispatch triggered for Code ${card.customerCode}!`, 'success');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                          title="Manual dispatch of 6-digit login code via WhatsApp/SMS"
                        >
                          <Send className="h-3.5 w-3.5" /> Send Code
                        </button>
                      )}
                      {isAdmin && !isWorkshopSession && (
                        <button 
                          onClick={() => handleDelete(card.id!)}
                          disabled={deletingId === card.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                        >
                          {deletingId === card.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} 
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedCards.size > 0 && !isWorkshopSession && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
          >
            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-6 border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="bg-[#cc0000] text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                  {selectedCards.size} Selected
                </div>
                <button 
                  onClick={() => setSelectedCards(new Set())}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                    Update Status
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800 rounded-xl shadow-xl border border-white/5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all p-1">
                    {['In Progress', 'Awaiting Parts', 'Quality Control', 'Ready for Collection', 'Completed'].map(status => (
                      <button 
                        key={status}
                        onClick={() => handleBulkStatusUpdate(status)}
                        className="w-full text-left px-3 py-2 hover:bg-[#cc0000] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                        disabled={isBulkUpdating}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                (isAdmin || isWorkshopSession) && (
                  <button 
                    onClick={handleBulkDelete}
                    disabled={isBulkUpdating}
                    className="px-4 py-2 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                  >
                    {isBulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                    Delete
                  </button>
                )
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && filteredCards.length === 0 && (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No Job Cards Found</h3>
          <p className="text-slate-500">Create a new job card to get started.</p>
        </div>
      )}

      {/* Global Action Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        confirmText={confirmModalConfig.confirmText}
        onClose={() => setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalConfig.onConfirm}
      />

      {/* Auto-Refresh Toast Notification */}
      <AnimatePresence>
        {showRefreshToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 bg-slate-900 border border-slate-800 text-slate-100 px-4 py-3 rounded-2xl shadow-xl shadow-slate-950/20 select-none max-w-sm pointer-events-none"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-3 w-3" />
            </div>
            <div className="flex-1 text-xs font-semibold tracking-wide">
              Dashboard list automatically refreshed!
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ephemeral Toast overlay */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-white font-medium text-xs leading-relaxed max-w-sm"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${
              toastMessage.type === 'success' ? 'bg-emerald-500' :
              toastMessage.type === 'info' ? 'bg-blue-500' : 'bg-red-500'
            }`} />
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
