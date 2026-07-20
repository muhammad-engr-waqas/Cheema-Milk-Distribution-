import React, { createContext, useContext, useState, useEffect } from 'react';
import { accountsApi, advancesApi, isOnline, isBackendReachable, getToken } from '../services/api';
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
  advanceId?: string;
}

interface AccountContextType {
  accountRecords: AccountRecord[];
  addAccountRecord: (record: Omit<AccountRecord, 'id' | 'date' | 'time'> & { date?: string; time?: string }) => void;
  updateAccountRecord: (id: string, data: Partial<AccountRecord>) => void;
  updateAccountRecordByAdvanceId: (advanceId: string, data: Partial<AccountRecord>) => void;
  deleteAccountRecord: (id: string) => void;
  deleteAccountRecordByAdvanceId: (advanceId: string) => void;
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
  advanceId: r.advanceId || undefined,
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const canAccessAccounts = user?.role === 'Admin' || user?.role === 'Accountant';
  const [accountRecords, setAccountRecords] = useState<AccountRecord[]>(() => {
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

  const pendingSavesRef = React.useRef(0);
  const lastSaveTimeRef = React.useRef<number>(0);
  const canAccessRef = React.useRef(canAccessAccounts);
  // canAccessAccounts user state se aata hai — ref mein rakhte hain
  // taake syncFromBackend mein stale closure na ho
  React.useEffect(() => { canAccessRef.current = canAccessAccounts; }, [canAccessAccounts]);

  const beginPendingSave = () => { pendingSavesRef.current++; };
  const endPendingSave = () => {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
    lastSaveTimeRef.current = Date.now();
  };

  // syncFromBackend ko ref mein rakho — stale closure se bacho
  // (useEffect ke pollInterval mein purani value bind hoti thi)
  const syncFromBackendRef = React.useRef<() => Promise<void>>(async () => {});

  const syncFromBackend = React.useCallback(async () => {
    if (!canAccessRef.current) return;
    if (!isOnline()) return;
    if (!getToken()) return;
    if (pendingSavesRef.current > 0) return;
    // Save ke baad 20 sec tak sync mat karo
    const secsSinceSave = (Date.now() - lastSaveTimeRef.current) / 1000;
    if (secsSinceSave < 20) return;
    try {
      const result: any = await accountsApi.getAll();
      if (result.success && Array.isArray(result.data)) {
        const backendData = result.data.map(toFrontend);
        
        setAccountRecords(prev => {
          // FIX: Backend data se sirf woh records overwrite karo jo backend pe
          // hain. Jo records sirf localStorage mein hain (backend pe save nahi
          // hue — ACC- prefix ya advanceId wale) unhe merge karke rakho.
          // Warna background sync backend ka chota dataset la ke sab kuch
          // overwrite kar deta tha aur naye records gayab ho jaate the.
          const backendIds = new Set(backendData.map((r: AccountRecord) => r.id));
          
          // Sirf woh local records rakho jo backend mein nahi hain
          const localOnlyRecords = prev.filter(r =>
            !backendIds.has(r.id) &&
            (r.id.startsWith('ACC-') || !r.id.match(/^[a-f\d]{24}$/i))
          );
          
          const merged = [...backendData, ...localOnlyRecords];
          localStorage.setItem('dairy_account_records', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
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
  }, []);

  React.useEffect(() => { syncFromBackendRef.current = syncFromBackend; }, [syncFromBackend]);

  useEffect(() => {
    const call = () => syncFromBackendRef.current();
    window.addEventListener('online', call);
    window.addEventListener('dairy-user-login', call);
    window.addEventListener('dairy-visibility-sync', call);
    if (isOnline()) call();

    const pollInterval = setInterval(() => {
      if (isOnline()) call();
    }, 15000);

    return () => {
      window.removeEventListener('online', call);
      window.removeEventListener('dairy-user-login', call);
      window.removeEventListener('dairy-visibility-sync', call);
      clearInterval(pollInterval);
    };
  }, []);

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
          // tempId ko real MongoDB _id se replace karo
          setAccountRecords(prev => {
            const updated = prev.map(r =>
              r.id === newRecord.id ? { ...r, id: res.data._id } : r
            );
            localStorage.setItem('dairy_account_records', JSON.stringify(updated));
            return updated;
          });
        }
      }).catch((err: any) => {
        console.error('[AccountRecord] Backend save failed:', err);
        addToQueue('/accounts', 'POST', payload, 'Add account record');
      }).finally(() => { endPendingSave(); });
    } else {
      addToQueue('/accounts', 'POST', payload, 'Add account record');
    }
  };

  const updateAccountRecord = (id: string, data: Partial<AccountRecord>) => {
    setAccountRecords(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...data } : r);
      localStorage.setItem('dairy_account_records', JSON.stringify(updated));
      return updated;
    });
    beginPendingSave();
    if (isOnline()) {
      accountsApi.update(id, data)
        .then(() => {
          // Reverse sync: AccountRecord update hone ke baad AdvanceTransaction bhi update karo
          const record = accountRecords.find(r => r.id === id);
          const advId = record?.advanceId;
          if (advId) {
            const advUpdate: any = {};
            if (data.amount !== undefined) advUpdate.amount = data.amount;
            if (data.date !== undefined) advUpdate.date = data.date;
            if (data.note !== undefined) advUpdate.description = data.note;
            if (data.method !== undefined) advUpdate.paymentMethod = data.method;
            if (Object.keys(advUpdate).length > 0) {
              advancesApi.update(advId, advUpdate)
                .then(() => window.dispatchEvent(new CustomEvent('dairy-advance-updated', { detail: { advanceId: advId } })))
                .catch(() => {});
            }
          }
        })
        .catch(() => addToQueue(`/accounts/${id}`, 'PUT', data, 'Update account record'))
        .finally(() => endPendingSave());
    } else {
      addToQueue(`/accounts/${id}`, 'PUT', data, 'Update account record');
      endPendingSave();
    }
  };

  const updateAccountRecordByAdvanceId = (advanceId: string, data: Partial<AccountRecord>) => {
    const record = accountRecords.find(r => r.advanceId === advanceId);
    if (!record) return;
    updateAccountRecord(record.id, data);
  };

  const deleteAccountRecord = (id: string) => {
    // advanceId store karo delete se pehle
    const record = accountRecords.find(r => r.id === id);
    const advanceId = record?.advanceId;

    setAccountRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      localStorage.setItem('dairy_account_records', JSON.stringify(updated));
      return updated;
    });

    beginPendingSave();
    if (isOnline()) {
      accountsApi.delete(id)
        .then(() => {
          // Reverse sync: AccountRecord delete hone ke baad AdvanceTransaction bhi delete karo
          if (advanceId) {
            advancesApi.delete(advanceId).catch(() => {});
            // AdvanceContext ko refresh karo
            window.dispatchEvent(new CustomEvent('dairy-advance-deleted', { detail: { advanceId } }));
          }
        })
        .catch(() => addToQueue(`/accounts/${id}`, 'DELETE', undefined, 'Delete account record'))
        .finally(() => endPendingSave());
    } else {
      addToQueue(`/accounts/${id}`, 'DELETE', undefined, 'Delete account record');
      endPendingSave();
    }
  };

  const deleteAccountRecordByAdvanceId = (advanceId: string) => {
    const record = accountRecords.find(r => r.advanceId === advanceId);
    if (!record) return;
    deleteAccountRecord(record.id);
  };

  return (
    <AccountContext.Provider value={{
      accountRecords, addAccountRecord,
      updateAccountRecord, updateAccountRecordByAdvanceId,
      deleteAccountRecord, deleteAccountRecordByAdvanceId,
      syncFromBackend
    }}>
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
