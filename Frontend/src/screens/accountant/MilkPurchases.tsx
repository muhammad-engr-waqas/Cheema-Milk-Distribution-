import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Save, Droplets, Trash2, Calendar, User, X, Download } from 'lucide-react';
import { useMilkTransactionContext, MilkRecord } from '../../contexts/MilkTransactionContext';
import { fmtDate } from '../../utils/dateFormat';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { syncSetting, syncDeletePurchaseEntry } from '../../services/ledgerSync';
import { settingsApi, ledgerApi, isOnline } from '../../services/api';

interface PurchaseRow {
  id: string;
  name: string;
  vol: number;
  fat: number;
  lr: number;
  snf: number;
  tsr: number;
  totalTs: number;
  rate: number;
  pricePerLiter: number;
  amount: number;
  routeId?: string;
  routeName?: string;
}

const defaultRow: PurchaseRow = {
  id: '1', name: '', vol: 0, fat: 0, lr: 0, snf: 0, tsr: 0, totalTs: 0, rate: 0, pricePerLiter: 0, amount: 0
};

export default function MilkPurchases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [bulkRate, setBulkRate] = useState<string>('');
  const rateLoadedRef = useRef(false);

  const [date, setDate] = useState(() => {
    if (location.state?.date) return location.state.date;
    return new Date().toISOString().split('T')[0];
  });

  const calculateSNF = (lr: number, fat: number) => {
    const snf = (0.25 * lr) + (0.22 * fat) + 0.72;
    return snf > 0 ? snf : 0;
  };

  const calculateTSR = (fat: number, snf: number) => fat + snf;
  const calculateTotalTS = (tsr: number, vol: number) => (tsr * vol) / 13;
  const calculateAmount = (totalTs: number, rate: number) => totalTs * rate;

  const [rows, setRows] = useState<PurchaseRow[]>(() => {
    if (location.state?.transferredRecords) {
      const recordsToLoad = location.state.transferredRecords as PurchaseRow[];
      // Saved rate localStorage se lo — transfer ke waqt bhi apply karo
      const savedRate = Number(localStorage.getItem('dairy_fixed_purchase_rate') || '') || 0;
      return recordsToLoad.map(row => {
        const rate = savedRate > 0 ? savedRate : (row.rate || 0);
        const totalTs = Number(row.totalTs) || 0;
        const vol = Number(row.vol) || 0;
        const amount = rate > 0 && totalTs > 0 ? totalTs * rate : 0;
        const pricePerLiter = vol > 0 && amount > 0 ? amount / vol : 0;
        return { ...row, rate, amount, pricePerLiter };
      });
    }
    return [{ ...defaultRow, id: Math.random().toString(36).substring(7), rate: 0 }];
  });

  // ── Load fixed purchase rate from backend on mount ──────────────────────
  useEffect(() => {
    if (rateLoadedRef.current) return;
    rateLoadedRef.current = true;
    // Apply local cache immediately for snappy UX
    const localRate = Number(localStorage.getItem('dairy_fixed_purchase_rate') || '') || 0;
    if (localRate > 0) {
      setBulkRate(String(localRate));
      // Sirf tab rows update karo agar kisi row ka rate 0 ho
      // (transferred rows ka rate already set hai — overwrite mat karo)
      setRows(prev => prev.map(row => {
        if (row.rate > 0) return row; // already has rate, skip
        const amount = localRate > 0 ? row.totalTs * localRate : 0;
        const pricePerLiter = row.vol > 0 ? amount / row.vol : 0;
        return { ...row, rate: localRate, amount, pricePerLiter };
      }));
    }
    if (!isOnline()) return;
    settingsApi.get('dairy_fixed_purchase_rate').then((res: any) => {
      if (res.success && res.data?.value !== undefined && res.data.value !== null) {
        const rate = Number(res.data.value) || 0;
        setBulkRate(String(rate || ''));
        localStorage.setItem('dairy_fixed_purchase_rate', String(rate));
        setRows(prev => prev.map(row => {
          if (row.rate > 0 && row.rate === rate) return row; // same rate, no change needed
          const amount = calculateAmount(row.totalTs, rate);
          const pricePerLiter = row.vol > 0 ? amount / row.vol : 0;
          return { ...row, rate, amount, pricePerLiter };
        }));
      }
    }).catch(() => {
      if (localRate > 0) setBulkRate(String(localRate));
    });
  }, []);

  const applyRateToRows = (rate: number) => {
    setBulkRate(String(rate || ''));
    setRows(prev => prev.map(row => {
      const amount = calculateAmount(row.totalTs, rate);
      const pricePerLiter = row.vol > 0 ? amount / row.vol : 0;
      return { ...row, rate, amount, pricePerLiter };
    }));
  };

  const { records, addRecords, removeRecord } = useMilkTransactionContext();

  // Backend PurchaseLedger se history — screen aur PDF dono match karen
  const [backendHistory, setBackendHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!isOnline()) return;
    setHistoryLoading(true);
    ledgerApi.getPurchase().then((res: any) => {
      if (res.success && Array.isArray(res.data)) {
        setBackendHistory(res.data
          .filter((e: any) => (Number(e.milkLiter) || 0) > 0 || (Number(e.totalAmount) || 0) > 0)
          .map((e: any) => ({
          id: e._id || e.id,
          date: e.date,
          type: 'Purchase',
          partyName: e.supplierName,
          vol: Number(e.milkLiter) || 0,
          fat: Number(e.fat) || 0,
          lr: Number(e.lr) || 0,
          snf: Number(e.snf) || 0,
          tsr: (Number(e.fat) || 0) + (Number(e.snf) || 0),
          totalTs: Number(e.totalTs) || 0,
          rate: Number(e.rate) || 0,
          amount: Number(e.totalAmount) || 0,
        })));
      }
    }).catch(() => {}).finally(() => setHistoryLoading(false));
  }, [records]); // records change hone par refresh

  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [areExtendedFiltersRemoved, setAreExtendedFiltersRemoved] = useState<boolean>(false);
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const getDaysDifference = (recordDateStr: string) => {
    if (!recordDateStr) return 999;
    const [ry, rm, rd] = recordDateStr.split('-').map(Number);
    const rDate = new Date(ry, rm - 1, rd);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    rDate.setHours(0, 0, 0, 0);
    
    const diffTime = today.getTime() - rDate.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };

  const getFilteredRecords = () => {
    // Backend history prefer karo, fallback to context records
    const purchaseRecords = backendHistory.length > 0
      ? backendHistory
      : records.filter(r => r.type === 'Purchase');
    return purchaseRecords.filter(record => {
      if (filterPeriod === 'one-day') {
        const diffDays = getDaysDifference(record.date);
        return diffDays === 0;
      }
      if (filterPeriod === 'yesterday') {
        const diffDays = getDaysDifference(record.date);
        return diffDays === 1;
      }
      if (filterPeriod === 'two-day') {
        const diffDays = getDaysDifference(record.date);
        return diffDays >= 0 && diffDays <= 1;
      }
      if (filterPeriod === 'three-day') {
        const diffDays = getDaysDifference(record.date);
        return diffDays >= 0 && diffDays <= 2;
      }
      if (filterPeriod === 'five-day') {
        const diffDays = getDaysDifference(record.date);
        return diffDays >= 0 && diffDays <= 4;
      }
      if (filterPeriod === 'seven-day') {
        const diffDays = getDaysDifference(record.date);
        return diffDays >= 0 && diffDays <= 6;
      }
      if (filterPeriod === 'custom') {
        if (!customStartDate || !customEndDate) return true;
        return record.date >= customStartDate && record.date <= customEndDate;
      }
      return true;
    });
  };

  const downloadPDF = async () => {
    // Backend PurchaseLedger se fresh data lo — MilkRecord context mein kuch entries missing ho sakti hain
    let allRecords: any[] = [];

    if (isOnline()) {
      try {
        // Filter params based on current filterPeriod
        const params: Record<string, string> = {};
        if (filterPeriod === 'one-day') {
          const today = new Date().toISOString().split('T')[0];
          params.startDate = today; params.endDate = today;
        } else if (filterPeriod === 'yesterday') {
          const d = new Date(); d.setDate(d.getDate() - 1);
          const y = d.toISOString().split('T')[0];
          params.startDate = y; params.endDate = y;
        } else if (filterPeriod === 'two-day') {
          const d = new Date(); d.setDate(d.getDate() - 1);
          params.startDate = d.toISOString().split('T')[0];
          params.endDate = new Date().toISOString().split('T')[0];
        } else if (filterPeriod === 'three-day') {
          const d = new Date(); d.setDate(d.getDate() - 2);
          params.startDate = d.toISOString().split('T')[0];
          params.endDate = new Date().toISOString().split('T')[0];
        } else if (filterPeriod === 'five-day') {
          const d = new Date(); d.setDate(d.getDate() - 4);
          params.startDate = d.toISOString().split('T')[0];
          params.endDate = new Date().toISOString().split('T')[0];
        } else if (filterPeriod === 'seven-day') {
          const d = new Date(); d.setDate(d.getDate() - 6);
          params.startDate = d.toISOString().split('T')[0];
          params.endDate = new Date().toISOString().split('T')[0];
        } else if (filterPeriod === 'custom' && customStartDate && customEndDate) {
          params.startDate = customStartDate; params.endDate = customEndDate;
        }

        const res: any = await ledgerApi.getPurchase(params);
        if (res.success && Array.isArray(res.data)) {
          allRecords = res.data.map((e: any) => ({
            date: e.date,
            partyName: e.supplierName,
            vol: Number(e.milkLiter) || 0,
            fat: Number(e.fat) || 0,
            lr: Number(e.lr) || 0,
            snf: Number(e.snf) || 0,
            tsr: Number(e.fat || 0) + Number(e.snf || 0),
            totalTs: Number(e.totalTs) || 0,
            rate: Number(e.rate) || 0,
            amount: Number(e.totalAmount) || 0,
          }));
        }
      } catch (e) {
        // fallback to context
      }
    }

    // Fallback: context se lo
    if (allRecords.length === 0) {
      allRecords = getFilteredRecords().map(r => ({
        date: r.date, partyName: r.partyName, vol: r.vol,
        fat: r.fat, lr: r.lr, snf: r.snf, tsr: r.tsr,
        totalTs: r.totalTs, rate: r.rate, amount: r.amount,
      }));
    }

    if (allRecords.length === 0) {
      alert("No records to export.");
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    
    // Header Section
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Milk Purchases Statement", margin, 12);
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    
    // Sub-header details
    let dateRangeText = "All Records";
    if (filterPeriod === 'one-day') dateRangeText = "One Day (Today)";
    else if (filterPeriod === 'yesterday') dateRangeText = "Yesterday";
    else if (filterPeriod === 'two-day') dateRangeText = "Two Days";
    else if (filterPeriod === 'three-day') dateRangeText = "Three Days";
    else if (filterPeriod === 'five-day') dateRangeText = "Five Days";
    else if (filterPeriod === 'seven-day') dateRangeText = "Seven Days";
    else if (filterPeriod === 'custom') dateRangeText = `Custom: ${fmtDate(customStartDate)} to ${fmtDate(customEndDate)}`;
    
    doc.text(`Period: ${dateRangeText}`, margin, 18);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-PK')}`, margin, 23);
    
    // Prepare table columns and rows
    const columns = [
      "S.No.", "Date", "Party Name", "Volume (L)",
      "Fat (%)", "LR", "SNF (%)", "TS (%)",
      "Total TS", "Rate (Rs)", "Amount (Rs)"
    ];

    const colWidth = usableWidth / columns.length;
    const columnStyles: Record<number, object> = {};
    columns.forEach((_, i) => { columnStyles[i] = { cellWidth: colWidth }; });
    
    const tableRows = allRecords.map((record: any, index: number) => [
      index + 1,
      fmtDate(record.date),
      record.partyName,
      Number(record.vol).toFixed(2),
      Number(record.fat || 0).toFixed(1),
      Number(record.lr || 0).toFixed(1),
      Number(record.snf || 0).toFixed(2),
      Number(record.tsr || 0).toFixed(2),
      Number(record.totalTs).toFixed(2),
      Number(record.rate).toFixed(2),
      Number(record.amount).toFixed(2)
    ]);
    
    // Calculate Totals/Averages for PDF
    const totalVol    = allRecords.reduce((sum: number, r: any) => sum + (Number(r.vol) || 0), 0);
    const totalTs     = allRecords.reduce((sum: number, r: any) => sum + (Number(r.totalTs) || 0), 0);
    const totalAmount = allRecords.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

    // Weighted averages (volume-weighted)
    const avgFat = totalVol > 0
      ? allRecords.reduce((s: number, r: any) => s + (Number(r.fat) || 0) * (Number(r.vol) || 0), 0) / totalVol
      : 0;
    const avgLr = totalVol > 0
      ? allRecords.reduce((s: number, r: any) => s + (Number(r.lr) || 0) * (Number(r.vol) || 0), 0) / totalVol
      : 0;
    const avgSnf = totalVol > 0
      ? allRecords.reduce((s: number, r: any) => s + (Number(r.snf) || 0) * (Number(r.vol) || 0), 0) / totalVol
      : 0;
    const avgTs = totalVol > 0
      ? allRecords.reduce((s: number, r: any) => s + (Number(r.tsr) || 0) * (Number(r.vol) || 0), 0) / totalVol
      : 0;

    // Add Totals/Averages row at the bottom
    tableRows.push([
      "Total / Avg", "", "",
      totalVol.toFixed(2),
      avgFat.toFixed(2),
      avgLr.toFixed(1),
      avgSnf.toFixed(2),
      avgTs.toFixed(2),
      totalTs.toFixed(2),
      "",
      `Rs. ${totalAmount.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: 27,
      head: [columns],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
      columnStyles,
      margin: { left: margin, right: margin },
      tableWidth: usableWidth,
      didParseCell: (data) => {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    
    doc.save(`Milk_Purchases_Statement_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  useEffect(() => {
    if (areExtendedFiltersRemoved && ['three-day', 'five-day', 'seven-day'].includes(filterPeriod)) {
      setFilterPeriod('two-day');
    }
  }, [areExtendedFiltersRemoved, filterPeriod]);

  // Note: location.state is intentionally NOT cleared — the useState initializer
  // reads it once on mount. Clearing it via navigate() would trigger a second
  // mount via AnimatePresence and lose the transferred rows.

  const handleRowChange = (id: string, field: keyof PurchaseRow, value: string) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        const numValue = field === 'name' ? value : Number(value) || 0;
        const newRow = { ...row, [field]: numValue } as PurchaseRow;
        
        if (field === 'fat' || field === 'lr') {
          newRow.snf = calculateSNF(newRow.lr, newRow.fat);
          newRow.tsr = calculateTSR(newRow.fat, newRow.snf);
          newRow.totalTs = calculateTotalTS(newRow.tsr, newRow.vol);
        }
        
        if (field === 'vol') {
          newRow.totalTs = calculateTotalTS(newRow.tsr, newRow.vol);
        }
        
        if (field === 'fat' || field === 'lr' || field === 'vol' || field === 'rate') {
          newRow.amount = calculateAmount(newRow.totalTs, newRow.rate);
          newRow.pricePerLiter = newRow.vol > 0 ? newRow.amount / newRow.vol : 0;
        }

        return newRow;
      }
      return row;
    }));
  };

  const handleBulkRateChange = (newRate: string) => {
    setBulkRate(newRate);
    localStorage.setItem('dairy_fixed_purchase_rate', newRate);
    // Backend sync
    syncSetting('dairy_fixed_purchase_rate', newRate).catch(() => {});
    const rateVal = Number(newRate) || 0;
    setRows(prevRows => prevRows.map(row => {
      const updatedRow = { ...row, rate: rateVal };
      updatedRow.amount = calculateAmount(updatedRow.totalTs, rateVal);
      updatedRow.pricePerLiter = updatedRow.vol > 0 ? updatedRow.amount / updatedRow.vol : 0;
      return updatedRow;
    }));
  };

  const addRow = () => {
    setRows(prev => [
      ...prev,
      {
        ...defaultRow,
        id: Math.random().toString(36).substring(7),
        rate: Number(bulkRate) || 0,
      }
    ]);
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setAreExtendedFiltersRemoved(true);
  };

  const [saveToast, setSaveToast] = useState<boolean>(false);

  const saveAll = () => {
    const validRows = rows.filter(r => r.name.trim() !== '' && (r.vol > 0 || r.amount > 0));
    if (validRows.length === 0) {
      alert("Please add at least one valid entry (Name, Volume/Amount required).");
      return;
    }

    // Fat% validation — 0 to 15%
    const badFatRow = validRows.find(r => r.fat > 15);
    if (badFatRow) {
      alert(`Invalid Fat% for "${badFatRow.name}": ${badFatRow.fat}%\nFat% should be between 0 and 15%. Please correct and try again.`);
      return;
    }
    // LR validation — 15 to 40
    const badLrRow = validRows.find(r => r.lr > 0 && (r.lr < 15 || r.lr > 40));
    if (badLrRow) {
      alert(`Invalid LR for "${badLrRow.name}": ${badLrRow.lr}\nLR should be between 15 and 40. Please correct and try again.`);
      return;
    }

    const newRecords: MilkRecord[] = validRows.map(r => ({
      id: r.id && !r.id.startsWith('1') ? r.id : Math.random().toString(36).substring(7),
      date: date,
      type: 'Purchase',
      partyName: r.name,
      vol: r.vol,
      fat: r.fat,
      lr: r.lr,
      snf: r.snf,
      tsr: r.tsr,
      totalTs: r.totalTs,
      rate: r.rate,
      pricePerLiter: r.pricePerLiter,
      amount: r.amount,
      routeId: r.routeId,
      routeName: r.routeName
    }));

    addRecords(newRecords);
    // FIX: alert() JS thread block karta tha — state update screen pe reflect nahi hoti thi
    // jab tak user OK nahi dabata. Ab non-blocking toast use karo.
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
    const currentFixedRate = Number(localStorage.getItem('dairy_fixed_purchase_rate') || '') || 0;
    setRows([{ ...defaultRow, id: Math.random().toString(36).substring(7), rate: currentFixedRate }]);
  };

  const totals = rows.reduce(
    (acc, row) => {
      acc.vol += row.vol;
      acc.fat += row.fat * row.vol; 
      acc.lr += row.lr * row.vol;
      acc.snf += row.snf * row.vol;
      acc.tsr += row.tsr * row.vol;
      acc.totalTs += row.totalTs;
      acc.amount += row.amount;
      return acc;
    },
    { vol: 0, fat: 0, lr: 0, snf: 0, tsr: 0, totalTs: 0, amount: 0 }
  );

  const avgFat = totals.vol > 0 ? (totals.fat / totals.vol) : 0;
  const avgLr = totals.vol > 0 ? (totals.lr / totals.vol) : 0;
  const avgSnf = totals.vol > 0 ? (totals.snf / totals.vol) : 0;
  const avgTsr = totals.vol > 0 ? (totals.tsr / totals.vol) : 0;
  const avgPricePerLiter = totals.vol > 0 ? (totals.amount / totals.vol) : 0;

  return (
    <div className="space-y-5">
      {/* ── Save Toast ── */}
      {saveToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg font-semibold text-sm flex items-center gap-2 animate-slide-down">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Purchase entries saved successfully!
        </div>
      )}
      {/* ── Page header ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-5 shadow-sm"> <div> <h1 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2 tracking-tight"> <Droplets className="w-5 h-5 text-blue-500" /> Milk Purchases
          </h1> <p className="text-sm text-[var(--text-muted)] mt-0.5">SNF, TS &amp; payment amounts calculate automatically</p> </div> <div className="flex flex-wrap gap-2.5 items-center">
          {/* Date */}
          <div className="flex items-center gap-2 bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl px-3 py-1.5"> <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" /> <input type="date" value={date} aria-label="Purchase date"
              onChange={e => { setDate(e.target.value); const r=Number(localStorage.getItem('dairy_fixed_purchase_rate')||'')||0; setRows([{...defaultRow,id:Math.random().toString(36).substring(7),rate:r}]); }}
              className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none border-none" /> </div>
          {/* Rate */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5"> <span className="text-xs font-black text-blue-700 whitespace-nowrap">Rate/TS:</span> <input id="bulk-purchase-rate" type="number" step="0.01" placeholder="—" value={bulkRate}
              onChange={e => handleBulkRateChange(e.target.value)}
              className="w-20 bg-transparent text-xs font-bold font-mono text-blue-900 outline-none border-none" aria-label="Fixed purchase rate" /> </div> <button onClick={addRow} className="btn btn-secondary btn-sm gap-1.5"><Plus className="w-3.5 h-3.5"/>Add Row</button> <button onClick={saveAll} className="btn btn-primary btn-sm gap-1.5"><Save className="w-3.5 h-3.5"/>Save All</button> </div> </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label:'Total Liters',  value:`${totals.vol.toFixed(2)} L`           },
          { label:'Avg SNF%',      value:`${avgSnf.toFixed(2)}%`                },
          { label:'Avg TS%',       value:`${avgTsr.toFixed(2)}%`                },
          { label:'Total TS',      value:totals.totalTs.toFixed(2)              },
          { label:'Avg Price/L',   value:`Rs.${avgPricePerLiter.toFixed(2)}`    },
          { label:'Total Payable', value:`Rs.${totals.amount.toFixed(2)}`, highlight: true },
        ].map(({ label, value, highlight }) => (
          <div key={label} className={`rounded-xl border p-3 flex flex-col gap-1 ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-[var(--surface-raised)] border-[var(--border)]'}`}> <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span> <span className={`text-base font-black font-mono ${highlight ? 'text-blue-700' : 'text-[var(--text-primary)]'}`}>{value}</span> </div>
        ))}
      </div>

      {/* ── Entry table ── */}
      <div className="table-wrapper"> <div className="table-scroll"> <table className="data-table"><thead><tr><th>Name / Party</th> <th>Vol (L)</th> <th>Fat%</th> <th>LR</th> <th>SNF%</th> <th>TS%</th> <th>Total TS</th> <th>Rate/TS</th> <th>Price/L</th> <th>Amount</th> <th></th></tr></thead><tbody>
              {rows.map((row) => (<tr key={row.id}><td> <input type="text" placeholder="Party Name" value={row.name}
                      onChange={e => handleRowChange(row.id,'name',e.target.value)}
                      className="form-input form-input-sm w-full min-w-[130px]" aria-label="Party name" /> </td> <td><input type="number" step="0.01" value={row.vol||''} onChange={e=>handleRowChange(row.id,'vol',e.target.value)} className="form-input form-input-sm w-20" aria-label="Volume" /></td> <td><input type="number" step="0.01" value={row.fat||''} onChange={e=>handleRowChange(row.id,'fat',e.target.value)} className="form-input form-input-sm w-16" aria-label="Fat percentage" /></td> <td><input type="number" step="0.01" value={row.lr||''}  onChange={e=>handleRowChange(row.id,'lr',e.target.value)}  className="form-input form-input-sm w-16" aria-label="LR value" /></td> <td><div className="form-input form-input-sm form-input-readonly w-16 font-mono">{row.snf.toFixed(2)}</div></td> <td><div className="form-input form-input-sm form-input-readonly w-16 font-mono">{row.tsr.toFixed(2)}</div></td> <td><div className="form-input form-input-sm w-20 bg-blue-50 border-blue-200 text-blue-800 font-bold font-mono">{row.totalTs.toFixed(2)}</div></td> <td><input type="number" step="0.01" value={row.rate||''} onChange={e=>handleRowChange(row.id,'rate',e.target.value)} className="form-input form-input-sm w-20" aria-label="Rate per TS" /></td> <td><div className="form-input form-input-sm form-input-readonly w-20 font-mono">{row.pricePerLiter.toFixed(2)}</div></td> <td><div className="form-input form-input-sm form-input-readonly font-bold font-mono">{row.amount.toFixed(2)}</div></td> <td> <button onClick={()=>removeRow(row.id)} aria-label="Remove row"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600 transition-all"> <Trash2 className="w-3.5 h-3.5"/> </button> </td></tr>
              ))}</tbody><tfoot><tr><td className="font-bold text-[var(--text-primary)]">TOTAL ({rows.length})</td> <td className="font-bold font-mono">{totals.vol.toFixed(2)}</td> <td className="text-[var(--text-muted)] text-xs">avg {avgFat.toFixed(2)}</td> <td className="text-[var(--text-muted)] text-xs">avg {avgLr.toFixed(2)}</td> <td className="text-[var(--text-muted)] text-xs">avg {avgSnf.toFixed(2)}</td> <td className="text-[var(--text-muted)] text-xs">avg {avgTsr.toFixed(2)}</td> <td className="font-bold text-blue-700 font-mono">{totals.totalTs.toFixed(2)}</td> <td></td> <td className="text-[var(--text-muted)] text-xs">avg {avgPricePerLiter.toFixed(2)}</td> <td className="font-black font-mono text-[var(--text-primary)]">{totals.amount.toFixed(2)}</td> <td></td></tr></tfoot></table> </div> </div>

      {/* ── History section ── */}
      <section> <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 mb-3"> <div className="flex items-center gap-3"> <h2 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Purchase History</h2> <button onClick={downloadPDF} className="btn btn-primary btn-sm gap-1.5"> <Download className="w-3.5 h-3.5"/> PDF
            </button> </div> <div className="filter-tabs">
            {([
              ['all','All'],['one-day','Today'],['yesterday','Yesterday'],['two-day','2 Days'],
              ...(!areExtendedFiltersRemoved ? [['three-day','3 Days'],['five-day','5 Days'],['seven-day','7 Days']] as const : []),
              ['custom','Custom'] as const
            ] as [string,string][]).map(([val,lbl]) => (
              <button key={val} onClick={()=>setFilterPeriod(val)} className={`filter-tab${filterPeriod===val?' active':''}`}>{lbl}</button>
            ))}
          </div> </div>

        {filterPeriod === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl px-4 py-3 mb-3 animate-slide-down"> <div className="flex items-center gap-2"> <label className="form-label mb-0">From</label> <input type="date" value={customStartDate} onChange={e=>setCustomStartDate(e.target.value)} className="form-input form-input-sm" /> </div> <div className="flex items-center gap-2"> <label className="form-label mb-0">To</label> <input type="date" value={customEndDate} onChange={e=>setCustomEndDate(e.target.value)} className="form-input form-input-sm" /> </div> </div>
        )}

        <div className="table-wrapper"> <div className="table-scroll"> <table className="data-table"><thead><tr><th>#</th><th>Date</th><th>Name / Party</th> <th>Vol (L)</th><th>TS%</th><th>Total TS</th><th>Amount</th> <th className="text-center">Action</th></tr></thead><tbody>
                {(() => {
                  const filtered = getFilteredRecords();
                  return filtered.length > 0 ? filtered.map((record, index) => (<tr key={record.id}><td className="text-[var(--text-muted)] font-mono">{index+1}</td> <td className="font-mono text-[var(--text-secondary)]">{fmtDate(record.date)}</td> <td> <button onClick={() => navigate(user?.role === 'Admin' ? '/admin/purchase-ledger' : '/accountant/purchase-ledger',{state:{preselectProfileName:record.partyName}})}
                          className="text-blue-600 hover:text-blue-700 font-semibold hover:underline text-left">
                          {record.partyName}
                        </button> </td> <td className="font-mono">{record.vol.toFixed(2)} L</td> <td className="font-mono text-[var(--text-secondary)]">{record.tsr.toFixed(2)}%</td> <td className="font-bold font-mono text-blue-700">{record.totalTs.toFixed(2)}</td> <td className="font-black font-mono">Rs. {record.amount.toFixed(2)}</td> <td className="text-center">
                        {user?.role==='Admin' && (
                          <button onClick={()=>{if(confirm(`Delete purchase for ${record.partyName}?`)){
                            // localStorage se bhi hatao
                            const lsKey = `cheema_purchase_ledger_${record.date}`;
                            try {
                              const entries = JSON.parse(localStorage.getItem(lsKey) || '[]');
                              localStorage.setItem(lsKey, JSON.stringify(entries.filter((e:any) => e.id !== record.id)));
                            } catch(e) {}
                            // Context state se hatao
                            removeRecord(record.id);
                            // Backend ledger + milkRecord delete
                            syncDeletePurchaseEntry(record.id).catch(()=>{});
                            setAreExtendedFiltersRemoved(true);
                          }}}
                            aria-label="Delete record"
                            className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600 transition-all"> <Trash2 className="w-3.5 h-3.5"/> </button>
                        )}
                      </td></tr>
                  )) : (<tr><td colSpan={8} className="text-center py-10 text-[var(--text-muted)] text-sm">No purchase records found for this period.</td></tr>
                  );
                })()}</tbody></table> </div> </div> </section> </div>
  );
}
