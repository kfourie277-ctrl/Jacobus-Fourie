import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Box, Plus, Trash2, Search, Settings2, PackageCheck, Loader2, CheckCircle2, Download } from 'lucide-react';
import { db } from '../firebase';
import { Part } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';

export default function PartsPage() {
  const { isWorkshopSession } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'qty_desc' | 'category'>('name_asc');
  const [isAdding, setIsAdding] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newPart, setNewPart] = useState<Partial<Part>>({
    name: '',
    quantity: 1,
    price: 0,
    description: '',
    jobCardId: '',
    sku: '',
    category: ''
  });

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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Listen for updates or creation events from the embedded Stock Control iframe
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
          if (event.data && event.data.type === 'SYNC_PART') {
            const partData = event.data.payload;
            if (partData && partData.id) {
              const { setDoc } = await import('firebase/firestore');
              await setDoc(doc(db, 'parts', partData.id), partData, { merge: true });
            } else {
              await addDoc(collection(db, 'parts'), partData);
            }
            console.log("Stock synced to internal parts list via embedded system!");
          }
        } catch (err) {
          console.error("Error syncing embedded message:", err);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    // We'll query parts globally then manage them
    const q = query(collection(db, 'parts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Part));
      setParts(p);
      setLoading(false);
    }, (error) => {
      console.error("Parts query listener error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPart.name) return;

    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'parts'), newPart);
      
      // Sync to external app db directly using proxy
      fetch('/api/sync-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ADD_PART', payload: { id: docRef.id, ...newPart } })
      }).catch(err => console.error("External sync failed", err));

      setNewPart({ name: '', quantity: 1, price: 0, description: '', jobCardId: '', sku: '', category: '' });
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'parts');
    } finally {
      setIsSaving(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPart, setEditPart] = useState<Partial<Part>>({});

  const handleUpdatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editPart.name) return;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'parts', editingId), editPart);
      
      // Sync update to external app fb directly using proxy
      fetch('/api/sync-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'UPDATE_PART', payload: { id: editingId, ...editPart } })
      }).catch(err => console.error("External offset sync failed", err));

      setEditingId(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'parts');
    } finally {
      setIsSaving(false);
    }
  };


  const startEditing = (part: Part) => {
    setEditingId(part.id!);
    setEditPart(part);
  };

  const handleDelete = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: "Remove Part Record?",
      message: "Are you sure you want to remove this part from records? This action cannot be undone.",
      confirmText: "Remove Part",
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDoc(doc(db, 'parts', id));
          // Sync delete to external app using proxy
          fetch('/api/sync-external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'DELETE_PART', payload: { id } })
          }).catch(err => console.error("External sync failed", err));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `parts/${id}`);
        }
      }
    });
  };

  const filteredParts = parts.filter(p => 
    (p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (p.description || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (p.jobCardId || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (p.sku || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (p.category || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (sortBy === 'qty_desc') {
      return (b.quantity || 0) - (a.quantity || 0);
    } else if (sortBy === 'category') {
      return (a.category || '').localeCompare(b.category || '');
    }
    return 0;
  });

  const handleExportCSV = () => {
    // CSV Header matching our fields
    const headers = isWorkshopSession 
      ? ['Part ID', 'Part Name', 'Description', 'Quantity', 'Linked Job Card ID']
      : ['Part ID', 'Part Name', 'Description', 'Quantity', 'Price (R)', 'Linked Job Card ID'];
    
    // Map current listing of parts
    const rows = filteredParts.map(part => isWorkshopSession ? [
      part.id || '',
      part.name || '',
      part.description || '',
      part.quantity || 0,
      part.jobCardId || ''
    ] : [
      part.id || '',
      part.name || '',
      part.description || '',
      part.quantity || 0,
      part.price || 0,
      part.jobCardId || ''
    ]);

    // Build the CSV string, handling any escaping or quoting carefully
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(value => {
          const stringValue = typeof value === 'string' ? value : String(value);
          const escaped = stringValue.replace(/"/g, '""');
          if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
            return `"${escaped}"`;
          }
          return escaped;
        }).join(',')
      )
    ].join('\n');

    // Create file blob and download standard link trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = `parts_inventory_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Parts Inventory</h1>
          <p className="text-slate-500">Track and manage parts used for all services.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowEmbed(!showEmbed)}
            className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-all shadow-lg"
          >
            {showEmbed ? 'Close Embedded Stock Control' : 'Embed Stock Control'}
          </button>
          <a
            href="https://eret-stock-control-system-701158164534.europe-west1.run.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-800 font-bold rounded-xl hover:bg-slate-300 transition-all shadow-lg hidden sm:flex"
            title="Open in new tab"
          >
            Open in New Tab
          </a>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all shadow-lg cursor-pointer border border-slate-200"
            title="Export filtered parts list to CSV"
          >
            <Download className="h-5 w-5 text-slate-600" /> Export CSV
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#cc0000] text-white font-bold rounded-xl hover:bg-[#b30000] transition-all shadow-lg shadow-red-900/20"
          >
            <Plus className="h-5 w-5" /> Add Part
          </button>
        </div>
      </div>
      
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[100] px-6 py-3 bg-green-600 text-white rounded-2xl shadow-2xl font-bold flex items-center gap-3"
          >
            <CheckCircle2 className="h-5 w-5" />
            Inventory updated successfully!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-6">
        <div className="flex-1 flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <Search className="h-5 w-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Search parts by name, category, or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent outline-none font-medium text-slate-700"
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none h-full"
          >
            <option value="name_asc">Name (A-Z)</option>
            <option value="qty_desc">Quantity (High-Low)</option>
            <option value="category">Category</option>
          </select>
        </div>
      </div>

      <AnimatePresence>
        {showEmbed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: '70vh' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-slate-50"
          >
            <iframe 
              src="https://eret-stock-control-system-701158164534.europe-west1.run.app" 
              className="w-full h-full border-none"
              allow="camera; microphone; geolocation"
              title="External Stock Control System"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-8 bg-white rounded-3xl shadow-xl border-2 border-[#cc0000]/20"
          >
            <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Part Name</label>
                  <input 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={newPart.name}
                    onChange={(e) => setNewPart(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                      value={newPart.category || ''}
                      onChange={(e) => setNewPart(prev => ({ ...prev, category: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SKU</label>
                    <input 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                      value={newPart.sku || ''}
                      onChange={(e) => setNewPart(prev => ({ ...prev, sku: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description / Specs</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={newPart.description}
                    onChange={(e) => setNewPart(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className={isWorkshopSession ? "grid grid-cols-1" : "grid grid-cols-2 gap-4"}>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                    <input 
                      type="number"
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      value={newPart.quantity}
                      onChange={(e) => setNewPart(prev => ({ ...prev, quantity: parseFloat(e.target.value) }))}
                    />
                  </div>
                  {!isWorkshopSession && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price (R)</label>
                      <input 
                        type="number"
                        required
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                        value={newPart.price}
                        onChange={(e) => setNewPart(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Linked Job ID (Optional)</label>
                  <input 
                    placeholder="#3342"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    value={newPart.jobCardId}
                    onChange={(e) => setNewPart(prev => ({ ...prev, jobCardId: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-3 bg-[#cc0000] text-white font-bold rounded-xl shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSaving ? 'Saving...' : 'Save Part'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-6 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Part Info</th>
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Qty</th>
              {!isWorkshopSession && <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Price</th>}
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredParts.map((part) => (
              <tr key={part.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-50 text-[#cc0000] rounded-lg flex items-center justify-center shrink-0">
                      <Box className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{part.name}</div>
                      <div className="text-xs text-slate-500 font-medium">
                        {part.category && <span className="mr-2 text-[#cc0000]">{part.category}</span>}
                        {part.sku && <span className="mr-2 font-mono bg-slate-100 px-1 rounded">SKU: {part.sku}</span>}
                        {part.description}
                      </div>
                      {part.jobCardId && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-500 uppercase">
                          <PackageCheck className="h-3 w-3" /> Job {part.jobCardId}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="font-mono font-bold text-slate-700">x{part.quantity}</span>
                </td>
                {!isWorkshopSession && (
                  <td className="px-8 py-6">
                    <span className="font-bold text-[#cc0000] font-mono">R {part.price?.toFixed(2) || '0.00'}</span>
                  </td>
                )}
                <td className="px-8 py-6 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={() => startEditing(part)}
                      className="p-2 text-slate-400 group-hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-transparent group-hover:border-blue-100 bg-white shadow-sm"
                    >
                      <Settings2 className="h-5 w-5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(part.id!)}
                      className="p-2 text-slate-400 group-hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent group-hover:border-red-100 bg-white shadow-sm"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredParts.length === 0 && (
          <div className="p-12 text-center text-slate-400 italic">
            No parts recorded matching your search.
          </div>
        )}
      </div>

      {/* Action Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        confirmText={confirmModalConfig.confirmText}
        onClose={() => setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalConfig.onConfirm}
      />

      {/* Edit Part Modal */}
      <AnimatePresence>
        {editingId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="p-8 bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-100"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <Settings2 className="h-6 w-6 text-blue-600" />
                Edit Part Details
              </h2>
              <form onSubmit={handleUpdatePart} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Part Name</label>
                  <input 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                    value={editPart.name || ''}
                    onChange={(e) => setEditPart(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={editPart.category || ''}
                    onChange={(e) => setEditPart(prev => ({ ...prev, category: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SKU</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700"
                    value={editPart.sku || ''}
                    onChange={(e) => setEditPart(prev => ({ ...prev, sku: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                  <input 
                    type="number"
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    value={editPart.quantity || 0}
                    onChange={(e) => setEditPart(prev => ({ ...prev, quantity: parseFloat(e.target.value) }))}
                  />
                </div>
                {!isWorkshopSession && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price (R)</label>
                    <input 
                      type="number"
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[#cc0000]"
                      value={editPart.price || 0}
                      onChange={(e) => setEditPart(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                    />
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description / Specs</label>
                  <input 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={editPart.description || ''}
                    onChange={(e) => setEditPart(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                
                <div className="md:col-span-2 flex gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSaving ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-8 py-3 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
