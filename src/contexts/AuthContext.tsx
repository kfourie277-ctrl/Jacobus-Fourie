import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  isFirstAdmin: boolean;
  isWorkshopSession: boolean;
  isOfficeAdminSession: boolean;
  setWorkshopSession: (val: boolean) => void;
  setOfficeAdminSession: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  isAdmin: false, 
  loading: true, 
  isFirstAdmin: false,
  isWorkshopSession: false,
  isOfficeAdminSession: false,
  setWorkshopSession: () => {},
  setOfficeAdminSession: () => {}
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('isOfficeAdminSession') === 'true';
  });
  const [loading, setLoading] = useState(true);
  const [isFirstAdmin, setIsFirstAdmin] = useState(false);
  const [isWorkshopSession, setIsWorkshopSession] = useState(() => {
    return localStorage.getItem('isWorkshopSession') === 'true';
  });
  const [isOfficeAdminSession, setIsOfficeAdminSessionInternal] = useState(() => {
    return localStorage.getItem('isOfficeAdminSession') === 'true';
  });

  const setWorkshopSession = (val: boolean) => {
    setIsWorkshopSession(val);
    localStorage.setItem('isWorkshopSession', val.toString());
  };

  const setOfficeAdminSession = (val: boolean) => {
    setIsOfficeAdminSessionInternal(val);
    localStorage.setItem('isOfficeAdminSession', val.toString());
    setIsAdmin(val || (user ? true : false)); // Fast update
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setUser(user);
      if (user) {
        // Auto-restore session records in Firestore for anonymous workers
        if (user.isAnonymous) {
          const hasOfficeAdmin = localStorage.getItem('isOfficeAdminSession') === 'true';
          const hasWorkshop = localStorage.getItem('isWorkshopSession') === 'true';
          if (hasOfficeAdmin || hasWorkshop) {
            try {
              await setDoc(doc(db, 'workshop_sessions', user.uid), {
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
                ...(hasOfficeAdmin ? { isAdminSession: true, role: 'admin' } : {})
              }, { merge: true });
              
              if (hasOfficeAdmin) {
                await setDoc(doc(db, 'admin_sessions', user.uid), {
                  createdAt: serverTimestamp(),
                  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
                }, { merge: true });
              }
            } catch (sessionRestoreError) {
              console.warn("Skipped auto-restoring session records in Firestore:", sessionRestoreError);
            }
          }
        }

        let isWhitelisted = false;
        // Check if user is the bootstrapped admin email
        if ((user.email || '').toLowerCase() === 'kfourie277@gmail.com') {
          isWhitelisted = true;
        } else if (!user.isAnonymous) {
          try {
            // Check both UID collection and Email whitelist
            const adminDoc = await getDoc(doc(db, 'admins', user.uid));
            if (!active) return;
            isWhitelisted = adminDoc.exists();
            
            if (!isWhitelisted && user.email) {
              const whitelistDoc = await getDoc(doc(db, 'admin_whitelists', (user.email || '').toLowerCase()));
              if (!active) return;
              isWhitelisted = whitelistDoc.exists();
            }
          } catch (error) {
            console.error("Error checking admin status:", error);
          }
        }
        setIsAdmin(isWhitelisted || localStorage.getItem('isOfficeAdminSession') === 'true');
        setLoading(false);
      } else {
        const hasOfficeAdmin = localStorage.getItem('isOfficeAdminSession') === 'true';
        setIsAdmin(hasOfficeAdmin);
        // If workshop or admin state is true but user auth is missing, restore anonymously
        if (localStorage.getItem('isWorkshopSession') === 'true' || hasOfficeAdmin) {
          try {
            await signInAnonymously(auth);
          } catch (err: any) {
            if (err?.code === 'auth/admin-restricted-operation') {
              console.warn("Anonymous authentication is disabled in Firebase console, proceeding with secure local storage session.");
            } else {
              console.warn("Skipped restoring anonymous session:", err);
            }
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, isFirstAdmin, isWorkshopSession, isOfficeAdminSession, setWorkshopSession, setOfficeAdminSession }}>
      {children}
    </AuthContext.Provider>
  );
}
