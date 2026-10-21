import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Copy, 
  Check, 
  Trash2, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Upload, 
  RotateCcw,
  Sparkles,
  GitCompare,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';

export function SsRefining() {
  const [totalRawText, setTotalRawText] = useState<string>('');
  const [existingRawText, setExistingRawText] = useState<string>('');
  
  // Options
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [trimWhitespace, setTrimWhitespace] = useState<boolean>(true);
  
  // Results view tab: 'missing' | 'matched' | 'extra'
  const [activeResultTab, setActiveResultTab] = useState<'missing' | 'matched' | 'extra'>('missing');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [copiedItemIndex, setCopiedItemIndex] = useState<number | null>(null);

  // Helper to extract clean reference numbers from raw pasted text (handles newlines, tabs, commas, semi-colons, Excel paste)
  const parseReferenceNumbers = (rawText: string) => {
    if (!rawText.trim()) return [];
    
    const lines = rawText.split(/\r?\n/);
    const items: { ref: string; raw: string; lineIndex: number }[] = [];

    lines.forEach((line, idx) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // If line contains tabs (copied from Excel), take first column as reference number, rest as extraInfo
      if (trimmedLine.includes('\t')) {
        const parts = trimmedLine.split('\t');
        const firstCol = parts[0].trim();
        const rest = parts.slice(1).join(' | ').trim();
        if (firstCol) {
          items.push({ ref: firstCol, raw: rest, lineIndex: idx + 1 });
        }
      } else if (trimmedLine.includes(',')) {
        // Handle comma-separated values on single or multiple lines
        const parts = trimmedLine.split(',');
        parts.forEach(p => {
          const cleanP = p.trim();
          if (cleanP) {
            items.push({ ref: cleanP, raw: '', lineIndex: idx + 1 });
          }
        });
      } else if (trimmedLine.includes(';')) {
        // Handle semicolon-separated
        const parts = trimmedLine.split(';');
        parts.forEach(p => {
          const cleanP = p.trim();
          if (cleanP) {
            items.push({ ref: cleanP, raw: '', lineIndex: idx + 1 });
          }
        });
      } else {
        items.push({ ref: trimmedLine, raw: '', lineIndex: idx + 1 });
      }
    });

    return items;
  };

  // Parsed total / master reference numbers
  const totalParsed = useMemo(() => {
    return parseReferenceNumbers(totalRawText);
  }, [totalRawText]);

  // Parsed existing reference numbers
  const existingParsed = useMemo(() => {
    return parseReferenceNumbers(existingRawText);
  }, [existingRawText]);

  // Normalized map of existing reference numbers
  const existingSet = useMemo(() => {
    const set = new Set<string>();
    existingParsed.forEach(item => {
      let key = item.ref;
      if (trimWhitespace) key = key.trim();
      if (!caseSensitive) key = key.toLowerCase();
      if (key) set.add(key);
    });
    return set;
  }, [existingParsed, caseSensitive, trimWhitespace]);

  // Normalized map of total reference numbers
  const totalSet = useMemo(() => {
    const set = new Set<string>();
    totalParsed.forEach(item => {
      let key = item.ref;
      if (trimWhitespace) key = key.trim();
      if (!caseSensitive) key = key.toLowerCase();
      if (key) set.add(key);
    });
    return set;
  }, [totalParsed, caseSensitive, trimWhitespace]);

  // Reconciled lists
  const { missingList, matchedList, extraList } = useMemo(() => {
    const seenTotalKeys = new Set<string>();
    const missing: { ref: string; raw: string; lineIndex: number }[] = [];
    const matched: { ref: string; raw: string; lineIndex: number }[] = [];

    totalParsed.forEach(item => {
      let key = item.ref;
      if (trimWhitespace) key = key.trim();
      if (!caseSensitive) key = key.toLowerCase();
      if (!key || seenTotalKeys.has(key)) return;
      seenTotalKeys.add(key);

      if (existingSet.has(key)) {
        matched.push(item);
      } else {
        missing.push(item);
      }
    });

    // Extra numbers: in existing but not in total
    const seenExistingKeys = new Set<string>();
    const extra: { ref: string; raw: string; lineIndex: number }[] = [];
    existingParsed.forEach(item => {
      let key = item.ref;
      if (trimWhitespace) key = key.trim();
      if (!caseSensitive) key = key.toLowerCase();
      if (!key || seenExistingKeys.has(key)) return;
      seenExistingKeys.add(key);

      if (!totalSet.has(key)) {
        extra.push(item);
      }
    });

    return { missingList: missing, matchedList: matched, extraList: extra };
  }, [totalParsed, existingParsed, existingSet, totalSet, caseSensitive, trimWhitespace]);

  // Filtered view by search query
  const displayedList = useMemo(() => {
    const baseList = activeResultTab === 'missing' 
      ? missingList 
      : activeResultTab === 'matched' 
      ? matchedList 
      : extraList;

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase().trim();
    return baseList.filter(item => 
      item.ref.toLowerCase().includes(q) || (item.raw && item.raw.toLowerCase().includes(q))
    );
  }, [activeResultTab, missingList, matchedList, extraList, searchQuery]);

  // Copy all missing reference numbers to clipboard
  const handleCopyMissing = () => {
    if (missingList.length === 0) return;
    const textToCopy = missingList.map(item => item.ref).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // Copy single reference number
  const handleCopySingle = (ref: string, index: number) => {
    navigator.clipboard.writeText(ref);
    setCopiedItemIndex(index);
    setTimeout(() => setCopiedItemIndex(null), 1500);
  };

  // Export Missing to Excel
  const handleDownloadExcel = () => {
    if (missingList.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Missing Reference Numbers
    const missingHeaders = ['#', 'Missing Reference Number', 'Original Row', 'Additional Info'];
    const missingRows = missingList.map((item, idx) => [
      idx + 1,
      item.ref,
      item.lineIndex,
      item.raw || ''
    ]);
    const wsMissing = XLSX.utils.aoa_to_sheet([missingHeaders, ...missingRows]);
    wsMissing['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing_Reference_Numbers');

    // Sheet 2: Summary Sheet
    const summaryData = [
      ['Metric', 'Count'],
      ['Total Master Numbers', totalSet.size],
      ['Total Existing Numbers', existingSet.size],
      ['Missing Reference Numbers', missingList.length],
      ['Matched Reference Numbers', matchedList.length],
      ['Extra in Existing (Unmatched)', extraList.length],
      ['Match Percentage', totalSet.size > 0 ? `${Math.round((matchedList.length / totalSet.size) * 100)}%` : '0%'],
      ['Export Date', new Date().toLocaleString()]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Reconciliation_Summary');

    // Download file
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `SS_Refining_Missing_References_${dateStr}.xlsx`);
  };

  // Export CSV
  const handleDownloadCsv = () => {
    if (missingList.length === 0) return;
    const csvContent = 'data:text/csv;charset=utf-8,' + 
      ['Reference Number', ...missingList.map(m => `"${m.ref.replace(/"/g, '""')}"`)].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `SS_Refining_Missing_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // File Upload Helper (supports .xlsx, .xls, .csv, .txt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'total' | 'existing') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const sheetJson = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });
          
          // Extract first column values or lines
          const extracted: string[] = [];
          sheetJson.forEach(row => {
            if (Array.isArray(row) && row[0] !== undefined && row[0] !== null) {
              const val = String(row[0]).trim();
              if (val) extracted.push(val);
            }
          });
          const text = extracted.join('\n');
          if (target === 'total') setTotalRawText(text);
          else setExistingRawText(text);
        } catch (err) {
          console.error('Error reading Excel file:', err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV or plain text
      reader.onload = (event) => {
        const text = String(event.target?.result || '');
        if (target === 'total') setTotalRawText(text);
        else setExistingRawText(text);
      };
      reader.readAsText(file);
    }

    // Reset input so user can upload same file again
    e.target.value = '';
  };

  // Sample data loader to instantly test the feature
  const handleLoadSampleData = () => {
    const sampleTotal = [
      'REF-10001\tCustomer Alpha Inc',
      'REF-10002\tCustomer Beta Corp',
      'REF-10003\tCustomer Gamma LLC',
      'REF-10004\tDelta Systems Group',
      'REF-10005\tEpsilon Logistics Ltd',
      'REF-10006\tZeta Technologies',
      'REF-10007\tEta Trading Co',
      'REF-10008\tTheta Industrial',
      'REF-10009\tIota Global Partners',
      'REF-10010\tKappa Supply Chain'
    ].join('\n');

    const sampleExisting = [
      'REF-10001',
      'REF-10003',
      'REF-10005',
      'REF-10007',
      'REF-10010',
      'REF-99999' // extra
    ].join('\n');

    setTotalRawText(sampleTotal);
    setExistingRawText(sampleExisting);
    setActiveResultTab('missing');
  };

  const matchPercent = totalSet.size > 0 
    ? Math.round((matchedList.length / totalSet.size) * 100) 
    : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 flex-shrink-0">
            <GitCompare size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                SS Refining
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                Diff & Reconciliation
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Copy-paste total file reference numbers & existing numbers to instantly find and export all missing records.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {(totalRawText || existingRawText) && (
            <button
              onClick={() => {
                setTotalRawText('');
                setExistingRawText('');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer"
              title="Reset both input fields"
            >
              <RotateCcw size={13} />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* INPUT WORKSPACE (TWO COMPACT SIDE-BY-SIDE PANELS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* PANEL 1: TOTAL FILE DATA (MASTER / TARGET) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Total File Data (Master Numbers)
                </h3>
                <span className="text-[11px] text-slate-400">
                  Full reference numbers list from total file
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <label 
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                title="Upload Excel, CSV, or Text file"
              >
                <Upload size={12} />
                <span>Upload</span>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv,.txt" 
                  onChange={(e) => handleFileUpload(e, 'total')} 
                  className="hidden" 
                />
              </label>

              {totalRawText && (
                <button
                  type="button"
                  onClick={() => setTotalRawText('')}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                  title="Clear total file data"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="relative flex-1">
            <textarea
              value={totalRawText}
              onChange={(e) => setTotalRawText(e.target.value)}
              placeholder="Paste total file data or reference numbers here...&#10;Supports:&#10;• Copy-paste directly from Excel columns&#10;• One reference number per line&#10;• Comma or tab separated numbers"
              rows={9}
              className="w-full p-3 text-xs font-mono bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 placeholder:text-slate-400 resize-y scrollbar-thin transition-all leading-relaxed"
            />
          </div>

          {/* Stats footer for Panel 1 */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 text-slate-500 tabular-nums">
            <span>
              Lines: <strong className="text-slate-800">{totalParsed.length}</strong>
            </span>
            <span>
              Unique Numbers: <strong className="text-indigo-600">{totalSet.size}</strong>
            </span>
          </div>
        </div>

        {/* PANEL 2: EXISTING REFERENCE NUMBERS */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                2
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Existing Reference Numbers
                </h3>
                <span className="text-[11px] text-slate-400">
                  Reference numbers already processed / in system
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <label 
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                title="Upload Excel, CSV, or Text file"
              >
                <Upload size={12} />
                <span>Upload</span>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv,.txt" 
                  onChange={(e) => handleFileUpload(e, 'existing')} 
                  className="hidden" 
                />
              </label>

              {existingRawText && (
                <button
                  type="button"
                  onClick={() => setExistingRawText('')}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                  title="Clear existing reference numbers"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="relative flex-1">
            <textarea
              value={existingRawText}
              onChange={(e) => setExistingRawText(e.target.value)}
              placeholder="Paste existing reference numbers here...&#10;Supports:&#10;• Copy-paste directly from Excel columns&#10;• One reference number per line&#10;• Comma or tab separated numbers"
              rows={9}
              className="w-full p-3 text-xs font-mono bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 placeholder:text-slate-400 resize-y scrollbar-thin transition-all leading-relaxed"
            />
          </div>

          {/* Stats footer for Panel 2 */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 text-slate-500 tabular-nums">
            <span>
              Lines: <strong className="text-slate-800">{existingParsed.length}</strong>
            </span>
            <span>
              Unique Numbers: <strong className="text-emerald-600">{existingSet.size}</strong>
            </span>
          </div>
        </div>

      </div>

      {/* QUICK COMPARISON OPTIONS */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!caseSensitive}
              onChange={(e) => setCaseSensitive(!e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span className="font-medium">Case-insensitive match (A123 = a123)</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trimWhitespace}
              onChange={(e) => setTrimWhitespace(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span className="font-medium">Trim whitespace</span>
          </label>
        </div>

        <div className="text-[11px] text-slate-400">
          Duplicate numbers are automatically deduplicated
        </div>
      </div>

      {/* RECONCILIATION SUMMARY DASHBOARD & RESULTS */}
      {(totalRawText || existingRawText) ? (
        <div className="space-y-4">
          
          {/* STATS METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            
            {/* CARD 1: MISSING REFERENCE NUMBERS (HERO CARD) */}
            <div className={`p-4 rounded-2xl border shadow-2xs transition-all ${
              missingList.length > 0 
                ? 'bg-rose-50/70 border-rose-200 ring-1 ring-rose-200/50' 
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  Missing In Existing
                </span>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              </div>
              <div className="text-2xl font-black text-rose-700 mt-1.5 tabular-nums flex items-baseline gap-2">
                <span>{missingList.length}</span>
                <span className="text-xs font-semibold text-rose-600">
                  {missingList.length === 1 ? 'number' : 'numbers'}
                </span>
              </div>
              <p className="text-[11px] text-rose-600 mt-1">
                {missingList.length > 0 
                  ? 'Present in Total file but NOT in Existing numbers' 
                  : 'All reference numbers found in existing!'}
              </p>
            </div>

            {/* CARD 2: MATCHED NUMBERS */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                Found / Matched
              </span>
              <div className="text-2xl font-black text-emerald-700 mt-1.5 tabular-nums flex items-baseline gap-2">
                <span>{matchedList.length}</span>
                <span className="text-xs font-semibold text-emerald-600">
                  ({matchPercent}% coverage)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Present in both Total file and Existing numbers
              </p>
            </div>

            {/* CARD 3: TOTAL MASTER NUMBERS */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Total File Target
              </span>
              <div className="text-2xl font-black text-slate-900 mt-1.5 tabular-nums flex items-baseline gap-2">
                <span>{totalSet.size}</span>
                <span className="text-xs font-semibold text-slate-500">unique items</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Total expected reference numbers
              </p>
            </div>

            {/* CARD 4: EXTRA IN EXISTING */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                Extra In Existing
              </span>
              <div className="text-2xl font-black text-amber-700 mt-1.5 tabular-nums flex items-baseline gap-2">
                <span>{extraList.length}</span>
                <span className="text-xs font-semibold text-amber-600">additional</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Present in existing but not in total file
              </p>
            </div>

          </div>

          {/* RESULTS CARD WITH ACTIONS AND TABLE */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            
            {/* Top Toolbar */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap bg-slate-50/50">
              
              {/* Tab Selector */}
              <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveResultTab('missing')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeResultTab === 'missing'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <AlertCircle size={13} />
                  <span>Missing Numbers</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    activeResultTab === 'missing' ? 'bg-white text-rose-700' : 'bg-slate-300 text-slate-800'
                  }`}>
                    {missingList.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveResultTab('matched')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeResultTab === 'matched'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 size={13} />
                  <span>Matched</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    activeResultTab === 'matched' ? 'bg-white text-emerald-700' : 'bg-slate-300 text-slate-800'
                  }`}>
                    {matchedList.length}
                  </span>
                </button>

                {extraList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveResultTab('extra')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeResultTab === 'extra'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span>Extra ({extraList.length})</span>
                  </button>
                )}
              </div>

              {/* Action Buttons: Copy All Missing, Download Excel, Download CSV */}
              <div className="flex items-center gap-2 flex-wrap">
                {missingList.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyMissing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
                      title="Copy all missing reference numbers to clipboard"
                    >
                      {copySuccess ? (
                        <>
                          <Check size={13} strokeWidth={3} className="text-emerald-400" />
                          <span>Copied {missingList.length} numbers!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy Missing</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadExcel}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
                      title="Download missing reference numbers as Excel (.xlsx)"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Download Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                      title="Download CSV"
                    >
                      <Download size={13} />
                      <span>CSV</span>
                    </button>
                  </>
                )}
              </div>

            </div>

            {/* Search Filter Bar */}
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeResultTab} reference numbers...`}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="text-xs text-slate-400 tabular-nums">
                Showing {displayedList.length} of{' '}
                {activeResultTab === 'missing' 
                  ? missingList.length 
                  : activeResultTab === 'matched' 
                  ? matchedList.length 
                  : extraList.length}
              </div>
            </div>

            {/* List / Table Display */}
            {displayedList.length > 0 ? (
              <div className="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-slate-100">
                {displayedList.map((item, idx) => {
                  const isCopied = copiedItemIndex === idx;
                  return (
                    <div 
                      key={idx}
                      className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-[11px] text-slate-400 w-8 tabular-nums flex-shrink-0">
                          #{idx + 1}
                        </span>

                        <span className={`font-mono font-bold tracking-wide truncate ${
                          activeResultTab === 'missing' 
                            ? 'text-rose-700' 
                            : activeResultTab === 'matched' 
                            ? 'text-emerald-700' 
                            : 'text-amber-700'
                        }`}>
                          {item.ref}
                        </span>

                        {item.raw && (
                          <span className="text-slate-500 truncate max-w-md hidden md:inline">
                            {item.raw}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          activeResultTab === 'missing'
                            ? 'bg-rose-100 text-rose-800'
                            : activeResultTab === 'matched'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {activeResultTab === 'missing' 
                            ? 'MISSING' 
                            : activeResultTab === 'matched' 
                            ? 'FOUND' 
                            : 'EXTRA'}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleCopySingle(item.ref, idx)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                          title="Copy this reference number"
                        >
                          {isCopied ? (
                            <Check size={13} strokeWidth={3} className="text-emerald-600" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-10 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 size={20} className={activeResultTab === 'missing' ? 'text-emerald-600' : 'text-slate-400'} />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  {activeResultTab === 'missing' 
                    ? 'No Missing Reference Numbers!' 
                    : 'No items match your filter'}
                </h4>
                <p className="text-xs text-slate-400">
                  {activeResultTab === 'missing'
                    ? 'All reference numbers from the total file were found in your existing dataset.'
                    : 'Try clearing your search query above.'}
                </p>
              </div>
            )}

          </div>

        </div>
      ) : (
        /* EMPTY / INSTRUCTION STATE */
        <div className="p-10 text-center rounded-3xl bg-white border border-dashed border-slate-300 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 mx-auto flex items-center justify-center">
            <GitCompare size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Paste Reference Numbers Above To Begin
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
              Paste the total file reference numbers in Box 1, and your existing reference numbers in Box 2. The system will automatically compare them and display all reference numbers that are missing.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
