import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initOfflineSync, pullSyncLogs } from './services/offlineSync';
import { pullLedgerFromBackend } from './services/ledgerSync';
import { ledgerApi, isOnline } from './services/api';

// FIX: Backend ke /api/ledger/purchase aur /api/ledger/sale (GET) routes sirf
// Admin/Accountant role ke liye open hain. Pehle pullLedgerFromBackend() har
// role (MilkTester, Driver) ke login par bhi chal jata tha, jisse console
// mein baar baar 403 (Forbidden) aata tha. Ab sirf un roles ke liye chalega
// jinke paas actually access hai.
const canAccessLedger = (): boolean => {
  try {
    const saved = localStorage.getItem('dairy_user');
    if (!saved) return false;
    const role = JSON.parse(saved)?.role;
    return role === 'Admin' || role === 'Accountant';
  } catch { return false; }
};

// ── Offline sync ──────────────────────────────────────────────────────────────
initOfflineSync();

// Internet wapas aane pe sirf backend se fresh data pull karo
// fullLedgerSyncToBackend NAHI call karo — woh duplicate entries banata hai
// (doosre browser ka localStorage data backend pe push ho jaata tha)
window.addEventListener('online', () => {
  setTimeout(() => {
    if (canAccessLedger()) pullLedgerFromBackend();
    pullSyncLogs();
  }, 3000);
});

if (navigator.onLine) {
  setTimeout(() => {
    if (canAccessLedger()) pullLedgerFromBackend();
    pullSyncLogs();
  }, 2000);
}

// ── Global reset helper (Admin panel se call hoga) ───────────────────────────
(window as any).resetAllEntries = () => {
  const keys = [
    'dairy_milk_records', 'dairy_dispatches', 'dairy_account_records',
    'dairy_advances', 'cheema_route_collections', 'dairy_lab_reports',
    'cheema_saved_suppliers', 'cheema_saved_customers',
    'dairy_dashboard_data', 'dairy_sync_queue', 'dairy_sync_logs',
  ];
  keys.forEach(k => localStorage.removeItem(k));

  // Clear dynamic ledger date keys
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('cheema_purchase_ledger_') || key.startsWith('cheema_sale_ledger_'))) {
      toRemove.push(key);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));

  // Backend reset
  if (isOnline()) {
    ledgerApi.resetAll()
      .then(() => console.log('[Reset] Backend cleared'))
      .catch((err: any) => console.warn('[Reset] Backend reset failed:', err.message));
  }

  window.dispatchEvent(new CustomEvent('dairy-reset'));
  console.log('[Reset] All local data cleared.');
  setTimeout(() => window.location.reload(), 150);
};

// ── Mount app ─────────────────────────────────────────────────────────────────
createRoot(document.getElementById('root')!).render(
  <StrictMode> <App /> </StrictMode>,
);
