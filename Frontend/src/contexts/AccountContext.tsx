import React, { createContext, useContext, useState, useEffect } from 'react';
import { accountsApi, isOnline, isBackendReachable, getToken } from '../services/api';
import { addToQueue } from '../services/offlineSync';
import { useAuth } from './AuthContext';

export interface AccountRecord {
  id: string;
  type: string;
  category: string;
  amount: number;
  method: string;
  payer: string;
  payee: string;
  note: string;
  date: string;
  time: string;
  user?: string;
  liters?: number;
  vehicleNumber?: string;
  driverDetails?: string;
}

interface AccountContextType {
  accountRecords: AccountRecord[];
  addAccountRecord: (record: Omit<AccountRecord, 'id' | 'date' | 'time'> & { date?: string; time?: string }) => void;
  deleteAccountRecord: (id: string) => void;
  syncFromBackend: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

const toFrontend = (r: any): AccountRecord => ({
  id: r._id || r.id,
  type: r.type,
  category: r.category,
  amount: r.amount,
  method: r.method,
  payer: r.payer,
  payee: r.payee,
  note: r.note,
  date: r.date,
  time: r.time,
  user: r.user,
  liters: r.liters,
  vehicleNumber: r.vehicleNumber,
  driverDetails: r.driverDetails,
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // FIX: Backend ka /api/accounts route sirf Admin/Accountant ke liye hai
  // (authorize('Admin', 'Accountant')). Pehle ye context har role (MilkTester,
  // Driver) ke liye bhi har 15 second baad sync karne ki koshish karta tha,
  // jisse console mein baar baar 403 (Forbidden) aata tha. Ab sirf un roles
  // ke liye sync hoga jinke paas actually access hai.
  const canAccessAccounts = user?.role === 'Admin' || user?.role === 'Accountant';
  const [accountRecords, setAccountRecords] = useState<AccountRecord[]>(() => {
    // Instantly localStorage se load karo — page switch pe delay nahi hoga
    try {
      const cached = localStorage.getItem('dairy_account_records');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  React.useEffect(() => {
    const handleReset = () => setAccountRecords([]);
    window.addEventListener('dairy-reset', handleReset);
    return () => window.removeEventListener('dairy-reset', handleReset);
  }, []);

  useEffect(() => {
    const handleOnline = () => syncFromBackend();
    const handleLogin = () => syncFromBackend();
    const handleVisibility = () => syncFromBackend();
    window.addEventListener('online', handleOnline);
    window.addEventListener('dairy-user-login', handleLogin);
    window.addEventListener('dairy-visibility-sync', handleVisibility);
    if (isOnline()) syncFromBackend();

    const pollInterval = setInterval(() => {
      if (isOnline()) syncFromBackend();
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('dairy-user-login', handleLogin);
      window.removeEventListener('dairy-visibility-sync', handleVisibility);
      clearInterval(pollInterval);
    };
  }, []);

  // FIX: Same systemic race-condition fix jo baaki contexts mein hai — jab tak
  // koi naya account record backend ko save ho raha hai, background poll usay
  // overwrite na kare.
  const pendingSavesRef = React.useRef(0);
  const beginPendingSave = () => { pendingSavesRef.current++; };
  const endPendingSave = () => {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
    if (pendingSavesRef.current === 0) {
      setTimeout(() => { syncFromBackend(); }, 500);
    }
  };

  const syncFromBackend = async () => {
    if (!canAccessAccounts) return;
    if (!isOnline()) return;
    if (!getToken()) return;
    if (pendingSavesRef.current > 0) return;
    try {
      const result: any = await accountsApi.getAll();
      if (result.success && Array.isArray(result.data)) {
        // Backend ka data hi final source of truth — empty ho ya full
        const frontendData = result.data.map(toFrontend);
        setAccountRecords(frontendData);
        localStorage.setItem('dairy_account_records', JSON.stringify(frontendData));
      }
    } catch (err) {
      // FIX: Sirf genuinely offline hone pe hi purana cache dikhao.
      // Pehle ye har error (server/auth glitch) pe purana data wapas dikha
      // deta tha jisse newly-added records randomly gayab ho jaate the.
      if (!isOnline()) {
        try {
          const cached = localStorage.getItem('dairy_account_records');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) setAccountRecords(parsed);
          }
        } catch {}
      }
    }
  };

  const addAccountRecord = (record: Omit<AccountRecord, 'id' | 'date' | 'time'> & { date?: string; time?: string }) => {
    const now = new Date();
    const dateStr = record.date || now.toISOString().split('T')[0];
    const timeStr = record.time || now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const newRecord = { ...record, id: `ACC-${Date.now()}`, date: dateStr, time: timeStr };

    setAccountRecords(prev => {
      const updated = [newRecord, ...prev];
      localStorage.setItem('dairy_account_records', JSON.stringify(updated));
      return updated;
    });

    const payload = { ...record, date: dateStr, time: timeStr };
    if (isOnline()) {
      beginPendingSave();
      accountsApi.create(payload).then((res: any) => {
        if (res.success && res.data?._id) {
          setAccountRecords(prev => prev.map(r =>
            r.id === newRecord.id ? { ...r, id: res.data._id } : r
          ));
        }
      }).catch(() => addToQueue('/accounts', 'POST', payload, 'Add account record'))
        .finally(() => { endPendingSave(); });
    } else {
      addToQueue('/accounts', 'POST', payload, 'Add account record');
    }
  };

  const deleteAccountRecord = (id: string) => {
    setAccountRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      localStorage.setItem('dairy_account_records', JSON.stringify(updated));
      return updated;
    });

    // pendingSavesRef guard — warna background/periodic syncFromBackend()
    // delete abhi backend pe complete hone se pehle hi purana data wapas
    // la sakta hai aur deleted record dobara dikhne lagta hai.
    beginPendingSave();
    if (isOnline()) {
      accountsApi.delete(id)
        .catch(() => addToQueue(`/accounts/${id}`, 'DELETE', undefined, 'Delete account record'))
        .finally(() => endPendingSave());
    } else {
      addToQueue(`/accounts/${id}`, 'DELETE', undefined, 'Delete account record');
      endPendingSave();
    }
  };

  return (
    <AccountContext.Provider value={{ accountRecords, addAccountRecord, deleteAccountRecord, syncFromBackend }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccountContext() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccountContext must be used within an AccountProvider');
  }
  return context;
}
