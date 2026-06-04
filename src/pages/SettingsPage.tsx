import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Settings, UserPlus, Trash2, Key, ShieldCheck, Mail, User, Wrench, Plus, Download, Upload, FileJson } from 'lucide-react';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Technician, JobCard } from '../types';
import { getDocs } from 'firebase/firestore';

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [admins, setAdmins] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newTechName, setNewTechName] = useState('');
  const [workshopPin, setWorkshopPin] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPinSuccess, setShowPinSuccess] = useState(false);
  const [showPasswordSuccess, setShowPasswordSuccess] = useState(false);

  const handleExportData = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'jobCards'));
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `job-cards-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Export failed: ' + err);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('This will import job cards. Existing records with same IDs might be overwritten. Proceed?')) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as JobCard[];
        setLoading(true);
        for (const item of data) {
          const { id: itemId, ...rest } = item as any;
          const docId = itemId || doc(collection(db, 'jobCards')).id;
          await setDoc(doc(db, 'jobCards', docId), {
            ...rest,
            updatedAt: serverTimestamp()
          }, { merge: true });

          if (rest.customerCode) {
            await setDoc(doc(db, 'customerCodes', rest.customerCode.trim().toUpperCase()), {
              jobCardId: docId,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }
        alert('Import successful!');
      } catch (err) {
        alert('Import failed: ' + err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const q = query(collection(db, 'admin_whitelists'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAdmins(snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Admin whitelists listener error:", error);
    });

    const techsUnsubscribe = onSnapshot(query(collection(db, 'technicians')), (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician)));
    }, (error) => {
      console.error("Technicians listener error:", error);
    });

    // Fetch initial PIN and Admin Password once to avoid race conditions during typing
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'workshop'));
        if (docSnap.exists()) {
          setWorkshopPin(docSnap.data().pin || '');
        }

        const pwdSnap = await getDoc(doc(db, 'settings', 'admin_password'));
        if (pwdSnap.exists()) {
          setAdminPassword(pwdSnap.data().password || '');
        } else {
          setAdminPassword('admin');
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();

    return () => {
      unsubscribe();
      techsUnsubscribe();
    };
  }, []);

  const handleAddTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'technicians'), {
        name: newTechName.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewTechName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'technicians');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTech = async (tech: Technician) => {
    try {
      await setDoc(doc(db, 'technicians', tech.id), { ...tech, active: !tech.active }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'technicians');
    }
  };

  const handleRemoveTech = async (id: string) => {
    if (!window.confirm('Delete this technician?')) return;
    try {
      await deleteDoc(doc(db, 'technicians', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'technicians');
    }
  };

  const handleUpdatePin = async () => {
    if (!workshopPin.trim()) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'workshop'), {
        pin: workshopPin.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'Admin'
      });
      setShowPinSuccess(true);
      setTimeout(() => setShowPinSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!adminPassword.trim()) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'admin_password'), {
        password: adminPassword.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'Admin'
      });
      setShowPasswordSuccess(true);
      setTimeout(() => setShowPasswordSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'admin_whitelists', (newAdminEmail || '').toLowerCase().trim()), {
        addedAt: serverTimestamp(),
        addedBy: user?.email
      });
      setNewAdminEmail('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'admin_whitelists');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (!window.confirm(`Remove ${email} from admin whitelist?`)) return;
    try {
      await deleteDoc(doc(db, 'admin_whitelists', email));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'admin_whitelists');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Settings & Security</h1>
        <p className="text-slate-500">Manage your account and workshop access permissions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="p-6 bg-white rounded-3xl shadow-sm border border-slate-100 text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full mx-auto flex items-center justify-center mb-4 overflow-hidden">
               {user?.photoURL ? <img src={user.photoURL} alt="Avatar" /> : <User className="h-10 w-10 text-[#cc0000]" />}
            </div>
            <h3 className="font-bold text-slate-900">{user?.displayName}</h3>
            <p className="text-sm text-slate-500 mb-6">{user?.email}</p>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
               <ShieldCheck className="h-3 w-3" /> Authorized Admin
            </div>
          </div>

          <div className="p-6 bg-[#cc0000] rounded-3xl text-white space-y-4 shadow-xl shadow-red-900/20">
             <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-red-200" />
                <span className="font-bold">Security Note</span>
             </div>
             <p className="text-xs text-red-50/80 leading-relaxed">
                This application uses Google Authentication. To change your password, please use your Google Account settings. 
                Internal access is strictly limited to emails whitelisted in our database.
             </p>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <FileJson className="h-5 w-5 text-[#cc0000]" />
                Data Management (Import/Export)
             </h3>
             <p className="text-sm text-slate-500 mb-6">
                Export all job cards to a JSON file for backup, or import from a previous export.
             </p>
             <div className="flex flex-wrap gap-4">
                <button 
                  onClick={handleExportData}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                >
                  <Download className="h-4 w-4" /> Export All Jobs
                </button>
                <div className="relative">
                   <input 
                    type="file"
                    accept=".json"
                    onChange={handleImportData}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                   />
                   <button className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-900 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                      <Upload className="h-4 w-4" /> Import Data
                   </button>
                </div>
             </div>
          </div>

          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#cc0000]" />
                Workshop Access PIN
             </h3>
             <p className="text-sm text-slate-500 mb-6">
                Set a global access code for workshop technicians. This allows staff to access the job card section without a personal Google account.
             </p>
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input 
                     type="text"
                     placeholder="Set Workshop PIN (e.g. 1234)..."
                     value={workshopPin}
                     onChange={(e) => setWorkshopPin(e.target.value)}
                     className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none transition-all font-mono tracking-widest"
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePin}
                    disabled={loading || !workshopPin.trim()}
                    className={`px-6 py-3 ${showPinSuccess ? 'bg-green-600' : 'bg-slate-900'} text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2`}
                  >
                    {showPinSuccess ? (
                      <><ShieldCheck className="h-4 w-4" /> Saved</>
                    ) : (
                      <>{loading ? 'Saving...' : 'Save PIN'}</>
                    )}
                  </button>
                </div>
          </div>

          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Key className="h-5 w-5 text-[#cc0000]" />
                Office Admin Password
             </h3>
             <p className="text-sm text-slate-500 mb-6">
                Set a global access code for office admins. This is used on the Staff Portal Login to lock/unlock dashboard privileges. Only whitelisted admins can change this settings panel.
             </p>
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input 
                     type="text"
                     placeholder="Set Admin Password (e.g. admin123)..."
                     value={adminPassword}
                     onChange={(e) => setAdminPassword(e.target.value)}
                     className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none transition-all font-mono tracking-widest"
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePassword}
                    disabled={loading || !adminPassword.trim()}
                    className={`px-6 py-3 ${showPasswordSuccess ? 'bg-green-600' : 'bg-slate-900'} text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2`}
                  >
                    {showPasswordSuccess ? (
                      <><ShieldCheck className="h-4 w-4" /> Saved</>
                    ) : (
                      <>{loading ? 'Saving...' : 'Save Password'}</>
                    )}
                  </button>
                </div>
          </div>

          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[#cc0000]" />
                Technician Management
             </h3>
             <form onSubmit={handleAddTechnician} className="flex gap-4 mb-8">
                <div className="flex-1 relative">
                   <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                   <input 
                    type="text"
                    placeholder="Enter technician name..."
                    value={newTechName}
                    onChange={(e) => setNewTechName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none transition-all"
                   />
                </div>
                <button 
                  disabled={loading || !newTechName.trim()}
                  className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50"
                >
                  Add Tech
                </button>
             </form>

             <div className="space-y-3">
                {technicians.map((tech) => (
                  <div key={tech.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 ${tech.active ? 'bg-green-100' : 'bg-slate-200'} rounded-lg flex items-center justify-center`}>
                           <User className={`h-4 w-4 ${tech.active ? 'text-green-600' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{tech.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-black">{tech.active ? 'Available' : 'Inactive'}</p>
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => handleToggleTech(tech)}
                          className={`p-2 rounded-lg transition-all ${tech.active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                           <ShieldCheck className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleRemoveTech(tech.id)}
                          className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                           <Trash2 className="h-4 w-4" />
                        </button>
                     </div>
                  </div>
                ))}
             </div>
          </div>

          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#cc0000]" />
                Staff Access Management
             </h3>
             <form onSubmit={handleAddAdmin} className="flex gap-4 mb-8">
                <div className="flex-1 relative">
                   <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                   <input 
                    type="email"
                    placeholder="Enter staff email address..."
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#cc0000] outline-none transition-all"
                   />
                </div>
                <button 
                  disabled={loading}
                  className="px-6 py-3 bg-[#cc0000] text-white font-bold rounded-xl hover:bg-[#b30000] transition-all shadow-lg shadow-red-900/20 disabled:opacity-50"
                >
                  Whitelist
                </button>
             </form>

             <div className="space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Authorized Emails</div>
                {['kfourie277@gmail.com', ...admins.map(a => a.email)].map((email, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                           <ShieldCheck className="h-4 w-4 text-green-600" />
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{email}</span>
                     </div>
                     {email !== 'kfourie277@gmail.com' && (
                       <button 
                         onClick={() => handleRemoveAdmin(email)}
                         className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                       >
                          <Trash2 className="h-4 w-4" />
                       </button>
                     )}
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
