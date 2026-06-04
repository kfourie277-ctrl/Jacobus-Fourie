import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, addDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Save, ArrowLeft, Camera, Video, AlertCircle, CheckCircle2, Trash2, Box, Plus, KeyRound, Hash, MessageSquare, Send, Clock as ClockIcon, X, Play, Wrench, Loader2, GripVertical, Upload, Printer, FileText, Mic, MicOff, RefreshCw, Database, Check } from 'lucide-react';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { JobCard, JobStatus, Part, JobNote, Recording, Technician, ChecklistItem } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useAuth } from '../contexts/AuthContext';
import { triggerNotificationSimulation } from '../components/NotificationSimulator';
import { format } from 'date-fns';
import { PART_PACKS, PartPack } from '../utils/partPacks';
import InvoiceSummary from '../components/InvoiceSummary';
import ConfirmModal from '../components/ConfirmModal';
import AudioPlayer from '../components/AudioPlayer';

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

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  "Oil Change",
  "Tire Rotation",
  "Brake Check",
  "Air Filter Replacement",
  "Battery Check",
  "Coolant Flush",
  "Transmission Fluid Check",
  "Spark Plug Replacement",
  "Timing Belt Inspection",
  "Suspension Check"
].map(task => ({
  id: Math.random().toString(36).substring(2, 9),
  task,
  completed: false,
  completedAt: null
}));

function dataURLtoBlob(dataurl: string) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export default function JobCardForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: loadingAuth, isAdmin, isWorkshopSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<string | null>(null);

  // Auto-save draft states
  const [tempDraftId] = useState(() => {
    const existing = localStorage.getItem('new_job_card_draft_id');
    if (existing) return existing;
    const newId = 'new_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('new_job_card_draft_id', newId);
    return newId;
  });
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<Date | null>(null);
  const [hasDraftToRestore, setHasDraftToRestore] = useState(false);
  const [draftToRestore, setDraftToRestore] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('client');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingType, setRecordingType] = useState<'check-in' | 'check-out'>('check-in');
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showEmbedStock, setShowEmbedStock] = useState(false);
  const [jobParts, setJobParts] = useState<Part[]>([]);
  const [jobNotes, setJobNotes] = useState<JobNote[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [newNoteText, setNewNoteText] = useState('');

  // Credentials gate states
  const [isNewJobCardUnlocked, setIsNewJobCardUnlocked] = useState(() => sessionStorage.getItem('new_jc_unlocked') === 'true');
  const [adminPwd, setAdminPwd] = useState('admin');
  const [unlockPwd, setUnlockPwd] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [fetchingPassword, setFetchingPassword] = useState(false);

  const [showPinCheckModal, setShowPinCheckModal] = useState(false);
  const [pinToCheck, setPinToCheck] = useState('1234');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinCheckError, setPinCheckError] = useState('');
  const [fetchingPin, setFetchingPin] = useState(false);

  // Voice note recording states for job notes
  const [isNoteRecording, setIsNoteRecording] = useState(false);
  const [noteRecordingDuration, setNoteRecordingDuration] = useState(0);
  const noteMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const noteAudioChunksRef = useRef<Blob[]>([]);
  const noteRecordingTimerRef = useRef<any>(null);
  const noteRecordingStreamRef = useRef<MediaStream | null>(null);
  const [newPart, setNewPart] = useState<Partial<Part>>({
    name: '',
    quantity: 1,
    price: 0,
    description: ''
  });
  const [isAddingPart, setIsAddingPart] = useState(false);
  
  // Custom Ephemeral Toast Notifications for sandboxed preview safety
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const triggerToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };
  
  // External Stock System Sync States
  const [showSyncStockModal, setShowSyncStockModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'matching' | 'matched' | 'syncing' | 'completed' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<{
    matched: Array<{
      part: Part;
      stockItem: any;
      newQty: number;
    }>;
    unmatched: Array<{
      part: Part;
      autoCreate: boolean;
    }>;
  } | null>(null);
  const [syncSummary, setSyncSummary] = useState<{
    syncedCount: number;
    createdCount: number;
    failedCount: number;
    transactions: Array<{
      partName: string;
      quantityDeducted: number;
      sku: string;
      technicianId: string;
      technicianName: string;
      action: string;
      itemId: string;
      timestamp: string;
    }>;
  } | null>(null);
  
  // Custom delete confirmation modal states
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
  
  // Part Packs states
  const [partsSubTab, setPartsSubTab] = useState<'single' | 'packs' | 'import'>('single');
  const [selectedPacks, setSelectedPacks] = useState<Set<string>>(new Set());
  const [expandedPacks, setExpandedPacks] = useState<Set<string>>(new Set());
  const [packCustomizations, setPackCustomizations] = useState<{
    [packId: string]: {
      [partName: string]: {
        selected: boolean;
        quantity: number;
        price: number;
        action: 'replace' | 'add';
        assignedTechnician: string;
        assignedTechnicianName: string;
      }
    }
  }>({});

  const handleTogglePackSelection = (packId: string) => {
    const newSelected = new Set(selectedPacks);
    if (newSelected.has(packId)) {
      newSelected.delete(packId);
    } else {
      newSelected.add(packId);
      // Initialize customizations if empty
      if (!packCustomizations[packId]) {
        const pack = PART_PACKS.find(p => p.id === packId);
        if (pack) {
          const partsCustom: any = {};
          pack.parts.forEach(part => {
            partsCustom[part.name] = {
              selected: true,
              quantity: part.quantity,
              price: part.price,
              action: 'replace',
              assignedTechnician: '',
              assignedTechnicianName: ''
            };
          });
          setPackCustomizations(prev => ({
            ...prev,
            [packId]: partsCustom
          }));
        }
      }
    }
    setSelectedPacks(newSelected);
  };

  const handleTogglePackExpand = (packId: string) => {
    const newExpanded = new Set(expandedPacks);
    if (newExpanded.has(packId)) {
      newExpanded.delete(packId);
    } else {
      newExpanded.add(packId);
      // Also initialize customized fields if not already done
      if (!packCustomizations[packId]) {
        const pack = PART_PACKS.find(p => p.id === packId);
        if (pack) {
          const partsCustom: any = {};
          pack.parts.forEach(part => {
            partsCustom[part.name] = {
              selected: true,
              quantity: part.quantity,
              price: part.price,
              action: 'replace',
              assignedTechnician: '',
              assignedTechnicianName: ''
            };
          });
          setPackCustomizations(prev => ({
            ...prev,
            [packId]: partsCustom
          }));
        }
      }
    }
    setExpandedPacks(newExpanded);
  };

  const handleUpdatePackPartCustomization = (
    packId: string,
    partName: string,
    field: string,
    value: any
  ) => {
    setPackCustomizations(prev => {
      const packC = { ...prev[packId] };
      const partC = { ...packC[partName] };
      
      if (field === 'assignedTechnician') {
        const tech = technicians.find(t => t.id === value);
        partC.assignedTechnician = value;
        partC.assignedTechnicianName = tech ? tech.name : '';
      } else {
        partC[field] = value;
      }
      
      packC[partName] = partC;
      return {
        ...prev,
        [packId]: packC
      };
    });
  };

  const handleImportSelectedPacks = async () => {
    if (!id) return;
    if (selectedPacks.size === 0) {
      alert("Please select at least one package.");
      return;
    }

    setLoading(true);
    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      let totalPartsAdded = 0;

      const addedParts: any[] = [];
      selectedPacks.forEach(packId => {
        const pack = PART_PACKS.find(p => p.id === packId);
        if (!pack) return;

        const customizations = packCustomizations[packId] || {};
        pack.parts.forEach(part => {
          const custom = customizations[part.name] || {
            selected: true,
            quantity: part.quantity,
            price: part.price,
            action: 'replace',
            assignedTechnician: '',
            assignedTechnicianName: ''
          };

          if (custom.selected) {
            const partRef = doc(collection(db, 'parts'));
            const actionLabel = custom.action === 'replace' ? '[REPLACEMENT] ' : '[ADDITIONAL ACCESSORY] ';
            const customDesc = part.description ? `${actionLabel}${part.description}` : `${actionLabel}Parts pack item added.`;
            
            const partData = {
              name: part.name,
              quantity: custom.quantity,
              price: custom.price,
              description: customDesc,
              jobCardId: id,
              assignedTechnician: custom.assignedTechnician || '',
              assignedTechnicianName: custom.assignedTechnicianName || '',
              addedAt: serverTimestamp(),
              isReplacement: custom.action === 'replace',
              isAdditional: custom.action === 'add'
            };

            const syncPartData = { ...partData, addedAt: new Date().toISOString() };
            batch.set(partRef, partData);
            addedParts.push({ id: partRef.id, ...syncPartData });
            totalPartsAdded++;
          }
        });
      });

      if (totalPartsAdded === 0) {
        alert("No parts are currently checked within your selected packs. Please select at least one part.");
        setLoading(false);
        return;
      }

      await batch.commit();

      // Sync imported packs directly to external database
      fetch('/api/sync-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'IMPORT_PACKS_SYNC', payload: { jobCardId: id, parts: addedParts }})
      }).catch(err => console.error("External pack sync failed", err));

      alert(`Successfully imported ${selectedPacks.size} pack(s) containing ${totalPartsAdded} total parts!`);
      
      // Reset state
      setSelectedPacks(new Set());
      setExpandedPacks(new Set());
      setPartsSubTab('single');
    } catch (err) {
      console.error("Error importing packs:", err);
      handleFirestoreError(err, OperationType.CREATE, 'parts');
    } finally {
      setLoading(false);
    }
  };

  const [draggedChecklistIndex, setDraggedChecklistIndex] = useState<number | null>(null);
  const [dragOverChecklistIndex, setDragOverChecklistIndex] = useState<number | null>(null);
  const [isDraggingPartsFile, setIsDraggingPartsFile] = useState(false);
  const [partImportMode, setPartImportMode] = useState<'file' | 'text'>('file');
  const [rawPastedPartsText, setRawPastedPartsText] = useState('');

  useEffect(() => {
    // Listen for cross-origin messages from the embedded Stock Control iframe
    // so they can sync/add data from each other
    const handleMessage = async (event: MessageEvent) => {
      const isAllowedOrigin = (origin: string) => {
        return (
          origin === "https://eret-stock-control-system-701158164534.europe-west1.run.app" ||
          origin === "https://ais-dev-4qpojvk63bpgopi5hpcg6y-842151429169.europe-west2.run.app" ||
          origin === "https://ais-pre-4qpojvk63bpgopi5hpcg6y-842151429169.europe-west2.run.app" ||
          /^https:\/\/ais-[a-z0-9]+-842151429169\.[a-z0-9-]+\.run\.app$/.test(origin)
        );
      };

      if (isAllowedOrigin(event.origin)) {
        try {
          if (event.data && event.data.type === 'ADD_PART') {
            const partData = event.data.payload;
            
            // Generate a temporary ID like the current local part state logic dictates
            const newPart = {
              ...partData,
              id: 'temp-' + Date.now().toString(),
              jobCardId: id || ''
            };
            
            // Add immediately to local state, the save function will handle proper syncing to firebase 
            // when the Job Card is saved, avoiding premature DB commits if the draft isn't saved.
            setJobParts(prev => [...prev, newPart]);
            
            // Optional: acknowledge receipt
            if (event.source) {
              (event.source as Window).postMessage({ type: 'PART_ADDED_ACK', payload: { success: true } }, event.origin);
            }
          }
        } catch (err) {
          console.error("Error processing embedded iframe message:", err);
        }
      }
    };
    
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [id, setJobParts]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isNoteRecording) {
      interval = setInterval(() => {
        setNoteRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setNoteRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isNoteRecording]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      if (noteMediaRecorderRef.current && noteMediaRecorderRef.current.state === 'recording') {
        noteMediaRecorderRef.current.stop();
      }
      if (noteRecordingStreamRef.current) {
        noteRecordingStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const [formData, setFormData] = useState<Partial<JobCard>>({
    jobCardNo: `JC-${Math.floor(100000 + Math.random() * 900000)}`,
    customerCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    status: 'Check-in',
    clientInfo: {
      companyName: '',
      firstName: '',
      surname: '',
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
      driveType: '4x4',
      fuelType: 'Petrol'
    },
    workDetails: {
      workRequested: '',
      workshopNotes: '',
      serviceType: [],
      estimatedCost: 0,
      authorisedCost: 0
    },
    condition: {
      hasDents: false,
      hasScratches: false,
      fuelLevel: '1/2',
      otherNotes: ''
    },
    recordings: [],
    checklist: DEFAULT_CHECKLIST,
    diagnosticsReport: {
      obdScanStatus: 'Not Run',
      dtcCodes: '',
      batteryVoltage: '',
      batteryHealth: '',
      alternatorOutput: '',
      engineCompression: '',
      absStatus: 'Not Inspected',
      airbagsStatus: 'Not Inspected',
      ecuStatus: 'Not Inspected',
      transmissionStatus: 'Not Inspected',
      fuelSystemStatus: 'Not Inspected',
      coolantSystemStatus: 'Not Inspected',
      diagnosticNotes: '',
      technicianName: ''
    }
  });

  // Load initial JobCard data if existing
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (loadingAuth) return;
    if (id && id !== 'new') {
      const fetchJobCard = async () => {
        try {
          const docRef = doc(db, 'jobCards', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setFormData(docSnap.data() as JobCard);
            setRecordings(docSnap.data().recordings || []);
          }
        } catch (err) {
          console.error("Error fetching job card:", err);
        } finally {
          setIsInitialLoadDone(true);
        }
      };
      fetchJobCard();
    } else {
      setIsInitialLoadDone(true);
    }
  }, [id, loadingAuth]);

  // Load admin password for lock gate
  useEffect(() => {
    if (loadingAuth) return;
    if (!id || id === 'new') {
      setFetchingPassword(true);
      const fetchAdminPwd = async () => {
        try {
          const pwdSnap = await getDoc(doc(db, 'settings', 'admin_password'));
          if (pwdSnap.exists()) {
            setAdminPwd(pwdSnap.data().password || 'admin');
          }
        } catch (err) {
          console.error("Error fetching admin password:", err);
        } finally {
          setFetchingPassword(false);
        }
      };
      fetchAdminPwd();
    }
  }, [id, loadingAuth]);

  // Check for restorable draft on mount
  useEffect(() => {
    if (loadingAuth) return;
    const checkDraft = async () => {
      const draftId = id && id !== 'new' ? id : tempDraftId;
      if (!draftId) return;
      try {
        const draftSnap = await getDoc(doc(db, 'jobCardDrafts', draftId));
        if (draftSnap.exists()) {
          const draftData = draftSnap.data();
          // If editing an existing jobCard, only restore if the draft has a newer updatedAt timestamp than actual job card
          if (id && id !== 'new') {
            const actualSnap = await getDoc(doc(db, 'jobCards', id));
            if (actualSnap.exists() && draftData.updatedAt) {
              const actualTime = actualSnap.data().updatedAt?.toMillis?.() || 0;
              const draftTime = draftData.updatedAt?.toMillis?.() || 0;
              if (draftTime > actualTime) {
                setDraftToRestore(draftData);
                setHasDraftToRestore(true);
              }
            }
          } else {
            // New job card creation: any unsaved draft under tempDraftId is fully restorable
            setDraftToRestore(draftData);
            setHasDraftToRestore(true);
          }
        }
      } catch (err) {
        console.error("Error checking draft:", err);
      }
    };
    checkDraft();
  }, [id, tempDraftId, loadingAuth]);

  // Handle restoring of the loaded draft
  const handleRestoreDraft = () => {
    if (draftToRestore) {
      setFormData(draftToRestore);
      if (draftToRestore.recordings) {
        setRecordings(draftToRestore.recordings);
      }
    }
    setHasDraftToRestore(false);
  };

  // Handle discarding the loaded draft
  const handleDiscardDraft = async () => {
    const draftId = id || tempDraftId;
    if (draftId) {
      try {
        await deleteDoc(doc(db, 'jobCardDrafts', draftId));
      } catch (err) {
        console.error("Error discarding draft:", err);
      }
    }
    setHasDraftToRestore(false);
  };

  // Debounced auto-save of formData to temporary Firestore document OR direct save for workshop sessions
  useEffect(() => {
    if (loadingAuth || !isInitialLoadDone) return;

    const draftId = id && id !== 'new' ? id : tempDraftId;
    if (!draftId && !isWorkshopSession) return;

    // We do NOT want to auto-save if saveSuccess is true (draft is already deleted)
    if (saveSuccess) return;

    setDraftSaving(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        if (isWorkshopSession && id && id !== 'new') {
          // In a workshop session, we directly auto-save edits to the live job card in Firestore!
          const { id: _, ...strippedData } = formData;
          await updateDoc(doc(db, 'jobCards', id), {
            ...strippedData,
            updatedAt: serverTimestamp()
          });
          
          // Trigger external sync after live edit
          fetch('/api/sync-external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'JOB_CARD_SYNC', payload: { id, ...strippedData } })
          }).catch(err => console.error("External sync failed", err));

          setLastDraftSavedAt(new Date());
        } else if (draftId) {
          const draftRef = doc(db, 'jobCardDrafts', draftId);
          // Sanitize recordings by removing non-serializable properties like custom blob files
          const sanitizedRecordings = (recordings || []).map(rec => {
            if (!rec) return rec;
            const { blob, ...rest } = rec as any;
            return rest;
          });

          await setDoc(draftRef, {
            ...formData,
            recordings: sanitizedRecordings,
            updatedAt: serverTimestamp(),
            isDraft: true
          });
          setLastDraftSavedAt(new Date());
        }
      } catch (err) {
        console.error("Draft / Workshop auto-save error:", err);
      } finally {
        setDraftSaving(false);
      }
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [formData, recordings, id, tempDraftId, isInitialLoadDone, saveSuccess, loadingAuth, isWorkshopSession]);

  useEffect(() => {
    if (loadingAuth) return;
    if (id) {
      const q = query(collection(db, 'parts'), where('jobCardId', '==', id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setJobParts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Part)));
      }, (err) => {
        console.error("Parts listener error:", err);
      });
      return () => unsubscribe();
    }
  }, [id, loadingAuth]);

  useEffect(() => {
    if (loadingAuth) return;
    if (id) {
      const q = query(
        collection(db, 'jobCards', id, 'notes'),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setJobNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobNote)));
      }, (err) => {
        console.error("Notes listener error:", err);
      });
      return () => unsubscribe();
    }
  }, [id, loadingAuth]);

  useEffect(() => {
    if (loadingAuth) return;
    const q = query(collection(db, 'technicians'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician)));
    }, (err) => {
      console.error("Technicians listener error:", err);
    });

    const handleAIFill = (e: any) => {
      const details = e.detail;
      setFormData(prev => ({
        ...prev,
        clientInfo: {
          ...prev.clientInfo,
          firstName: details.firstName || prev.clientInfo?.firstName || '',
          surname: details.surname || prev.clientInfo?.surname || '',
        },
        vehicleDetails: {
          ...prev.vehicleDetails,
          registrationNo: details.registrationNo || prev.vehicleDetails?.registrationNo || '',
          make: details.make || prev.vehicleDetails?.make || '',
          model: details.model || prev.vehicleDetails?.model || '',
          kmIn: details.kmIn || prev.vehicleDetails?.kmIn || '',
        },
        workDetails: {
          ...prev.workDetails,
          workRequested: details.workRequested || prev.workDetails?.workRequested || '',
        }
      }));
    };

    window.addEventListener('eret_fill_form', handleAIFill);

    return () => {
      unsubscribe();
      window.removeEventListener('eret_fill_form', handleAIFill);
    };
  }, []);  const handleOpenInvoiceRequest = async () => {
    setFetchingPin(true);
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'workshop'));
      if (docSnap.exists() && docSnap.data().pin) {
        setPinToCheck(docSnap.data().pin.toString().trim());
      } else {
        setPinToCheck('1234');
      }
    } catch (err) {
      console.error("Error loaded pin info:", err);
      setPinToCheck('1234');
    } finally {
      setFetchingPin(false);
      setShowPinCheckModal(true);
      setEnteredPin('');
      setPinCheckError('');
    }
  };

  const handleVerifyInvoicePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin.trim() === pinToCheck.trim()) {
      setShowPinCheckModal(false);
      setShowInvoiceModal(true);
    } else {
      setPinCheckError('Incorrect Workshop PIN. Access Denied.');
    }
  };

  const handleVerifyNewJcPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockPwd.trim() === adminPwd.trim()) {
      setIsNewJobCardUnlocked(true);
      sessionStorage.setItem('new_jc_unlocked', 'true');
    } else {
      setUnlockError('Incorrect Admin Password. Creation Denied.');
    }
  };
  const handleSave = async () => {
    setLoading(true);
    setSaveSuccess(false);
    setVideoUploadProgress(null);
    try {
      let jobId = id;
      if (!jobId || jobId === 'new') {
        // Pre-create/get collection reference so we have a standard ID for storage
        const newDocRef = doc(collection(db, 'jobCards'));
        jobId = newDocRef.id;
      }

      // 1. Upload new recordings to Firebase Storage first (if any have blob)
      const uploadedRecordings = await Promise.all(
        recordings.map(async (rec, idx) => {
          const castRec = rec as any;
          if (castRec.blob) {
            setVideoUploadProgress(`Uploading Video ${idx + 1}/${recordings.length}...`);
            
            const timestamp = Date.now();
            const originalBlob = castRec.blob;
            const mimeType = originalBlob?.type || 'video/webm';
            const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
            
            // Upload main video blob (originally recorded)
            const videoStorageRef = ref(storage, `jobCards/${jobId}/videos/${timestamp}-${idx}.${fileExt}`);
            await uploadBytes(videoStorageRef, originalBlob, { contentType: mimeType });
            const videoUrl = await getDownloadURL(videoStorageRef);
            
            // Upload thumbnail blob if stored as dataURL base64 string
            let finalThumbnailUrl = castRec.thumbnail;
            if (castRec.thumbnail && castRec.thumbnail.startsWith('data:')) {
              try {
                const thumbBlob = dataURLtoBlob(castRec.thumbnail);
                const thumbStorageRef = ref(storage, `jobCards/${jobId}/thumbnails/${timestamp}-${idx}.jpg`);
                await uploadBytes(thumbStorageRef, thumbBlob);
                finalThumbnailUrl = await getDownloadURL(thumbStorageRef);
              } catch (thumbErr) {
                console.error("Failed to upload thumbnail:", thumbErr);
              }
            }
            
            return {
              url: videoUrl,
              thumbnail: finalThumbnailUrl,
              description: castRec.description || '',
              type: castRec.type || 'check-in'
            };
          }
          // Already uploaded or not newly recorded
          return {
            url: rec.url,
            thumbnail: rec.thumbnail,
            description: rec.description || '',
            type: rec.type || 'check-in'
          };
        })
      );

      // Now set recordings state to the final cloud URLs to avoid keeping local blob: URLs
      setRecordings(uploadedRecordings);

      // Strip ID from data being written directly to the document
      const { id: _, ...strippedData } = formData;
      const data = {
        ...strippedData,
        recordings: uploadedRecordings,
        updatedAt: serverTimestamp(),
      };

      if (id && id !== 'new') {
        await updateDoc(doc(db, 'jobCards', id), data);
        if (formData.customerCode) {
          await setDoc(doc(db, 'customerCodes', formData.customerCode.trim().toUpperCase()), {
            jobCardId: id,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      } else {
        await setDoc(doc(db, 'jobCards', jobId), {
          ...data,
          createdAt: serverTimestamp(),
        });
        if (formData.customerCode) {
          await setDoc(doc(db, 'customerCodes', formData.customerCode.trim().toUpperCase()), {
            jobCardId: jobId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      }

      // Sync job card to external app directly using proxy
      const syncData = { ...data };
      delete syncData.updatedAt;
      delete syncData.createdAt;
      
      fetch('/api/sync-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'JOB_CARD_SYNC', payload: { id: jobId, ...syncData } })
      }).catch(err => console.error("External sync failed", err));

      // Clear draft on successful save
      const draftId = id && id !== 'new' ? id : tempDraftId;
      if (draftId) {
        try {
          await deleteDoc(doc(db, 'jobCardDrafts', draftId));
        } catch (draftErr) {
          console.warn("Could not delete draft on save:", draftErr);
        }
      }
      if (!id || id === 'new') {
        localStorage.removeItem('new_job_card_draft_id');
        // Removed automatic customer code WhatsApp dispatch to allow manual execution.
      } else {
        if (formData.status === 'Ready for Collection' || formData.status === 'Completed') {
          triggerNotificationSimulation({
            id: id || '',
            ...formData
          } as JobCard);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        navigate('/admin/dashboard');
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'jobCards');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJobCard = () => {
    if (!id) return;
    setConfirmModalConfig({
      isOpen: true,
      title: "Delete Job Card?",
      message: "Are you sure you want to delete this job card? This action will permanently remove all associated parts, notes, and records, and cannot be undone.",
      confirmText: "Delete Permanently",
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          const { writeBatch, getDocs } = await import('firebase/firestore');
          const batch = writeBatch(db);
          
          // 1. Fetch and delete associated parts
          const partsQ = query(collection(db, 'parts'), where('jobCardId', '==', id));
          const partsSnap = await getDocs(partsQ);
          partsSnap.forEach(p => batch.delete(doc(db, `parts/${p.id}`)));
          
          // 2. Fetch and delete associated notes
          const notesQ = collection(db, `jobCards/${id}/notes`);
          const notesSnap = await getDocs(notesQ);
          notesSnap.forEach(n => batch.delete(doc(db, `jobCards/${id}/notes/${n.id}`)));

          // 3. Delete the job card document itself
          batch.delete(doc(db, `jobCards/${id}`));

          await batch.commit();
          navigate('/admin/dashboard');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `jobCards/${id}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleAddPart = async () => {
    if (!id || !newPart.name) return;
    setLoading(true);
    try {
      const partDataParams = {
        ...newPart,
        jobCardId: id
      };
      const docRef = await addDoc(collection(db, 'parts'), {
        ...partDataParams,
        addedAt: serverTimestamp()
      });
      
      // Sync to external app db directly using proxy
      fetch('/api/sync-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ADD_PART_TO_JOB', payload: { id: docRef.id, ...partDataParams, addedAt: new Date().toISOString() } })
      }).catch(err => console.error("External sync failed", err));

      setNewPart({ name: '', quantity: 1, price: 0, description: '' });
      setIsAddingPart(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'parts');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePart = (partId: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: "Remove Part?",
      message: "Are you sure you want to remove this part from the job card? This action cannot be undone.",
      confirmText: "Remove Part",
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          await deleteDoc(doc(db, 'parts', partId));
          fetch('/api/sync-external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'DELETE_PART', payload: { id: partId, jobCardId: id } })
          }).catch(err => console.error("External sync failed", err));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'parts');
        } finally {
          setLoading(false);
         }
      }
    });
  };

  const handleAddNote = async () => {
    if (!id || !newNoteText.trim() || !user) return;
    setLoading(true);
    
    // Stop recording when posting note

    try {
      await addDoc(collection(db, 'jobCards', id, 'notes'), {
        jobCardId: id,
        text: newNoteText,
        authorName: user.displayName || user.email?.split('@')[0] || 'Admin',
        authorEmail: user.email || '',
        createdAt: serverTimestamp()
      });
      setNewNoteText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVoiceNote = async (audioUrl: string, durationSec: number) => {
    if (!id || !user) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'jobCards', id, 'notes'), {
        jobCardId: id,
        text: '🎤 Voice Note',
        authorName: user.displayName || user.email?.split('@')[0] || 'Admin',
        authorEmail: user.email || '',
        createdAt: serverTimestamp(),
        audioUrl,
        audioDuration: durationSec
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notes');
    } finally {
      setLoading(false);
    }
  };

  const startNoteRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser or connection does not support audio recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      noteRecordingStreamRef.current = stream;
      noteAudioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      noteMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          noteAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(noteAudioChunksRef.current, { type: 'audio/webm' });
        
        // Convert Blob to Base64 data URL
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          // Capture duration
          handleAddVoiceNote(base64Audio, noteRecordingDuration || 1);
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsNoteRecording(true);
      setNoteRecordingDuration(0);

    } catch (err) {
      console.error("Failed to access microphone:", err);
      alert("Could not access your microphone. Please verify permission settings.");
    }
  };

  const stopAndSendNoteRecording = () => {
    if (noteMediaRecorderRef.current && noteMediaRecorderRef.current.state !== 'inactive') {
      noteMediaRecorderRef.current.stop();
    }
    setIsNoteRecording(false);
  };

  const cancelNoteRecording = () => {
    if (noteMediaRecorderRef.current) {
      noteMediaRecorderRef.current.onstop = null;
      if (noteMediaRecorderRef.current.state !== 'inactive') {
        noteMediaRecorderRef.current.stop();
      }
    }
    if (noteRecordingStreamRef.current) {
      noteRecordingStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsNoteRecording(false);
    setNoteRecordingDuration(0);
  };

  const runStockMatching = async () => {
    setSyncStatus('matching');
    setSyncError(null);
    setShowSyncStockModal(true);
    try {
      const response = await fetch('/api/external-inventory');
      if (!response.ok) {
        throw new Error(`Failed to fetch external inventory (Status ${response.status})`);
      }
      const result = await safeFetchJson(response);
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Invalid response format from external inventory system.");
      }
      
      const inventoryList = result.data;
      const matchedList: Array<{ part: Part; stockItem: any; newQty: number }> = [];
      const unmatchedList: Array<{ part: Part; autoCreate: boolean }> = [];
      
      for (const part of jobParts) {
        // Look for custom match (exact name, sku, or close substring)
        const matchedItem = inventoryList.find((item: any) => 
          (item.name || '').toLowerCase().trim() === (part.name || '').toLowerCase().trim() ||
          (item.sku || '').toLowerCase().trim() === (part.name || '').toLowerCase().trim()
        );
        
        if (matchedItem) {
          matchedList.push({
            part,
            stockItem: matchedItem,
            newQty: Math.max(0, (matchedItem.quantity || 0) - part.quantity)
          });
        } else {
          unmatchedList.push({
            part,
            autoCreate: true
          });
        }
      }
      
      setSyncReport({
        matched: matchedList,
        unmatched: unmatchedList
      });
      setSyncStatus('matched');
    } catch (err: any) {
      console.error("Match stock error:", err);
      setSyncError(err.message || String(err));
      setSyncStatus('error');
    }
  };

  const executeStockSync = async () => {
    if (!syncReport) return;
    setSyncStatus('syncing');
    setSyncError(null);
    
    let synced = 0;
    let created = 0;
    let failed = 0;
    const transactionsList: Array<{
      partName: string;
      quantityDeducted: number;
      sku: string;
      technicianId: string;
      technicianName: string;
      action: string;
      itemId: string;
      timestamp: string;
    }> = [];
    
    try {
      // 1. Sync matched stock items
      for (const item of syncReport.matched) {
        try {
          const qtyRemaining = item.newQty;
          
          // PUT update to inventory
          const updateRes = await fetch(`/api/external-inventory/${item.stockItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: item.stockItem.sku,
              name: item.stockItem.name,
              category: item.stockItem.category || 'Spares',
              quantity: qtyRemaining,
              threshold: item.stockItem.threshold || 2,
              price: item.stockItem.price
            })
          });
          
          if (!updateRes.ok) throw new Error("Inventory allocation save failed");

          // POST allocate transaction
          await fetch('/api/external-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantityChange: item.part.quantity,
              itemId: item.stockItem.id,
              timestamp: new Date().toISOString(),
              action: 'DEDUCT',
              itemName: item.part.name,
              type: 'JOB_CARD_ALLOCATION',
              clientName: formData?.clientName || 'Job Card Client',
              workerName: user?.displayName || user?.email?.split('@')[0] || 'Technician'
            })
          });
          
          transactionsList.push({
            partName: item.part.name,
            quantityDeducted: item.part.quantity,
            sku: item.stockItem.sku,
            technicianId: user?.uid || 'N/A',
            technicianName: user?.displayName || user?.email?.split('@')[0] || 'Technician',
            action: 'DEDUCT',
            itemId: item.stockItem.id,
            timestamp: new Date().toISOString()
          });

          synced++;
        } catch (e) {
          console.error(`Failed to update item ${item.part.name}:`, e);
          failed++;
        }
      }
      
      // 2. Provision unmatched items with autoCreate
      for (const item of syncReport.unmatched) {
        if (!item.autoCreate) {
          continue;
        }
        
        try {
          const generatedSku = `ER-AUTO-${Math.floor(1000 + Math.random() * 9000)}`;
          
          // POST create new stock item
          const createRes = await fetch('/api/external-inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: generatedSku,
              name: item.part.name,
              category: 'Spares',
              quantity: 0,
              threshold: 1,
              price: item.part.price
            })
          });
          
          if (!createRes.ok) throw new Error("Auto-creation of spare item failed");
          const createdData = await safeFetchJson(createRes);
          const newItemId = createdData?.data?.id || String(Date.now() + Math.random());
          
          // POST allocation transaction for created item
          await fetch('/api/external-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantityChange: item.part.quantity,
              itemId: newItemId,
              timestamp: new Date().toISOString(),
              action: 'ALLOCATE',
              itemName: item.part.name,
              type: 'JOB_CARD_ALLOCATION',
              clientName: formData?.clientName || 'Job Card Client',
              workerName: user?.displayName || user?.email?.split('@')[0] || 'Technician'
            })
          });
          
          transactionsList.push({
            partName: item.part.name,
            quantityDeducted: item.part.quantity,
            sku: generatedSku,
            technicianId: user?.uid || 'N/A',
            technicianName: user?.displayName || user?.email?.split('@')[0] || 'Technician',
            action: 'ALLOCATE',
            itemId: newItemId,
            timestamp: new Date().toISOString()
          });

          created++;
        } catch (e) {
          console.error(`Failed to auto-create part ${item.part.name}:`, e);
          failed++;
        }
      }
      
      setSyncSummary({
        syncedCount: synced,
        createdCount: created,
        failedCount: failed,
        transactions: transactionsList
      });
      setSyncStatus('completed');
    } catch (err: any) {
      console.error("Execute stock sync error:", err);
      setSyncError(err.message || String(err));
      setSyncStatus('error');
    }
  };

  const handleRemoveNote = (noteId: string) => {
    if (!id) return;
    setConfirmModalConfig({
      isOpen: true,
      title: "Delete Internal Update?",
      message: "Are you sure you want to delete this internal update? This action cannot be undone.",
      confirmText: "Delete Note",
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          await deleteDoc(doc(db, 'jobCards', id, 'notes', noteId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'notes');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const generateThumbnail = (videoUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';

      let resolved = false;

      const captureFrame = () => {
        if (resolved) return;
        resolved = true;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          video.pause();
          video.src = '';
          video.load();
          resolve(thumbnail);
        } else {
          resolve('');
        }
      };

      video.onloadedmetadata = () => {
        // Seek slightly into the video (0.5 seconds) to avoid initial camera startup blank frame
        video.currentTime = Math.min(0.5, video.duration || 0.5);
      };

      video.onseeked = () => {
        captureFrame();
      };

      video.onloadeddata = () => {
        // Fallback in case seeked doesn't fire as expected
        setTimeout(() => {
          if (!resolved) {
            captureFrame();
          }
        }, 1500);
      };

      video.onerror = (err) => {
        console.error("Error loading video for thumbnail generation:", err);
        if (!resolved) {
          resolved = true;
          resolve('');
        }
      };
    });
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      let stream: MediaStream;
      try {
        // Try requesting with audio first
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (audioErr) {
        console.warn("Could not retrieve stream with audio (likely due to missing microphone). Requesting video only...", audioErr);
        // Fallback to video only
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      let options = {};
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=h264',
        'video/mp4'
      ];
      let selectedMimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        for (const mime of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mime)) {
            options = { mimeType: mime };
            selectedMimeType = mime;
            break;
          }
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const mime = mediaRecorder.mimeType || selectedMimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        const thumbnail = await generateThumbnail(url);
        setRecordings(prev => [...prev, { url, thumbnail, blob, type: recordingType } as any]);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Camera access denied:", err);
      setCameraError(err.message || "Failed to access camera or microphone. Please verify device and page permissions.");
    }
  };

  const stopCamera = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const updateNestedField = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section as keyof typeof prev] as any),
        [field]: value
      }
    }));
  };

  const updateDiagnosticField = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      diagnosticsReport: {
        ...(prev.diagnosticsReport || {
          obdScanStatus: 'Not Run',
          dtcCodes: '',
          batteryVoltage: '',
          batteryHealth: '',
          alternatorOutput: '',
          engineCompression: '',
          absStatus: 'Not Inspected',
          airbagsStatus: 'Not Inspected',
          ecuStatus: 'Not Inspected',
          transmissionStatus: 'Not Inspected',
          fuelSystemStatus: 'Not Inspected',
          coolantSystemStatus: 'Not Inspected',
          diagnosticNotes: '',
          technicianName: ''
        }),
        [field]: value
      }
    }));
  };

  const toggleChecklistItem = (itemId: string) => {
    setFormData(prev => {
      const newChecklist = (prev.checklist || []).map(item => {
        if (item.id === itemId) {
          const completed = !item.completed;
          return {
            ...item,
            completed,
            completedAt: completed ? new Date() : null,
            completedBy: completed ? (user?.displayName || user?.email || 'Technician') : null
          };
        }
        return item;
      });
      return { ...prev, checklist: newChecklist };
    });
  };

  const handleChecklistDragStart = (e: React.DragEvent, index: number) => {
    setDraggedChecklistIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleChecklistDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverChecklistIndex !== index) {
      setDragOverChecklistIndex(index);
    }
  };

  const handleChecklistDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedChecklistIndex === null) return;
    
    const checklist = [...(formData.checklist || DEFAULT_CHECKLIST)];
    const draggedItem = checklist[draggedChecklistIndex];
    
    checklist.splice(draggedChecklistIndex, 1);
    checklist.splice(index, 0, draggedItem);
    
    setFormData(prev => ({
      ...prev,
      checklist
    }));
    setDraggedChecklistIndex(null);
    setDragOverChecklistIndex(null);
  };

  const parseAndImportPartsFile = async (file: File) => {
    if (!id) {
      alert("Please save the job card before importing parts.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        let parsedParts: Array<{ name: string; quantity?: number; price?: number; description?: string }> = [];
        
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text);
          parsedParts = Array.isArray(data) ? data : [data];
        } else if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
          const lines = text.split('\n');
          lines.forEach(line => {
            if (!line.trim()) return;
            const parts = line.split(/[;,\t]/);
            if (parts.length > 0 && parts[0].trim()) {
              const name = parts[0].trim();
              const quantity = parts[1] ? parseInt(parts[1].trim()) || 1 : 1;
              const price = parts[2] ? parseFloat(parts[2].trim()) || 0 : 0;
              const description = parts[3] ? parts[3].trim() : '';
              parsedParts.push({ name, quantity, price, description });
            }
          });
        } else {
          alert('Unsupported file format. Please upload a .json, .csv, or .txt file containing parts info.');
          return;
        }

        if (parsedParts.length === 0) {
          alert('No valid parts found in the file.');
          return;
        }

        setLoading(true);
        const { writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        
        parsedParts.forEach(part => {
          const partRef = doc(collection(db, 'parts'));
          batch.set(partRef, {
            name: part.name || 'Unnamed Spares',
            quantity: part.quantity || 1,
            price: part.price || 0,
            description: part.description || '',
            jobCardId: id,
            addedAt: serverTimestamp()
          });
        });

        await batch.commit();
        alert(`Successfully imported ${parsedParts.length} parts!`);
      } catch (err) {
        console.error("Error parsing/importing parts file:", err);
        alert("Failed to parse parts file. Check that the content is valid JSON or CSV format.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const parseAndImportPastedParts = async () => {
    if (!id) {
      alert("Please save the job card before importing parts.");
      return;
    }

    if (!rawPastedPartsText.trim()) {
      alert("Please enter or paste some parts text.");
      return;
    }

    try {
      const lines = rawPastedPartsText.split('\n');
      const parsedParts: Array<{ name: string; quantity?: number; price?: number; description?: string }> = [];

      lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(/[;,\t]/);
        if (parts.length > 0 && parts[0].trim()) {
          const name = parts[0].trim();
          const quantity = parts[1] ? parseInt(parts[1].trim()) || 1 : 1;
          const price = parts[2] ? parseFloat(parts[2].trim()) || 0 : 0;
          const description = parts[3] ? parts[3].trim() : '';
          parsedParts.push({ name, quantity, price, description });
        }
      });

      if (parsedParts.length === 0) {
        alert("No valid parts found. Please form your text lines as: Name, Quantity, Price, Optional Description");
        return;
      }

      setLoading(true);
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);

      parsedParts.forEach(part => {
        const partRef = doc(collection(db, 'parts'));
        batch.set(partRef, {
          name: part.name || 'Unnamed Spares',
          quantity: part.quantity || 1,
          price: part.price || 0,
          description: part.description || '',
          jobCardId: id,
          addedAt: serverTimestamp()
        });
      });

      await batch.commit();
      alert(`Successfully imported ${parsedParts.length} parts from pasted text!`);
      setRawPastedPartsText('');
    } catch (err) {
      console.error("Error parsing/importing pasted parts text:", err);
      alert("Failed to parse and import pasted parts text. Check formatting.");
    } finally {
      setLoading(false);
    }
  };

  const handlePartsFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPartsFile(true);
  };

  const handlePartsFileDragLeave = () => {
    setIsDraggingPartsFile(false);
  };

  const handlePartsFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPartsFile(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      parseAndImportPartsFile(files[0]);
    }
  };

  const tabs = [
    { id: 'client', label: 'Client Info' },
    { id: 'vehicle', label: 'Vehicle Details' },
    { id: 'work', label: 'Work Requested' },
    { id: 'checklist', label: 'Service Checklist' },
    { id: 'condition', label: 'Condition & Video' }
  ];

  if ((!id || id === 'new') && !isNewJobCardUnlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl border border-slate-150 flex flex-col items-center text-center relative overflow-hidden animate-[fade-in_0.4s_ease-out-back]"
        >
          {/* Accent header */}
          <div className="absolute top-0 inset-x-0 h-2 bg-[#cc0000]" />
          
          <div className="w-20 h-20 bg-red-50/50 rounded-full flex items-center justify-center mb-6 text-[#cc0000] border border-red-100 shadow-inner">
            <KeyRound className="h-10 w-10 text-red-600 animate-pulse" />
          </div>
          
          <h2 className="text-3xl font-black text-slate-950 tracking-tight">Create Job Card</h2>
          <div className="mt-1.5 flex justify-center">
            <p className="text-[10px] font-mono font-black text-[#cc0000] uppercase tracking-widest bg-red-50 px-3 py-1 rounded-full border border-red-100 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping shrink-0" />
              <span>Security Protected Area</span>
            </p>
          </div>
          <p className="text-sm text-slate-500 mt-4 mb-8 max-w-sm">
            You are attempting to create a new job card. Please provide the <strong>Admin Password</strong> to gain access and begin.
          </p>
          
          <form onSubmit={handleVerifyNewJcPassword} className="w-full space-y-4">
            <div className="relative">
              <input 
                type="password"
                value={unlockPwd}
                onChange={(e) => setUnlockPwd(e.target.value)}
                placeholder="Enter Admin Password"
                className="w-full px-5 py-4 pl-12 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:ring-2 focus:ring-[#cc0000] outline-none font-sans font-medium transition-all"
                autoFocus
                required
              />
              <KeyRound className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
            </div>
            
            {unlockError && (
              <p className="text-xs text-red-600 font-bold bg-red-50 py-2.5 rounded-xl border border-red-100">
                {unlockError}
              </p>
            )}
            
            <div className="flex gap-4 pt-2">
              <Link 
                to="/admin" 
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all cursor-pointer text-xs uppercase tracking-widest text-center"
              >
                Go Back
              </Link>
              <button 
                type="submit"
                disabled={fetchingPassword}
                className="flex-1 py-4 bg-[#cc0000] hover:bg-black text-white font-black rounded-2xl transition-all cursor-pointer shadow-lg shadow-red-900/10 text-xs uppercase tracking-widest"
              >
                {fetchingPassword ? 'Loading...' : 'Authorise Screen'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto space-y-6 pb-20"
    >
      {hasDraftToRestore && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-[#cc0000]/10 border border-[#cc0000]/20 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#cc0000]/20 text-[#cc0000] rounded-xl">
              <ClockIcon className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <p className="text-[#cc0000] font-bold text-sm">Unsaved draft detected</p>
              <p className="text-slate-500 text-xs font-semibold">
                We found a temporarily auto-saved draft of this job card. Would you like to restore it?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={handleRestoreDraft}
              className="px-4 py-2 bg-[#cc0000] hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
            >
              Restore Draft
            </button>
            <button 
              onClick={handleDiscardDraft}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl text-xs transition-all"
            >
              Discard
            </button>
          </div>
        </motion.div>
      )}

      {isWorkshopSession && (
        <div className="bg-amber-50 border border-amber-250 text-amber-900 p-5 rounded-2xl flex items-start gap-4 text-xs font-semibold shadow-sm mb-6 max-w-4xl">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-extrabold text-[#cc0000] uppercase tracking-wider">Technician View Mode (Read-Only)</div>
            <div className="leading-relaxed">
              You are currently logged in as workshop staff. This job card has been assigned by the Office Admin and cannot be directly modified or customized here. 
              To submit feedback, progress updates, or technician notes regarding this vehicle, please use the internal <strong>Workshop Chat</strong> system.
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium">
          <ArrowLeft className="h-5 w-5" /> Back
        </button>
        <div className="flex items-center gap-4">
          {draftSaving ? (
            <span className="text-xs text-slate-400 flex items-center gap-1.5 font-semibold">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#cc0000]" />
              Auto-saving draft...
            </span>
          ) : lastDraftSavedAt ? (
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm" />
              Draft saved {format(lastDraftSavedAt, 'HH:mm:ss')}
            </span>
          ) : null}
          <span className="text-sm font-bold text-slate-400">STATUS:</span>
          <select 
            value={formData.status}
            disabled={isWorkshopSession}
            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as JobStatus }))}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm font-bold shadow-sm focus:ring-2 focus:ring-[#cc0000] outline-none disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option>Check-in</option>
            <option>In Progress</option>
            <option>Awaiting Parts</option>
            <option>Quality Control</option>
            <option>Ready for Collection</option>
            <option>Completed</option>
          </select>
          {id && isAdmin && !isWorkshopSession && (
            <button 
              onClick={handleDeleteJobCard}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
              <span>Delete Job Card</span>
            </button>
          )}
          {!isWorkshopSession && (
            <Link
              to="/admin/parts"
              className="flex items-center gap-2 px-5 py-2 bg-purple-50 hover:bg-purple-100/80 text-purple-700 font-bold rounded-xl border border-purple-200 shadow-sm transition-all cursor-pointer text-sm"
              title="Open Parts & Stock Control System"
            >
              <Box className="h-4 w-4 text-purple-600" />
              <span>Parts &amp; Stock Control</span>
            </Link>
          )}
          {id && (
            <button
              onClick={handleOpenInvoiceRequest}
              disabled={fetchingPin}
              className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-xl border border-slate-800 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <FileText className="h-5 w-5 text-red-500 animate-pulse" />
              <span>{fetchingPin ? 'Loading PIN...' : 'Generate Invoice'}</span>
            </button>
          )}
          <button 
            onClick={handleSave}
            disabled={loading || saveSuccess}
            className={`flex items-center gap-2 px-6 py-2 ${saveSuccess ? 'bg-green-600' : 'bg-[#cc0000] hover:bg-[#b30000]'} text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 min-w-[160px] justify-center`}
          >
            {saveSuccess ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Saved!
              </motion.div>
            ) : (
              <>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                <span>{videoUploadProgress || (loading ? 'Saving...' : 'Save Job Card')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <div className="flex bg-slate-50 border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-8 py-4 text-sm font-bold tracking-tight transition-all border-b-2 whitespace-nowrap relative ${
                activeTab === tab.id 
                  ? 'text-[#cc0000] bg-white' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-[#cc0000]"
                />
              )}
            </button>
          ))}
        </div>

        <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 shadow-sm">
              <Hash className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Job Card Number</div>
              <div className="text-sm font-black text-slate-900 leading-none">{formData.jobCardNo}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#cc0000]/10 border border-[#cc0000]/20 rounded-lg flex items-center justify-center text-[#cc0000] shadow-sm">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#cc0000] uppercase tracking-widest leading-none mb-1">Customer Login Code</div>
              <div className="text-sm font-black text-slate-900 leading-none tracking-widest">{formData.customerCode}</div>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              const text = `Vehicle Status Access\nJob Card: #${formData.jobCardNo}\nLogin Code: ${formData.customerCode}\nTrack here: ${window.location.origin}/customer/login`;
              navigator.clipboard.writeText(text);
              triggerToast('Access details copied to clipboard!', 'info');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
          >
            <Plus className="h-3 w-3" /> Copy Access Info
          </button>
          <button 
            type="button"
            onClick={() => {
              triggerNotificationSimulation({
                id: id && id !== 'new' ? id : (tempDraftId || 'temp-id'),
                ...formData,
                isNewCreation: true
              } as any);
              triggerToast(`Manual WhatsApp/SMS dispatch triggered for Code ${formData.customerCode}!`, 'success');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/10"
          >
            <Send className="h-3 w-3" /> Send Code (WhatsApp)
          </button>
          <div className="ml-auto text-[10px] p-2 bg-blue-50 text-blue-600 rounded-lg font-bold uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            Automatically Generated
          </div>
        </div>

        <div className="p-8 min-h-[500px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <fieldset 
                disabled={isWorkshopSession && (activeTab === 'client' || activeTab === 'vehicle')} 
                className={`w-full ${isWorkshopSession && (activeTab === 'client' || activeTab === 'vehicle') ? "pointer-events-none opacity-[0.88] select-none" : ""}`}
              >
                {activeTab === 'client' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Client Identity</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company Name</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none"
                    value={formData.clientInfo?.companyName}
                    onChange={(e) => updateNestedField('clientInfo', 'companyName', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">First Name</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none"
                      value={formData.clientInfo?.firstName}
                      onChange={(e) => updateNestedField('clientInfo', 'firstName', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Surname</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none"
                      value={formData.clientInfo?.surname}
                      onChange={(e) => updateNestedField('clientInfo', 'surname', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none"
                    value={formData.clientInfo?.email}
                    onChange={(e) => updateNestedField('clientInfo', 'email', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Contact & Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telephone</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none"
                      value={formData.clientInfo?.tel}
                      onChange={(e) => updateNestedField('clientInfo', 'tel', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cell Phone</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none"
                      value={formData.clientInfo?.cell}
                      onChange={(e) => updateNestedField('clientInfo', 'cell', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Postal Address</label>
                  <textarea 
                    rows={3}
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none resize-none"
                    value={formData.clientInfo?.address}
                    onChange={(e) => updateNestedField('clientInfo', 'address', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vehicle' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Specifications</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Make</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.make}
                      onChange={(e) => updateNestedField('vehicleDetails', 'make', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Model</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.model}
                      onChange={(e) => updateNestedField('vehicleDetails', 'model', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Year</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.year}
                      onChange={(e) => updateNestedField('vehicleDetails', 'year', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.color}
                      onChange={(e) => updateNestedField('vehicleDetails', 'color', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Registration No</label>
                  <input 
                    className="w-full p-3 font-mono bg-slate-50 border border-slate-100 rounded-xl uppercase"
                    value={formData.vehicleDetails?.registrationNo}
                    onChange={(e) => updateNestedField('vehicleDetails', 'registrationNo', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Odometer & Engine</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Odometer (IN)</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.odometerIn}
                      onChange={(e) => updateNestedField('vehicleDetails', 'odometerIn', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Odometer (OUT)</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.odometerOut}
                      onChange={(e) => updateNestedField('vehicleDetails', 'odometerOut', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">KM In (Actual)</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                    value={formData.vehicleDetails?.kmIn || ''}
                    onChange={(e) => updateNestedField('vehicleDetails', 'kmIn', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Engine No</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                      value={formData.vehicleDetails?.engineNo}
                      onChange={(e) => updateNestedField('vehicleDetails', 'engineNo', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chassis No / VIN</label>
                    <input 
                      className="w-full p-3 font-mono bg-slate-50 border border-slate-100 rounded-xl uppercase"
                      value={formData.vehicleDetails?.chassisNo}
                      onChange={(e) => updateNestedField('vehicleDetails', 'chassisNo', e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-2">
                   <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Transmission</label>
                      <select 
                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                        value={formData.vehicleDetails?.transmission}
                        onChange={(e) => updateNestedField('vehicleDetails', 'transmission', e.target.value)}
                      >
                        <option>Automatic</option>
                        <option>Manual</option>
                      </select>
                   </div>
                   <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Drive Type</label>
                      <select 
                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                        value={formData.vehicleDetails?.driveType || '4x2'}
                        onChange={(e) => updateNestedField('vehicleDetails', 'driveType', e.target.value)}
                      >
                        <option>4x2</option>
                        <option>4x4</option>
                      </select>
                   </div>
                   <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fuel</label>
                      <select 
                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                        value={formData.vehicleDetails?.fuelType}
                        onChange={(e) => updateNestedField('vehicleDetails', 'fuelType', e.target.value)}
                      >
                        <option>Petrol</option>
                        <option>Diesel</option>
                      </select>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'work' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Work Requested (Customer)</h3>
                  </div>
                  <textarea 
                    rows={6}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-[#cc0000] resize-none font-medium text-sm"
                    placeholder="Describe the issues reported by the client..."
                    value={formData.workDetails?.workRequested}
                    onChange={(e) => updateNestedField('workDetails', 'workRequested', e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Technical Summary</h3>
                  </div>
                  <div className="relative flex-1 group">
                    <textarea 
                      rows={6}
                      className="w-full p-4 bg-red-50/30 border border-red-100 rounded-2xl outline-none focus:ring-2 focus:ring-[#cc0000] resize-none font-medium text-sm transition-all"
                      placeholder="Main technician summary for this job..."
                      value={formData.workDetails?.workshopNotes}
                      onChange={(e) => updateNestedField('workDetails', 'workshopNotes', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3 mb-4">Assignment</h3>
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase mb-1.5 flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 text-[#cc0000]" /> Select Registered Technician
                      </label>
                      <select 
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none font-bold text-slate-700 shadow-sm text-sm"
                        value={formData.assignedTechnician || ''}
                        onChange={(e) => {
                          const techId = e.target.value;
                          const tech = technicians.find(t => t.id === techId);
                          setFormData(prev => ({ 
                            ...prev, 
                            assignedTechnician: techId,
                            assignedTechnicianName: tech ? tech.name : (techId === '' ? '' : prev.assignedTechnicianName)
                          }));
                        }}
                      >
                        <option value="">-- Choose Registered --</option>
                        {technicians.map(tech => (
                          <option key={tech.id} value={tech.id}>{tech.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">
                        Or Type / Edit Technician Name
                      </label>
                      <input 
                        type="text"
                        placeholder="Type standard or custom technician name..."
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none font-bold text-slate-700 shadow-sm text-sm"
                        value={formData.assignedTechnicianName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const matchedTech = technicians.find(t => t.name.toLowerCase() === val.trim().toLowerCase());
                          setFormData(prev => ({
                            ...prev,
                            assignedTechnicianName: val,
                            assignedTechnician: matchedTech ? matchedTech.id : 'custom'
                          }));
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400 font-medium">Allows selecting pre-created profiles or typing custom staff members directly on this job.</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3 mb-4">Job Access</h3>
                  <div className="p-6 bg-slate-900 rounded-2xl text-white">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertCircle className="h-6 w-6 text-yellow-500" />
                      <div className="font-bold text-sm">Customer Login Details</div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Job Card No</div>
                        <div className="text-2xl font-black text-white">#{formData.jobCardNo}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Access Code</div>
                        <div className="text-2xl font-black text-red-500 tracking-widest">{formData.customerCode}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {id && (
                <div className="pt-6 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Linked Parts & Spares</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowEmbedStock(!showEmbedStock)}
                        className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-all flex items-center gap-2"
                      >
                        {isWorkshopSession ? (
                          showEmbedStock ? 'Close Stock Controller Chat' : 'Stock Controller Chat'
                        ) : (
                          showEmbedStock ? 'Close Embedded Stock' : 'Embed Stock Control'
                        )}
                      </button>
                      {!isWorkshopSession && (
                        <a
                          href="https://eret-stock-control-system-701158164534.europe-west1.run.app"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-slate-200 text-slate-800 text-xs font-bold rounded-lg hover:bg-slate-300 transition-all hidden sm:flex items-center gap-2"
                          title="Open in new tab"
                        >
                          Open in New Tab
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={runStockMatching}
                        disabled={jobParts.length === 0}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                        title="Synchronize all spares with external stock catalog in one click"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        One-Click Stock Sync
                      </button>
                      <button 
                        onClick={() => setIsAddingPart(!isAddingPart)}
                        className="px-4 py-2 bg-[#cc0000] text-white text-xs font-bold rounded-lg hover:bg-[#b30000] transition-all flex items-center gap-2"
                      >
                        <Plus className="h-3 w-3" />
                        {isAddingPart ? 'Cancel' : 'Add Part Record'}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showEmbedStock && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: '60vh' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="w-full rounded-2xl overflow-hidden border border-slate-200 shadow-xl bg-slate-50 mb-6"
                      >
                        <iframe 
                          src={isWorkshopSession 
                            ? "https://eret-stock-control-system-701158164534.europe-west1.run.app/chat" 
                            : "https://eret-stock-control-system-701158164534.europe-west1.run.app"
                          }
                          className="w-full h-full border-none"
                          allow="camera; microphone; geolocation"
                          title="External Stock Control System Embedded"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {isAddingPart && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-8 p-6 bg-slate-50/50 border border-slate-200/80 rounded-[2rem] shadow-sm flex flex-col space-y-6"
                    >
                      {/* Sub-tab selection bar */}
                      <div className="flex bg-slate-200/50 p-1 rounded-2xl max-w-xl self-center w-full">
                        <button
                          type="button"
                          onClick={() => setPartsSubTab('single')}
                          className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                            partsSubTab === 'single'
                              ? 'bg-white text-slate-800 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Single Spare Part
                        </button>
                        <button
                          type="button"
                          onClick={() => setPartsSubTab('packs')}
                          className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                            partsSubTab === 'packs'
                              ? 'bg-white text-slate-800 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Assembly Packs & Kits
                        </button>
                        <button
                          type="button"
                          onClick={() => setPartsSubTab('import')}
                          className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                            partsSubTab === 'import'
                              ? 'bg-white text-slate-800 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Bulk / File Import
                        </button>
                      </div>

                      {partsSubTab === 'single' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div className="lg:col-span-2 space-y-4">
                            <div className={`grid grid-cols-1 ${isWorkshopSession ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4`}>
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Part Name</label>
                                <input 
                                  type="text"
                                  placeholder="e.g. Turbo Gasket"
                                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#cc0000]"
                                  value={newPart.name}
                                  onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Quantity</label>
                                <input 
                                  type="number"
                                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#cc0000]"
                                  value={newPart.quantity || 1}
                                  onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
                                />
                              </div>
                              {!isWorkshopSession && (
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Price (R)</label>
                                  <input 
                                    type="number"
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#cc0000]"
                                    value={newPart.price || 0}
                                    onChange={(e) => setNewPart({ ...newPart, price: parseFloat(e.target.value) || 0 })}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description (Optional)</label>
                                <textarea 
                                  rows={2}
                                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#cc0000] resize-none"
                                  placeholder="Brief details about the part..."
                                  value={newPart.description || ''}
                                  onChange={(e) => setNewPart({ ...newPart, description: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Assign Technician (Select or Type)</label>
                                <div className="space-y-2">
                                  <select 
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#cc0000]"
                                    value={newPart.assignedTechnician || ''}
                                    onChange={(e) => {
                                      const techId = e.target.value;
                                      const tech = technicians.find(t => t.id === techId);
                                      setNewPart({ 
                                        ...newPart, 
                                        assignedTechnician: techId,
                                        assignedTechnicianName: tech ? tech.name : (techId === '' ? '' : newPart.assignedTechnicianName)
                                      });
                                    }}
                                  >
                                    <option value="">-- Choose Registered --</option>
                                    {technicians.map(tech => (
                                      <option key={tech.id} value={tech.id}>{tech.name}</option>
                                    ))}
                                  </select>
                                  <input 
                                    type="text"
                                    placeholder="Or type standard or custom technician name..."
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#cc0000]"
                                    value={newPart.assignedTechnicianName || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const matchedTech = technicians.find(t => t.name.toLowerCase() === val.trim().toLowerCase());
                                      setNewPart({
                                        ...newPart,
                                        assignedTechnicianName: val,
                                        assignedTechnician: matchedTech ? matchedTech.id : 'custom'
                                      });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <button 
                              onClick={handleAddPart}
                              disabled={!newPart.name || loading}
                              className="w-full py-3 bg-[#cc0000] text-white font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-900/10 cursor-pointer"
                            >
                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              {loading ? 'Adding...' : 'Add to Job Card'}
                            </button>
                          </div>
                          <div className="flex flex-col justify-center bg-white p-6 rounded-2xl border border-slate-100 space-y-3">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Quick Adding Guide</h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Fill in standard replacement details for unique components. For mass-installations or complete system overalls, see the <strong className="text-[#cc0000] font-bold cursor-pointer hover:underline" onClick={() => setPartsSubTab('packs')}>Assembly Packs</strong> tab to build package setups automatically.
                            </p>
                          </div>
                        </div>
                      )}

                      {partsSubTab === 'packs' && (
                        <div className="space-y-6">
                          <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="max-w-2xl">
                              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">Multi-Pack Integration Hub</h4>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                Select one or more pre-assembled part packs to install on the vehicle. You can customize the unit cost, required quantities, toggle replacement status vs new accessories, and assign specific mechanics prior to adding!
                              </p>
                            </div>
                            {selectedPacks.size > 0 && (
                              <button
                                type="button"
                                onClick={handleImportSelectedPacks}
                                disabled={loading}
                                className="px-6 py-3 bg-[#cc0000] text-white font-bold rounded-xl hover:bg-red-700 transition-all flex items-center gap-2 self-start md:self-auto cursor-pointer shadow-lg shadow-red-900/15"
                              >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Import {selectedPacks.size} Packs Now
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {PART_PACKS.map(pack => {
                              const isSelected = selectedPacks.has(pack.id);
                              const isExpanded = expandedPacks.has(pack.id);
                              const totalCost = pack.parts.reduce((sum, p) => {
                                const custom = packCustomizations[pack.id]?.[p.name];
                                if (custom && !custom.selected) return sum;
                                const qty = custom ? custom.quantity : p.quantity;
                                const pr = custom ? custom.price : p.price;
                                return sum + (qty * pr);
                              }, 0);
                              
                              const activePartsCount = pack.parts.filter(p => {
                                return packCustomizations[pack.id]?.[p.name]?.selected ?? true;
                              }).length;

                              return (
                                <div 
                                  key={pack.id} 
                                  className={`p-5 rounded-3xl bg-white border transition-all duration-300 relative select-none flex flex-col ${
                                    isSelected 
                                      ? 'border-[#cc0000] shadow-[0_12px_40px_-15px_rgba(204,0,0,0.15)] ring-1 ring-[#cc0000]' 
                                      : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-4 mb-3">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest ${
                                      pack.category === 'Engine' ? 'bg-red-50 text-red-600 border border-red-100' :
                                      pack.category === 'Brakes' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                      pack.category === 'Suspension' ? 'bg-sky-50 text-sky-700 border border-sky-100' :
                                      pack.category === 'Performance' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                      'bg-blue-50 text-blue-700 border border-blue-100'
                                    }`}>
                                      {pack.category}
                                    </span>
                                    
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePackSelection(pack.id)}
                                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                          isSelected 
                                            ? 'bg-[#cc0000] border-[#cc0000] text-white shadow-sm' 
                                            : 'border-slate-300 hover:border-[#cc0000] bg-white text-transparent'
                                        }`}
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5 stroke-[3]" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex-1">
                                    <h5 className="font-bold text-slate-800 text-sm leading-tight mb-1.5">{pack.name}</h5>
                                    <p className="text-[11px] text-slate-400 leading-normal mb-4">
                                      {pack.description}
                                    </p>
                                  </div>

                                  <div className="pt-4 border-t border-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-600">
                                    {!isWorkshopSession ? (
                                      <div>
                                        <span className="text-[10px] text-slate-400 block font-normal uppercase tracking-wider">Estimated Total</span>
                                        <span className="text-slate-800 font-extrabold text-xs">R {totalCost.toLocaleString()}</span>
                                      </div>
                                    ) : (
                                      <div />
                                    )}
                                    <div className="text-right">
                                      <span className="text-[10px] text-slate-400 block font-normal uppercase tracking-wider">Active Spares</span>
                                      <span className="text-[#cc0000] font-black">{activePartsCount} / {pack.parts.length} Items</span>
                                    </div>
                                  </div>

                                  <div className="mt-4 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePackExpand(pack.id)}
                                      className={`flex-1 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
                                        isExpanded 
                                          ? 'bg-slate-800 border-slate-800 text-white' 
                                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800'
                                      }`}
                                    >
                                      <Wrench className="h-3 w-3" />
                                      {isExpanded ? 'Hide Spares Info' : 'Customize Parts List'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Extra block for expanded details */}
                          {PART_PACKS.map(pack => {
                            const isExpanded = expandedPacks.has(pack.id);
                            if (!isExpanded) return null;
                            const customizations = packCustomizations[pack.id] || {};

                            return (
                              <motion.div
                                key={`details-${pack.id}`}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md space-y-4"
                              >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                  <div>
                                    <h5 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 bg-[#cc0000] rounded-full inline-block animate-pulse" />
                                      Customizing Spares: {pack.name}
                                    </h5>
                                    <p className="text-[11px] text-slate-400">Include/exclude items, alter their prices, choose replaces vs additions, and set technician scope.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePackSelection(pack.id)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                                      selectedPacks.has(pack.id)
                                        ? 'bg-[#cc0000]/10 border-[#cc0000]/20 text-[#cc0000]'
                                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600'
                                    }`}
                                  >
                                    {selectedPacks.has(pack.id) ? '✓ Package Selected' : '+ Select Package'}
                                  </button>
                                </div>

                                <div className="divide-y divide-slate-100 overflow-x-auto max-w-full">
                                  <table className="w-full text-left border-collapse min-w-[700px]">
                                    <thead>
                                      <tr className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">
                                        <th className="py-2.5 pr-4 w-12 text-center">Use</th>
                                        <th className="py-2.5 px-4 text-left">Spares Item / Role Info</th>
                                        <th className="py-2.5 px-4 w-52 text-left">Is replacing or extra?</th>
                                        <th className="py-2.5 px-4 w-28 text-left">Unit Qty</th>
                                        {!isWorkshopSession && <th className="py-2.5 px-4 w-36 text-left">Unit Price (R)</th>}
                                        <th className="py-2.5 pl-4 w-40 text-left">Assign Specialist</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {pack.parts.map(part => {
                                        const custom = customizations[part.name] || {
                                          selected: true,
                                          quantity: part.quantity,
                                          price: part.price,
                                          action: 'replace',
                                          assignedTechnician: '',
                                          assignedTechnicianName: ''
                                        };

                                        return (
                                          <tr key={part.name} className={`text-slate-700 text-xs transition-colors ${custom.selected ? 'hover:bg-slate-50/50' : 'text-slate-300 bg-slate-50/40'}`}>
                                            <td className="py-3.5 pr-4 text-center">
                                              <input
                                                type="checkbox"
                                                checked={custom.selected}
                                                onChange={(e) => handleUpdatePackPartCustomization(pack.id, part.name, 'selected', e.target.checked)}
                                                className="w-4 h-4 rounded border-slate-300 text-[#cc0000] focus:ring-[#cc0000] cursor-pointer"
                                              />
                                            </td>
                                            <td className="py-3.5 px-4 max-w-[240px]">
                                              <div className={`font-bold leading-snug truncate ${custom.selected ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{part.name}</div>
                                              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{part.description}</div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 max-w-[190px]">
                                                <button
                                                  type="button"
                                                  disabled={!custom.selected}
                                                  onClick={() => handleUpdatePackPartCustomization(pack.id, part.name, 'action', 'replace')}
                                                  className={`flex-1 py-1 px-1.5 text-[9px] font-extrabold uppercase rounded-md transition-all ${
                                                    custom.action === 'replace' && custom.selected
                                                      ? 'bg-slate-700 text-white shadow-sm'
                                                      : 'text-slate-400 hover:text-slate-600 disabled:opacity-40'
                                                  }`}
                                                >
                                                  Replacing
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={!custom.selected}
                                                  onClick={() => handleUpdatePackPartCustomization(pack.id, part.name, 'action', 'add')}
                                                  className={`flex-1 py-1 px-1.5 text-[9px] font-extrabold uppercase rounded-md transition-all ${
                                                    custom.action === 'add' && custom.selected
                                                      ? 'bg-[#cc0000] text-white shadow-sm'
                                                      : 'text-slate-400 hover:text-slate-600 disabled:opacity-40'
                                                  }`}
                                                >
                                                  Add Extra
                                                </button>
                                              </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                              <div className="flex items-center gap-1">
                                                <input
                                                  type="number"
                                                  disabled={!custom.selected}
                                                  value={custom.quantity}
                                                  onChange={(e) => handleUpdatePackPartCustomization(pack.id, part.name, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                                  className="w-16 p-1 text-center bg-slate-50 border border-slate-200 rounded-md text-xs font-bold outline-none focus:ring-1 focus:ring-[#cc0000]"
                                                />
                                              </div>
                                            </td>
                                            {!isWorkshopSession && (
                                              <td className="py-3.5 px-4">
                                                <input
                                                  type="number"
                                                  disabled={!custom.selected}
                                                  value={custom.price}
                                                  onChange={(e) => handleUpdatePackPartCustomization(pack.id, part.name, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                                                  className="w-24 p-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-[#cc0000]"
                                                />
                                              </td>
                                            )}
                                            <td className="py-3.5 pl-4">
                                              <select
                                                disabled={!custom.selected}
                                                className="w-full p-1 bg-slate-50 border border-slate-200 rounded-md text-xs outline-none focus:ring-1 focus:ring-[#cc0000]"
                                                value={custom.assignedTechnician || ''}
                                                onChange={(e) => handleUpdatePackPartCustomization(pack.id, part.name, 'assignedTechnician', e.target.value)}
                                              >
                                                <option value="">No Specialist</option>
                                                {technicians.map(t => (
                                                  <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                              </select>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      {partsSubTab === 'import' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* File upload panel */}
                          <div className="flex flex-col bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Upload className="h-4 w-4 text-[#cc0000]" /> CSV / JSON File Drop
                            </h4>
                            <div
                              onDragOver={handlePartsFileDragOver}
                              onDragLeave={handlePartsFileDragLeave}
                              onDrop={handlePartsFileDrop}
                              className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all min-h-[180px] flex-1 ${
                                isDraggingPartsFile
                                  ? 'border-[#cc0000] bg-[#cc0000]/5 scale-[1.01]'
                                  : 'border-slate-200 bg-slate-50/55 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <Upload className={`h-8 w-8 mb-2 transition-colors ${isDraggingPartsFile ? 'text-[#cc0000]' : 'text-slate-400'}`} />
                              <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">Drag file here</h4>
                              <p className="text-[9px] text-slate-400 max-w-[155px] leading-relaxed mb-3">
                                Drop .json, .csv, or .txt file containing parts info.
                              </p>
                              <label className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg text-[9px] font-bold text-slate-600 cursor-pointer shadow-sm transition-all flex items-center gap-1.5 select-none">
                                <span>Browse File</span>
                                <input
                                  type="file"
                                  accept=".json,.csv,.txt"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      parseAndImportPartsFile(file);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          </div>

                          {/* Raw paste text panel */}
                          <div className="flex flex-col bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Box className="h-4 w-4 text-[#cc0000]" /> Paste Raw Text Lines
                            </h4>
                            <div className="flex flex-col space-y-3 flex-1">
                              <div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">Format Guide:</div>
                                <div className="text-[8px] text-slate-500 font-mono bg-slate-50 p-2 rounded-lg border border-slate-100 leading-normal">
                                  Turbo Gasket, 1, 450, Front engine spool<br />
                                  Part Name, Qty, Price, Description
                                </div>
                              </div>
                              <textarea
                                rows={4}
                                value={rawPastedPartsText}
                                onChange={(e) => setRawPastedPartsText(e.target.value)}
                                placeholder="Turbo Gasket, 1, 450&#10;Inlet Manifold, 2, 1200, Custom alloy"
                                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-[#cc0000] font-mono resize-none flex-1 placeholder:text-slate-300"
                              />
                              <button
                                type="button"
                                onClick={parseAndImportPastedParts}
                                disabled={loading || !rawPastedPartsText.trim()}
                                className="w-full py-2.5 bg-[#cc0000] text-white font-bold rounded-xl text-[10px] uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Import Copied Spares
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {jobParts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {jobParts.map((part) => (
                        <div key={part.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 group relative">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white text-[#cc0000] rounded-xl flex items-center justify-center shadow-sm shrink-0">
                              <Box className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{part.name}</div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span>Qty: {part.quantity}{!isWorkshopSession && ` | R ${part.price}`}</span>
                                {part.assignedTechnicianName && (
                                  <span className="flex items-center gap-1 text-[#cc0000] bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                    <Wrench className="h-2.5 w-2.5" />
                                    {part.assignedTechnicianName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button 
                              onClick={() => part.id && handleRemovePart(part.id)}
                              disabled={loading}
                              className="p-2 text-slate-300 hover:text-red-600 opacity-60 group-hover:opacity-100 transition-all disabled:opacity-50"
                            >
                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                          {part.description && (
                            <div className="text-[11px] text-slate-500 bg-white/50 p-2 rounded-lg border border-slate-100 italic">
                              {part.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No parts assigned to this job card yet.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Standard Service Checklist</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Drag & drop items via the grip handle to prioritize or reorder them.</p>
                </div>
              </div>
 
              <div className="space-y-2.5 max-w-2xl">
                {(formData.checklist || DEFAULT_CHECKLIST).map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleChecklistDragStart(e, index)}
                    onDragOver={(e) => handleChecklistDragOver(e, index)}
                    onDrop={(e) => handleChecklistDrop(e, index)}
                    onDragEnd={() => {
                      setDraggedChecklistIndex(null);
                      setDragOverChecklistIndex(null);
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      item.completed 
                        ? 'bg-green-50/50 border-green-200 text-green-900' 
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 shadow-sm'
                    } ${
                      draggedChecklistIndex === index 
                        ? 'opacity-30 border-dashed border-[#cc0000] bg-red-50/10' 
                        : ''
                    } ${
                      dragOverChecklistIndex === index 
                        ? 'border-[#cc0000] bg-slate-50 scale-[1.015]' 
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Drag handle */}
                      <div 
                        className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing p-1 shrink-0"
                        title="Drag handle"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
 
                      {/* Click/Toggle region */}
                      <button
                        type="button"
                        onClick={() => toggleChecklistItem(item.id)}
                        className="flex items-center gap-3 text-left focus:outline-none flex-1 min-w-0"
                      >
                        <div className={`w-5.5 h-5.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                          item.completed 
                            ? 'bg-green-600 border-green-600 text-white' 
                            : 'bg-white border-slate-300'
                        }`}>
                          {item.completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </div>
                        <span className={`font-bold text-sm truncate ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {item.task}
                        </span>
                      </button>
                    </div>
 
                    {item.completed && (
                      <div className="text-[10px] font-bold opacity-60 flex flex-col items-end shrink-0 pl-2">
                        <span className="text-green-600">Done</span>
                        {item.completedAt && (
                          <span className="text-slate-400">
                            {format(new Date(item.completedAt.seconds ? item.completedAt.seconds * 1000 : item.completedAt), 'HH:mm')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
 
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3 max-w-2xl">
                <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 leading-relaxed">
                  <p className="font-bold mb-0.5 text-blue-900">Interactive Checklist & Sorting</p>
                  <p>You can drag and drop items vertically using the grasp handle to change their completion order. Mark tasks as completed as you work through standard repair routines.</p>
                </div>
              </div>

              {/* DIAGNOSTICS REPORT SECTION WITH DETAILS */}
              <div className="border-t border-slate-200 pt-8 mt-12 space-y-6">
                <div className="bg-[#cc0000]/5 border border-red-100 rounded-3xl p-6 md:p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#cc0000] text-white rounded-2xl">
                      <Wrench className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight">System Diagnostic & OBD-II Scan Report</h4>
                      <p className="text-xs text-slate-500">Record full diagnostics details, fault codes (DTCs), electrical metrics, and engine performance measurements.</p>
                    </div>
                  </div>

                  {/* OBD Scan Status and codes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500">OBD-II Scan Status</label>
                      <div className="flex gap-2">
                        {(['Not Run', 'Passed', 'Faults Found'] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateDiagnosticField('obdScanStatus', status)}
                            className={`flex-1 py-3 text-xs font-black rounded-xl border uppercase tracking-wider transition-all cursor-pointer ${
                              (formData.diagnosticsReport?.obdScanStatus || 'Not Run') === status
                                ? status === 'Passed'
                                  ? 'bg-green-600 border-green-600 text-white shadow-md shadow-green-900/10'
                                  : status === 'Faults Found'
                                    ? 'bg-[#cc0000] border-[#cc0000] text-white shadow-md shadow-red-900/10'
                                    : 'bg-slate-700 border-slate-700 text-white shadow-md'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Diagnostic Trouble Codes (DTCs)</label>
                      <input
                        type="text"
                        placeholder="e.g., P0171, P0300, C0045 (Enter N/A if none)"
                        value={formData.diagnosticsReport?.dtcCodes || ''}
                        onChange={(e) => updateDiagnosticField('dtcCodes', e.target.value)}
                        className="w-full p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] font-mono text-sm tracking-wide text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Electrical & Engine Metrics */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200/60 pb-1.5">Electrical & Engine Metrics</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-slate-500">Battery Voltage (Engine Off)</label>
                        <input
                          type="text"
                          placeholder="e.g., 12.6V"
                          value={formData.diagnosticsReport?.batteryVoltage || ''}
                          onChange={(e) => updateDiagnosticField('batteryVoltage', e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-xs font-bold text-slate-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-slate-500">Battery Health (SOH %)</label>
                        <input
                          type="text"
                          placeholder="e.g., 92% (Good)"
                          value={formData.diagnosticsReport?.batteryHealth || ''}
                          onChange={(e) => updateDiagnosticField('batteryHealth', e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-xs font-bold text-slate-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-slate-500">Alternator Output</label>
                        <input
                          type="text"
                          placeholder="e.g., 14.1V"
                          value={formData.diagnosticsReport?.alternatorOutput || ''}
                          onChange={(e) => updateDiagnosticField('alternatorOutput', e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-xs font-bold text-slate-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-slate-500">Engine Compression Metric</label>
                        <input
                          type="text"
                          placeholder="e.g., 150 PSI Cy 1-4"
                          value={formData.diagnosticsReport?.engineCompression || ''}
                          onChange={(e) => updateDiagnosticField('engineCompression', e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-xs font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Component Diagnostic Checklist status matrix */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200/60 pb-1.5">Essential Systems Status</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      {[
                        { label: 'Anti-lock Braking System (ABS)', stateKey: 'absStatus' },
                        { label: 'Airbags / SRS System', stateKey: 'airbagsStatus' },
                        { label: 'Engine Control Unit (ECU)', stateKey: 'ecuStatus' },
                        { label: 'Transmission System / TCU', stateKey: 'transmissionStatus' },
                        { label: 'Fuel Injection System', stateKey: 'fuelSystemStatus' },
                        { label: 'Engine Cooling System', stateKey: 'coolantSystemStatus' },
                      ].map((sys) => (
                        <div key={sys.stateKey} className="space-y-1.5 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
                          <label className="block text-[11px] font-black text-slate-600 line-clamp-1">{sys.label}</label>
                          <select
                            value={(formData.diagnosticsReport as any)?.[sys.stateKey] || 'Not Inspected'}
                            onChange={(e) => updateDiagnosticField(sys.stateKey, e.target.value)}
                            className={`w-full p-2.5 rounded-xl text-xs font-bold border-2 cursor-pointer outline-none transition-all ${
                              (formData.diagnosticsReport as any)?.[sys.stateKey] === 'Good'
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : (formData.diagnosticsReport as any)?.[sys.stateKey] === 'Fault'
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-slate-50 border-slate-100 text-slate-500'
                            }`}
                          >
                            <option value="Not Inspected">Not Inspected</option>
                            <option value="Good">Good (No faults)</option>
                            <option value="Fault">Fault Detected</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Diagnostic details & notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Diagnostic Summary & Comments</label>
                      <textarea
                        rows={4}
                        placeholder="Provide detailed technician notes on scope of scan, readings, faults found, proposed repair action..."
                        value={formData.diagnosticsReport?.diagnosticNotes || ''}
                        onChange={(e) => updateDiagnosticField('diagnosticNotes', e.target.value)}
                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#cc0000] text-sm text-slate-800 resize-none font-medium"
                      />
                    </div>

                    <div className="space-y-4 flex flex-col justify-between">
                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Diagnostic Technician Name</label>
                        <input
                          type="text"
                          placeholder="Name of scanning technician"
                          value={formData.diagnosticsReport?.technicianName || ''}
                          onChange={(e) => updateDiagnosticField('technicianName', e.target.value)}
                          className="w-full p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#cc0000] text-sm font-bold text-slate-800"
                        />
                      </div>

                      <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-2xl flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-yellow-800 leading-normal font-medium">
                          <strong>Note:</strong> Saving the Job Card commits this Diagnostics Report. Submitting a report automatically updates bidirectionally with the stock control systems.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'condition' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">Vehicle Condition</h3>
                  <div className="flex flex-wrap gap-4">
                     <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-slate-300 text-[#cc0000] focus:ring-[#cc0000]" 
                          checked={formData.condition?.hasDents}
                          onChange={(e) => updateNestedField('condition', 'hasDents', e.target.checked)}
                        />
                        <span className="font-bold text-slate-700">Dents</span>
                     </label>
                     <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-slate-300 text-[#cc0000] focus:ring-[#cc0000]" 
                          checked={formData.condition?.hasScratches}
                          onChange={(e) => updateNestedField('condition', 'hasScratches', e.target.checked)}
                        />
                        <span className="font-bold text-slate-700">Scratches</span>
                     </label>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Fuel Level</label>
                    <div className="flex gap-2">
                       {['Empty', '1/4', '1/2', '3/4', 'Full'].map(lvl => (
                         <button 
                           key={lvl}
                           onClick={() => updateNestedField('condition', 'fuelLevel', lvl)}
                           className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                             formData.condition?.fuelLevel === lvl 
                               ? 'bg-[#cc0000] text-white border-[#cc0000] shadow-md shadow-red-900/20' 
                               : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                           }`}
                         >
                           {lvl}
                         </button>
                       ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Other Observations</label>
                    <textarea 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl resize-none"
                      rows={4}
                      value={formData.condition?.otherNotes}
                      onChange={(e) => updateNestedField('condition', 'otherNotes', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="text-lg font-bold text-slate-900 border-l-4 border-[#cc0000] pl-3">In/Out Video Recording</h3>
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setRecordingType('check-in')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                          recordingType === 'check-in'
                            ? 'bg-[#cc0000] text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Video className="h-3.5 w-3.5" />
                        Check-In Video
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordingType('check-out')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                          recordingType === 'check-out'
                            ? 'bg-[#cc0000] text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Video className="h-3.5 w-3.5" />
                        Check-Out Video
                      </button>
                    </div>
                  </div>
                  <div className="relative aspect-video bg-slate-900 rounded-3xl border-4 border-slate-800 shadow-2xl overflow-hidden group">
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
                    {!isRecording ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-6 text-center">
                        {cameraError ? (
                          <div className="mb-4 p-3 bg-red-600/20 border border-red-500 rounded-xl max-w-[320px] text-center">
                            <p className="text-red-400 text-xs font-bold font-mono flex items-center justify-center gap-1.5 mb-1">
                              <AlertCircle className="h-4 w-4" /> Camera / Mic Access Error
                            </p>
                            <p className="text-white/80 text-[10px] leading-relaxed select-text">{cameraError}</p>
                          </div>
                        ) : null}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={startCamera}
                          className="px-6 py-3 bg-[#cc0000] text-white rounded-xl flex items-center gap-3 shadow-lg hover:bg-black transition-all font-bold mb-4 cursor-pointer"
                        >
                          <Video className="h-5 w-5" />
                          <span>Start Recording ({recordingType === 'check-in' ? 'Check-In' : 'Check-Out'})</span>
                        </motion.button>
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-white/10 rounded-full border border-white/10">
                            <AlertCircle className="h-3 w-3 text-white/40" />
                            <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest">Camera access required</p>
                          </div>
                          <p className="text-white/40 text-[9px] max-w-[200px] leading-relaxed italic">
                            Videos are stored as local drafts for security. They will be uploaded to the server once "Save Job Card" is clicked.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="absolute top-4 left-4 flex items-center gap-3 animate-pulse">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-xl font-black text-xs shadow-lg">
                            <div className="w-2 h-2 bg-white rounded-full bg-red-100" /> 
                            <span className="tracking-widest uppercase">RECORDING {recordingType}</span>
                          </div>
                          <div className="px-3 py-1.5 bg-black/80 backdrop-blur-xl text-white rounded-xl font-mono text-xs font-black border border-white/10 flex items-center gap-2">
                             <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                            {formatDuration(recordingDuration)}
                          </div>
                        </div>
                        <motion.button 
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={stopCamera}
                          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-8 py-3 bg-white text-[#cc0000] font-black rounded-xl shadow-2xl hover:bg-[#cc0000] hover:text-white transition-all flex items-center gap-3 text-sm cursor-pointer"
                        >
                          <div className="w-3 h-3 bg-[#cc0000] rounded-sm" />
                          <span>STOP RECORDING</span>
                        </motion.button>
                      </>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase">Captured Recordings ({recordings.length})</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                       {recordings.map((rec: any, idx) => {
                         const url = typeof rec === 'string' ? rec : rec.url;
                         const thumbnail = typeof rec === 'string' ? null : rec.thumbnail;
                         const description = typeof rec === 'string' ? '' : rec.description;
                         const rType = rec.type || 'check-in';
                         
                         return (
                           <div key={idx} className="flex flex-col gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                             <div className="flex items-center justify-between">
                               <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                                 rType === 'check-in' 
                                   ? 'bg-blue-50 text-blue-700 border-blue-100' 
                                   : 'bg-green-50 text-green-700 border-green-100'
                                }`}>
                                 {rType === 'check-in' ? 'Check-In Video' : 'Check-Out Video'}
                               </span>
                               <button
                                 type="button"
                                 onClick={() => setRecordings(prev => prev.filter((_, i) => i !== idx))}
                                 className="p-1.5 px-3 bg-red-50 hover:bg-[#cc0000] text-[#cc0000] hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border border-red-100 cursor-pointer"
                               >
                                 <Trash2 className="h-3.5 w-3.5" />
                                 <span>Delete</span>
                               </button>
                             </div>

                             <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-inner border border-slate-205">
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

                             <div className="space-y-1">
                               <span className="text-[9px] font-black text-slate-400 block px-1">Inspector Notes:</span>
                               <input 
                                 type="text"
                                 placeholder="E.g. Scratch on bumper, mileage verified..."
                                 className="text-xs w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#cc0000] transition-colors shadow-inner font-medium"
                                 value={description || ''}
                                 onChange={(e) => {
                                   const updated = [...recordings];
                                   if (typeof updated[idx] === 'string') {
                                     updated[idx] = { url: updated[idx] as any, description: e.target.value, type: rType };
                                   } else {
                                     updated[idx] = { ...updated[idx], description: e.target.value, type: rType };
                                   }
                                   setRecordings(updated);
                                 }}
                               />
                             </div>
                           </div>
                         );
                       })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
              </fieldset>
        </motion.div>
      </AnimatePresence>
    </div>

        <div className="mt-8 flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex gap-2">
            {activeTab !== tabs[0].id && (
              <button 
                onClick={() => {
                  const idx = tabs.findIndex(t => t.id === activeTab);
                  setActiveTab(tabs[idx - 1].id);
                }}
                className="flex items-center gap-2 px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all border border-slate-100"
              >
                <ArrowLeft className="h-5 w-5" /> Previous Section
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {activeTab !== tabs[tabs.length - 1].id ? (
              <button 
                onClick={() => {
                  const idx = tabs.findIndex(t => t.id === activeTab);
                  setActiveTab(tabs[idx + 1].id);
                }}
                className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-black transition-all shadow-lg"
              >
                Continue to {tabs[tabs.findIndex(t => t.id === activeTab) + 1].label}
              </button>
            ) : (
              <button 
                onClick={handleSave}
                disabled={loading || saveSuccess}
                className={`flex items-center gap-2 px-8 py-3 ${saveSuccess ? 'bg-green-600' : 'bg-[#cc0000] hover:bg-[#b30000]'} text-white font-bold rounded-2xl shadow-xl transition-all disabled:opacity-50 min-w-[200px] justify-center hover:-translate-y-1`}
              >
                {saveSuccess ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" /> Saved Successfully!
                  </motion.div>
                ) : (
                  <>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    <span>{loading ? 'Finalizing...' : 'Save Job Card'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Invoice Summary Modal */}
        {showInvoiceModal && id && (
          <InvoiceSummary 
            jobCard={{ id, ...formData } as JobCard}
            parts={jobParts}
            jobNotes={jobNotes}
            onClose={() => setShowInvoiceModal(false)}
          />
        )}

        {/* Invoice PIN Login Modal */}
        {showPinCheckModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl border border-slate-150 text-center"
            >
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-5 text-[#cc0000]">
                <KeyRound className="h-8 w-8 text-red-600 animate-bounce" />
              </div>
              <h3 className="text-2xl font-black text-slate-950 tracking-tight">Invoice Authentication</h3>
              <p className="text-sm text-slate-500 mt-2 mb-6">Enter your 4-digit Workshop PIN to view/save the invoice details.</p>
              
              <form onSubmit={handleVerifyInvoicePin} className="space-y-4">
                <input 
                  type="password"
                  maxLength={6}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center py-4 bg-slate-50 border border-slate-200 rounded-3xl font-mono text-3xl tracking-[0.4em] focus:ring-2 focus:ring-[#cc0000] outline-none select-all text-slate-800 transition-all font-bold"
                  autoFocus
                  required
                />
                {pinCheckError && (
                  <p className="text-xs text-red-600 font-bold bg-red-50 py-2 rounded-xl border border-red-100 animate-shake">
                    {pinCheckError}
                  </p>
                )}
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowPinCheckModal(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all cursor-pointer text-sm uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-[#cc0000] hover:bg-black text-white font-black rounded-2xl transition-all cursor-pointer shadow-lg shadow-red-900/10 text-sm uppercase tracking-wider"
                  >
                    Verify PIN
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Full-Feature Stock Sync and Report Modal */}
        {showSyncStockModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm print:bg-white print:absolute print:inset-0 print:p-0 print:z-[999999] print:block">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] print:hidden"
            >
              {/* Header */}
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-950 text-base uppercase tracking-wider flex items-center gap-2">
                    <Database className="h-5 w-5 text-amber-500" />
                    External Stock Sync Portal
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Cross-reconcile spares with the central stock catalog</p>
                </div>
                {syncStatus !== 'syncing' && (
                  <button 
                    onClick={() => setShowSyncStockModal(false)}
                    className="p-1.5 rounded-xl hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Content Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Fetching / Matching status */}
                {syncStatus === 'matching' && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                    <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
                    <div className="space-y-1">
                      <p className="font-bold text-slate-800 text-sm">Querying External Inventory Systems...</p>
                      <p className="text-xs text-slate-400">Retrieving catalog records and establishing endpoints</p>
                    </div>
                  </div>
                )}

                {/* 2. Error State */}
                {syncStatus === 'error' && (
                  <div className="p-5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-red-800 text-sm">Sync Portal Error</p>
                      <p className="text-xs text-red-600 leading-relaxed">{syncError}</p>
                      <button 
                        onClick={runStockMatching}
                        className="mt-3 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                      >
                        Retry Query
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Main Reconciled List Presentation */}
                {syncStatus === 'matched' && syncReport && (
                  <div className="space-y-6">
                    {/* Metrics Banner */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                        <div className="text-[10px] font-black uppercase text-emerald-800/75 tracking-wider">Catalog Matches</div>
                        <div className="text-xl font-extrabold text-emerald-900 mt-0.5">{syncReport.matched.length} Items</div>
                        <p className="text-[10px] text-emerald-600/80 mt-1">Ready to adjust stock quantities and log transactions</p>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100/50">
                        <div className="text-[10px] font-black uppercase text-blue-800/75 tracking-wider">Catalog Mismatches</div>
                        <div className="text-xl font-extrabold text-blue-900 mt-0.5">{syncReport.unmatched.length} New Items</div>
                        <p className="text-[10px] text-blue-600/80 mt-1">Ready to auto-provision as new spares in system</p>
                      </div>
                    </div>

                    {/* Matched Spares Segment */}
                    {syncReport.matched.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ready for Stock Adjustment</div>
                        <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-slate-50/50 overflow-hidden">
                          {syncReport.matched.map((item, idx) => (
                            <div key={idx} className="p-3.5 flex items-start justify-between gap-4 text-xs bg-white">
                              <div className="space-y-1">
                                <div className="font-bold text-slate-800">{item.part.name}</div>
                                <div className="text-[10px] text-slate-500 font-medium">SKU: <span className="font-mono text-slate-700">{item.stockItem.sku}</span>{!isWorkshopSession && ` • Price: R ${item.part.price}`}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase">
                                  <Check className="h-3 w-3" /> Matched
                                </span>
                                <div className="text-[10px] text-slate-400 mt-1">Stock: {item.stockItem.quantity} → <span className="font-extrabold text-orange-600">{item.newQty}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unmatched Spares Segment */}
                    {syncReport.unmatched.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Spares Requiring Catalog Provisioning</div>
                        <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-slate-50/50 overflow-hidden">
                          {syncReport.unmatched.map((item, idx) => (
                            <div key={idx} className="p-3.5 flex items-start justify-between gap-4 text-xs bg-white">
                              <div className="space-y-1">
                                <div className="font-bold text-slate-800">{item.part.name}</div>
                                <div className="text-[10px] text-slate-400">{!isWorkshopSession && `Price: R ${item.part.price} • `}Not present in central inventory</div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                  <input 
                                    type="checkbox" 
                                    checked={item.autoCreate} 
                                    onChange={(e) => {
                                      const updatedUnmatched = [...syncReport.unmatched];
                                      updatedUnmatched[idx].autoCreate = e.target.checked;
                                      setSyncReport({ ...syncReport, unmatched: updatedUnmatched });
                                    }}
                                    className="accent-slate-800 h-3.5 w-3.5 rounded border-slate-300"
                                  />
                                  <span className="text-[10px] font-bold text-slate-600 uppercase">Auto-Create Spare</span>
                                </label>
                                <span className="text-[9px] text-slate-400 italic">Will assign custom auto-SKU</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reconcile Warning Note */}
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] text-amber-700 leading-relaxed">
                      Executing this will immediately deduct quantities from the catalog for matched spares, generate SKU records for new entries, and create trace transaction allocations.
                    </div>
                  </div>
                )}

                {/* 4. Syncing / Executing State */}
                {syncStatus === 'syncing' && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                    <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
                    <div className="space-y-1">
                      <p className="font-bold text-slate-800 text-sm">Processing Stock Sync Adjustments...</p>
                      <p className="text-xs text-slate-400">Updating external stock databases and creating audit transactions</p>
                    </div>
                  </div>
                )}

                {/* 5. Completed Receipt Summary */}
                {syncStatus === 'completed' && syncSummary && (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center space-y-3">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                        <Check className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">Sync Successful</h4>
                        <p className="text-xs text-slate-400 mt-1">Cross-system stock records successfully written and logged</p>
                      </div>
                    </div>

                    <div className="border border-slate-100 rounded-2xl bg-white overflow-hidden text-xs">
                      <div className="p-4 bg-slate-50/50 border-b border-rose-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">Summary Audit Report</div>
                      <div className="p-4 divide-y divide-slate-100 space-y-3">
                        <div className="flex justify-between items-center py-1.5">
                          <span className="text-slate-500">Successfully matched & synced:</span>
                          <span className="font-bold text-slate-850">{syncSummary.syncedCount} items</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5">
                          <span className="text-slate-500">Auto-created & provisioned in catalog:</span>
                          <span className="font-bold text-slate-850">{syncSummary.createdCount} items</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5">
                          <span className="text-slate-500">Bypassed or failed to sync:</span>
                          <span className="font-bold text-red-500">{syncSummary.failedCount} items</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Real-Time Allocation Audit Log list in UI */}
                    <div className="space-y-3">
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Logged Allocation Transactions</div>
                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                        {syncSummary.transactions && syncSummary.transactions.length > 0 ? (
                          syncSummary.transactions.map((tx, idx) => (
                            <div key={idx} className="p-3.5 flex items-start justify-between gap-4 text-xs bg-white">
                              <div className="space-y-1">
                                <div className="font-bold text-slate-800">{tx.partName}</div>
                                <div className="text-[10px] text-slate-500 font-mono">SKU: {tx.sku}</div>
                                <div className="text-[10px] text-slate-400">Ref Item ID: {tx.itemId}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                  tx.action === 'DEDUCT' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  Quantity: -{tx.quantityDeducted}
                                </span>
                                <div className="text-[10px] text-slate-600 mt-1 font-semibold">{tx.technicianName}</div>
                                <div className="text-[9px] text-slate-400 font-mono mt-0.5">Tech ID: {tx.technicianId}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-slate-400 text-xs italic bg-white">
                            No allocations successfully logged.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Action Buttons Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                {syncStatus !== 'syncing' && syncStatus !== 'completed' && (
                  <button 
                    onClick={() => setShowSyncStockModal(false)}
                    className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs rounded-xl uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}

                {syncStatus === 'matched' && (
                  <button 
                    onClick={executeStockSync}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-amber-900/10 cursor-pointer"
                  >
                    Execute Stock Sync
                  </button>
                )}

                {syncStatus === 'completed' && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => window.print()}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md hover:-translate-y-0.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      Print Audit Log
                    </button>
                    <button 
                      onClick={() => setShowSyncStockModal(false)}
                      className="px-6 py-2.5 bg-[#cc0000] hover:bg-red-700 text-white font-extrabold text-xs rounded-xl uppercase tracking-wider transition-all shadow-md shadow-red-900/10 cursor-pointer"
                    >
                      Close Portal
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Hidden Printable Audit Log Page - Becomes active and takes over full page on Print command */}
            {syncStatus === 'completed' && syncSummary && (
              <div className="hidden print:block bg-white p-12 text-black font-sans w-full min-h-screen relative text-xs z-[99999]">
                <div className="border-b-4 border-slate-900 pb-4 mb-6 flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                      Stock Allocation Audit Ledger
                    </h1>
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      AUTOMATED CENTRAL INVENTORY RELEASE SYSTEM
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-900">AUDIT NO: ER-SYNC-{formData?.jobCardNo || id || 'N/A'}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">{new Date().toLocaleString()}</div>
                  </div>
                </div>

                {/* Meta Details Grid */}
                <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs mb-6">
                  <div className="space-y-1.5">
                    <div>
                      <span className="font-extrabold text-slate-400 uppercase font-mono text-[9px] tracking-wider block">Job Reference</span>
                      <span className="font-bold text-slate-900">{formData?.jobCardNo || "UNASSIGNED"} • {formData?.clientName || "Job Client"}</span>
                    </div>
                    <div>
                      <span className="font-extrabold text-slate-400 uppercase font-mono text-[9px] tracking-wider block">Vehicle Registration No</span>
                      <span className="font-semibold text-slate-900">{formData?.vehicleDetails?.registrationNo || "N/A"}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <span className="font-extrabold text-slate-400 uppercase font-mono text-[9px] tracking-wider block">Authorized Sync Tech</span>
                      <span className="font-semibold text-slate-900">{user?.displayName || "N/A"} ({user?.email || "N/A"})</span>
                    </div>
                    <div>
                      <span className="font-extrabold text-slate-400 uppercase font-mono text-[9px] tracking-wider block font-semibold">User Unique ID (Technician ID)</span>
                      <span className="font-mono text-slate-700 block text-[11px] font-bold">{user?.uid || "N/A"}</span>
                    </div>
                  </div>
                </div>

                {/* Brief Status Metrics */}
                <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                  <div className="border border-slate-200 p-3 rounded-lg bg-emerald-50/20">
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Matched & Synced</div>
                    <div className="text-base font-black text-emerald-800 mt-1">{syncSummary.syncedCount} Items</div>
                  </div>
                  <div className="border border-slate-200 p-3 rounded-lg bg-blue-50/20">
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Auto-Created</div>
                    <div className="text-base font-black text-blue-800 mt-1">{syncSummary.createdCount} Items</div>
                  </div>
                  <div className="border border-slate-200 p-3 rounded-lg bg-red-50/20">
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Failed Adjustments</div>
                    <div className="text-base font-black text-red-800 mt-1">{syncSummary.failedCount} Items</div>
                  </div>
                </div>

                {/* Detailed transaction logs table */}
                <div className="mb-8">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 font-mono">Itemized Allocation Transactions</div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[9px] font-bold text-slate-500 uppercase font-mono">
                        <th className="py-2">#</th>
                        <th className="py-2">Spare/Part Name</th>
                        <th className="py-2">SKU Record</th>
                        <th className="py-2 text-right">Quantity Deducted</th>
                        <th className="py-2">Sync Action</th>
                        <th className="py-2">Technician</th>
                        <th className="py-2 text-right">Stock Item Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {syncSummary.transactions && syncSummary.transactions.length > 0 ? (
                        syncSummary.transactions.map((tx, idx) => (
                          <tr key={idx} className="py-3">
                            <td className="py-2.5 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 font-bold text-slate-900">{tx.partName}</td>
                            <td className="py-2.5 font-mono text-slate-700 text-[10px]">{tx.sku}</td>
                            <td className="py-2.5 font-extrabold text-slate-950 text-right text-sm">-{tx.quantityDeducted}</td>
                            <td className="py-2.5 font-mono font-medium">
                              <span className={tx.action === "DEDUCT" ? "text-indigo-800" : "text-emerald-800"}>
                                {tx.action}
                              </span>
                            </td>
                            <td className="py-2.5 font-medium text-slate-800">{tx.technicianName}</td>
                            <td className="py-2.5 font-mono text-[9px] text-slate-400 text-right">{tx.itemId}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-slate-400 italic">No allocations successfully synced in this ledger release.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Authorized Signature area at the bottom */}
                <div className="mt-16 grid grid-cols-2 gap-12 pt-8 border-t border-dashed border-slate-300">
                  <div>
                    <div className="h-10 border-b border-slate-400"></div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2 font-mono">TECHNICAL AUTHORIZER SIGNATURE</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{user?.displayName || "Lead Mechanic"} • {user?.email}</div>
                  </div>
                  <div>
                    <div className="h-10 border-b border-slate-400"></div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2 font-mono">STORES OFFICER COUNTER-SIGNATURE</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Automated Central Inventory Release System</div>
                  </div>
                </div>

                {/* Footer disclaimer */}
                <div className="absolute bottom-6 left-12 right-12 text-center text-[8px] text-slate-400 font-mono tracking-tight uppercase border-t border-slate-100 pt-3">
                  This document serves as an official technical stock release voucher. Deductions listed have been fully debited from the ERP inventory matching SKU records.
                </div>
              </div>
            )}
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

        {/* Ephemeral Toast overlay */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-white font-medium text-xs leading-relaxed max-w-sm"
            >
              <div className={`w-2.5 h-2.5 rounded-full ${
                toastMessage.type === 'success' ? 'bg-emerald-500' :
                toastMessage.type === 'info' ? 'bg-blue-500' : 'bg-red-500'
              }`} />
              <span>{toastMessage.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
