import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  Download, 
  FileText, 
  Loader2, 
  X, 
  Layers, 
  Trash2, 
  StopCircle, 
  Search, 
  AlertCircle,
  ShieldCheck,
  Globe,
  SlidersHorizontal,
  Table,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ArrowUpDown,
  Pencil,
  Plus,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Columns
} from 'lucide-react';
import { consolidateFiles, ConsolidationResult, ConsolidatorProgressUpdate } from '../utils/consolidatorProcessor.ts';
import { 
  consolidateGtsFiles, 
  GtsConsolidationResult, 
  GtsProgressUpdate, 
  GTS_HEADERS 
} from '../utils/gtsConsolidatorProcessor.ts';

type ConsolidatorMode = 'standard' | 'gts';

export const Consolidator: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  // Standard merge comes first as default mode
  const [mode, setMode] = useState<ConsolidatorMode>('standard');
  const [processing, setProcessing] = useState(false);
  const [activeProcessingType, setActiveProcessingType] = useState<ConsolidatorMode>('standard');
  const [progress, setProgress] = useState<ConsolidatorProgressUpdate | GtsProgressUpdate | null>(null);
  const [processedResult, setProcessedResult] = useState<ConsolidationResult | null>(null);
  const [gtsResult, setGtsResult] = useState<GtsConsolidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Target Column Configuration (defaults to 15 GTS headers, persisted locally)
  const [columnNames, setColumnNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zyme_gts_custom_headers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(s => String(s).trim()).filter(Boolean);
        }
      }
    } catch (e) {
      console.error('Error loading custom headers:', e);
    }
    return [...GTS_HEADERS];
  });

  // Column Editing Modal State
  const [isEditColumnsModalOpen, setIsEditColumnsModalOpen] = useState(false);
  const [tempColumns, setTempColumns] = useState<string[]>([...columnNames]);
  const [newColumnInput, setNewColumnInput] = useState('');

  // GTS Configuration options
  const [includeFileName, setIncludeFileName] = useState(true);
  const [gtsSortBy, setGtsSortBy] = useState<string>('none');
  const [showFileAudit, setShowFileAudit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      setProcessedResult(null);
      setGtsResult(null);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setProcessedResult(null);
    setGtsResult(null);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
  };

  // Column Editor Handlers
  const handleOpenEditColumnsModal = () => {
    setTempColumns([...columnNames]);
    setNewColumnInput('');
    setIsEditColumnsModalOpen(true);
  };

  const handleUpdateTempColumn = (index: number, val: string) => {
    setTempColumns(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleMoveColumnUp = (index: number) => {
    if (index <= 0) return;
    setTempColumns(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index - 1];
      copy[index - 1] = temp;
      return copy;
    });
  };

  const handleMoveColumnDown = (index: number) => {
    if (index >= tempColumns.length - 1) return;
    setTempColumns(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index + 1];
      copy[index + 1] = temp;
      return copy;
    });
  };

  const handleRemoveTempColumn = (index: number) => {
    setTempColumns(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTempColumn = () => {
    const trimmed = newColumnInput.trim();
    if (!trimmed) return;
    setTempColumns(prev => [...prev, trimmed]);
    setNewColumnInput('');
  };

  const handleResetToGtsDefaults = () => {
    setTempColumns([...GTS_HEADERS]);
  };

  const handleSaveColumns = () => {
    const cleaned = tempColumns.map(c => c.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setError("At least one column header is required.");
      return;
    }
    setColumnNames(cleaned);
    try {
      localStorage.setItem('zyme_gts_custom_headers', JSON.stringify(cleaned));
    } catch (e) {
      console.error('Error persisting custom headers:', e);
    }
    setIsEditColumnsModalOpen(false);
  };

  const handleRestoreDefaultColumnsDirectly = () => {
    setColumnNames([...GTS_HEADERS]);
    try {
      localStorage.removeItem('zyme_gts_custom_headers');
    } catch (e) {
      console.error(e);
    }
  };

  // Standard Consolidation Handler
  const handleStandardConsolidate = async () => {
    if (files.length === 0) {
      fileInputRef.current?.click();
      return;
    }

    setProcessing(true);
    setActiveProcessingType('standard');
    setMode('standard');
    setError(null);
    setProcessedResult(null);
    setGtsResult(null);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      fileName: 'Preparing standard consolidation...',
      totalRows: 0,
      percent: 0,
      stage: 'reading'
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await consolidateFiles(files, {
        onProgress: (p) => setProgress(p),
        signal: controller.signal
      });
      setProcessedResult(result);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setError("Consolidation cancelled.");
      } else {
        console.error(err);
        setError(err.message || "An error occurred while consolidating files.");
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // GTS Consolidation Handler
  const handleGtsConsolidate = async () => {
    if (files.length === 0) {
      fileInputRef.current?.click();
      return;
    }

    setProcessing(true);
    setActiveProcessingType('gts');
    setMode('gts');
    setError(null);
    setProcessedResult(null);
    setGtsResult(null);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      fileName: 'Scanning and mapping target columns...',
      totalRows: 0,
      percent: 0,
      stage: 'reading'
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await consolidateGtsFiles(files, {
        includeFileName,
        sortBy: gtsSortBy,
        targetHeaders: columnNames,
        onProgress: (p) => setProgress(p),
        signal: controller.signal
      });
      setGtsResult(result);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setError("GTS Consolidation cancelled.");
      } else {
        console.error(err);
        setError(err.message || "An error occurred while consolidating GTS files.");
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleDownloadStandard = () => {
    if (!processedResult) return;
    const blob = new Blob([processedResult.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Consolidated_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadGtsExcel = () => {
    if (!gtsResult) return;
    if (gtsResult.isCsvOnly || gtsResult.data.length === 0) {
      handleDownloadGtsCsv();
      return;
    }
    const blob = new Blob([gtsResult.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GTS_Consolidated_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadGtsCsv = () => {
    if (!gtsResult) return;
    const url = window.URL.createObjectURL(gtsResult.csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GTS_Consolidated_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFiles([]);
    setProcessedResult(null);
    setGtsResult(null);
    setError(null);
    setProgress(null);
    setSearchFilter('');
  };

  const totalSizeMB = (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1);

  const filteredFiles = searchFilter.trim() === '' 
    ? files 
    : files.filter(f => f.name.toLowerCase().includes(searchFilter.toLowerCase()));

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-8 overflow-y-auto">
      <div className="w-full max-w-4xl transform transition-all duration-500 my-auto">
        
        {/* MAIN CARD */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden ring-1 ring-white/60">
          
          {!processedResult && !gtsResult ? (
            // Upload / Configuration State
            <div className="p-6 md:p-10 relative">
              
              {/* Header with Quick Action Badges */}
              <div className="mb-6 text-center relative">
                
                {/* Quick-Access Action Badges at Top Right: Standard Merge First, GTS Next */}
                <div className="absolute top-0 right-0 hidden sm:flex items-center gap-2">
                  <button
                    id="standard-header-icon-btn"
                    onClick={handleStandardConsolidate}
                    title="Standard Merge: Consolidate all sheets with automatic deduplication"
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 border border-indigo-500/30 transition-all duration-200 shadow-xs hover:scale-105 active:scale-95"
                  >
                    <Layers size={14} className="text-indigo-600" />
                    <span className="text-xs font-bold tracking-tight">Standard Merge</span>
                  </button>

                  <button
                    id="gts-header-icon-btn"
                    onClick={handleGtsConsolidate}
                    title="GTS Consolidate: Map columns to target sequence"
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 border border-amber-500/30 transition-all duration-200 shadow-xs hover:scale-105 active:scale-95"
                  >
                    <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500 text-white font-black text-[9px] tracking-tight shadow-xs">
                      GTS
                    </div>
                    <span className="text-xs font-bold tracking-tight">GTS Sort</span>
                  </button>
                </div>

                <div className="relative inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-tr from-indigo-50 to-white mb-4 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <Layers className="w-8 h-8 md:w-9 md:h-9 text-indigo-600 relative z-10" />
                </div>
                
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight mb-1">
                  Zyme Consolidator
                </h3>
                <p className="text-slate-500 text-xs md:text-sm max-w-lg mx-auto leading-relaxed">
                  Consolidate multi-source spreadsheets with standard 2-sheet merging or strict GTS header sorting.
                </p>

                {/* Mode Selector / Tabs: Standard Merge First, GTS & Sorting Next */}
                <div className="mt-5 inline-flex items-center p-1 bg-slate-100/80 rounded-2xl border border-slate-200/80 shadow-inner">
                  <button
                    id="mode-tab-standard"
                    onClick={() => setMode('standard')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                      mode === 'standard'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Layers size={14} className="text-indigo-600" />
                    <span>Standard Merge</span>
                  </button>

                  <button
                    id="mode-tab-gts"
                    onClick={() => setMode('gts')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                      mode === 'gts'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500 text-white font-black text-[9px]">
                      GTS
                    </div>
                    <span>GTS & Column Sorting</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-100 text-amber-800 font-semibold">
                      {columnNames.length} Cols
                    </span>
                  </button>
                </div>
              </div>

              {/* Standard Merge Banner */}
              {mode === 'standard' && (
                <div className="mb-6 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                        <Layers size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                          Standard Multi-File Consolidation
                        </h4>
                        <p className="text-[11px] text-indigo-900/80 leading-tight">
                          Automatically merges uploaded files into unified Sheet 1 & Sheet 2 with smart column deduplication and sanitization.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setMode('gts')}
                      className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline underline-offset-2 flex-shrink-0"
                    >
                      Need column sorting? Switch to GTS
                    </button>
                  </div>
                </div>
              )}

              {/* GTS Specific Banner & Column Specs */}
              {mode === 'gts' && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500 text-white font-black text-xs shadow-xs">
                        GTS
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                            GTS & Column Sorting
                          </h4>
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200/80 text-amber-900 font-bold">
                            {columnNames.length} Columns
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800/90 leading-tight">
                          Reads all files and sorts data into your configured columns. Missing columns in files are left blank.
                        </p>
                      </div>
                    </div>

                    {/* Column Configuration Action Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                      <button
                        id="edit-column-names-btn"
                        onClick={handleOpenEditColumnsModal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold shadow-xs transition-all hover:scale-105 active:scale-95"
                      >
                        <Pencil size={12} className="text-amber-700" />
                        <span>Edit Column Names</span>
                      </button>

                      {JSON.stringify(columnNames) !== JSON.stringify(GTS_HEADERS) && (
                        <button
                          onClick={handleRestoreDefaultColumnsDirectly}
                          title="Restore default 15 GTS headers"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200 text-amber-800 text-xs font-semibold transition-colors"
                        >
                          <RotateCcw size={11} />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Header Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-28 overflow-y-auto pr-1">
                    {columnNames.map((h, i) => (
                      <span
                        key={`${h}-${i}`}
                        onClick={handleOpenEditColumnsModal}
                        title="Click to edit column names"
                        className="cursor-pointer group inline-flex items-center gap-1 px-2 py-0.5 bg-white/90 hover:bg-amber-100 rounded-md border border-amber-200/80 hover:border-amber-400 text-[10px] font-mono text-slate-700 transition-colors shadow-2xs"
                      >
                        <span className="text-amber-600 font-bold">{i + 1}.</span>
                        <span>{h}</span>
                        <Pencil size={8} className="opacity-0 group-hover:opacity-100 text-amber-600 ml-0.5" />
                      </span>
                    ))}
                  </div>

                  {/* Options Strip */}
                  <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeFileName}
                        onChange={(e) => setIncludeFileName(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-400 border-amber-300"
                      />
                      <span className="text-slate-700 font-medium">Include "File Name" in Column A</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <ArrowUpDown size={12} className="text-amber-700" />
                      <span className="text-slate-600 font-medium">Sort records by:</span>
                      <select
                        value={gtsSortBy}
                        onChange={(e) => setGtsSortBy(e.target.value)}
                        className="bg-white border border-amber-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[160px] truncate"
                      >
                        <option value="none">Original File Order</option>
                        {columnNames.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Upload Zone */}
                <div className="space-y-4">
                  <label 
                    className={`
                      group relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed
                      transition-all duration-300 cursor-pointer overflow-hidden bg-slate-50/50
                      border-slate-300 hover:border-indigo-400 hover:bg-white/80
                      ${processing ? 'pointer-events-none opacity-60' : ''}
                    `}
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      className="hidden" 
                      multiple
                      accept=".xlsx, .xls, .xlsm, .xlsb, .csv, .ods" 
                      onChange={handleFileChange} 
                    />
                    
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <div className="p-4 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow">
                        <Upload size={24} className="opacity-50 group-hover:opacity-100" />
                      </div>
                      <div className="text-center px-4">
                        <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600">Select Files (Up to 200+)</span>
                        <p className="text-xs font-medium opacity-70 mt-1">
                          Supports .xlsx, .xls (Excel 97-2003), .csv, .xlsm
                        </p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* File Queue List */}
                <div className="flex flex-col h-64 bg-slate-900/5 rounded-2xl border border-slate-200/60 overflow-hidden">
                  <div className="p-3 border-b border-slate-200/60 bg-white/40 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Queue ({files.length})</span>
                      {files.length > 0 && (
                        <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                          {totalSizeMB} MB
                        </span>
                      )}
                    </div>
                    {files.length > 0 && !processing && (
                      <button 
                        onClick={() => setFiles([])} 
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {files.length > 6 && (
                    <div className="p-2 border-b border-slate-200/60 bg-white/60">
                      <div className="relative flex items-center">
                        <Search size={12} className="absolute left-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter queue..."
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                    {files.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                        <FileText size={32} strokeWidth={1.5} />
                        <p className="text-[10px] font-bold uppercase mt-2">No files selected</p>
                      </div>
                    ) : filteredFiles.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                        No files matching "{searchFilter}"
                      </div>
                    ) : (
                      filteredFiles.map((f, idx) => (
                        <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 shadow-sm animate-in slide-in-from-right-2 duration-200">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-1.5 bg-indigo-50 rounded-lg flex-shrink-0">
                              <FileSpreadsheet size={14} className="text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-700 truncate">{f.name}</p>
                              <p className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          {!processing && (
                            <button 
                              onClick={() => removeFile(files.indexOf(f))}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Progress UI */}
              {processing && progress && (
                <div className="mt-6 p-5 bg-indigo-50/70 border border-indigo-100 rounded-2xl backdrop-blur-sm shadow-sm space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-indigo-950">
                      <Loader2 size={14} className="animate-spin text-indigo-600" />
                      <span>
                        {activeProcessingType === 'gts' ? 'GTS Consolidating' : 'Processing'} file {progress.currentFile} of {progress.totalFiles}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-indigo-700 text-sm">{progress.percent}%</span>
                  </div>

                  <div className="w-full h-2.5 bg-indigo-200/60 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        activeProcessingType === 'gts'
                          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600'
                          : 'bg-gradient-to-r from-indigo-600 to-violet-600'
                      }`}
                      style={{ width: `${Math.max(3, progress.percent)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="truncate max-w-[280px] font-mono text-slate-700" title={progress.fileName}>
                      📄 {progress.fileName}
                    </span>
                    <span className="font-semibold text-indigo-900">
                      {progress.totalRows.toLocaleString()} records mapped
                    </span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      <StopCircle size={14} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error Toast */}
              {error && (
                <div className="mt-6 p-4 bg-red-50/80 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in slide-in-from-top-2 backdrop-blur-sm shadow-sm">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Operation Failed</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* ACTION BUTTONS: Standard Merge First, GTS & Sorting Next */}
              <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
                
                {/* 1. PRIMARY STANDARD MERGE ACTION BUTTON (FIRST) */}
                <button 
                  id="standard-consolidate-action-btn"
                  onClick={handleStandardConsolidate}
                  disabled={processing}
                  className={`
                    flex-1 w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold shadow-xl transition-all duration-300 relative overflow-hidden group
                    ${files.length === 0
                      ? 'bg-indigo-600/80 hover:bg-indigo-600 text-white shadow-indigo-500/10'
                      : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white hover:scale-[1.02] shadow-indigo-500/25 active:scale-[0.99]'
                    }
                  `}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/20 text-white font-bold text-xs shadow-inner">
                    <Layers size={16} />
                  </div>
                  
                  {processing && activeProcessingType === 'standard' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                      <span>Standard Merging {files.length} Files...</span>
                    </>
                  ) : (
                    <div className="flex flex-col items-start text-left leading-tight">
                      <span className="text-sm font-extrabold text-white">
                        {files.length > 0 ? `Standard Merge (${files.length} Files)` : 'Standard Merge'}
                      </span>
                      <span className="text-[10px] font-medium text-indigo-100 opacity-90">
                        Consolidate all sheets with smart deduplication
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                </button>

                {/* 2. GTS & COLUMN SORTING ACTION BUTTON (NEXT) */}
                <button 
                  id="gts-consolidate-action-btn"
                  onClick={handleGtsConsolidate}
                  disabled={processing}
                  className={`
                    sm:w-auto w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold shadow-md transition-all duration-300 relative overflow-hidden group border
                    ${files.length === 0
                      ? 'bg-amber-500/90 hover:bg-amber-500 text-slate-950 border-amber-400/80 shadow-amber-500/10'
                      : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 border-amber-400 hover:scale-[1.02] shadow-amber-500/20 active:scale-[0.99]'
                    }
                  `}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-950 text-amber-400 font-black text-xs shadow-inner">
                    GTS
                  </div>
                  
                  {processing && activeProcessingType === 'gts' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
                      <span>Sorting {columnNames.length} Cols...</span>
                    </>
                  ) : (
                    <div className="flex flex-col items-start text-left leading-tight">
                      <span className="text-xs font-extrabold text-slate-950">
                        GTS Consolidate & Sort
                      </span>
                      <span className="text-[10px] font-semibold text-slate-800 opacity-90">
                        {columnNames.length} target columns
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-white/25 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                </button>
              </div>

            </div>
          ) : gtsResult ? (
            
            // GTS CONSOLIDATION SUCCESS STATE
            <div className="p-8 md:p-10 text-center animate-in fade-in slide-in-from-bottom-8 duration-500 bg-gradient-to-b from-amber-50/30 to-transparent">
              
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-b from-amber-100 to-white mb-4 shadow-xl shadow-amber-500/10 ring-1 ring-amber-200">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 text-white font-black text-xl shadow-sm">
                  GTS
                </div>
              </div>

              <h3 className="text-2xl font-bold text-slate-800 mb-1">
                GTS Consolidation Complete
              </h3>
              
              <p className="text-slate-500 text-xs md:text-sm mb-6 max-w-md mx-auto leading-relaxed">
                Extracted and sorted columns across <span className="font-bold text-amber-700">{gtsResult.fileCount} files</span> into <span className="font-bold text-amber-700">{columnNames.length} configured headers</span>, generating <span className="font-bold text-amber-700">{gtsResult.rowCount.toLocaleString()} consolidated records</span>.
              </p>

              {/* Warnings / Notices */}
              {gtsResult.warnings && gtsResult.warnings.length > 0 && (
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-800">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <AlertCircle size={14} className="text-amber-600" />
                    <span>Notices ({gtsResult.warnings.length}):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 opacity-90">
                    {gtsResult.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-6">
                <div className="p-3 bg-white/90 rounded-xl border border-slate-100 shadow-xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Records</p>
                  <p className="text-base font-bold text-slate-800">{gtsResult.rowCount.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-white/90 rounded-xl border border-slate-100 shadow-xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Files Merged</p>
                  <p className="text-base font-bold text-slate-800">{gtsResult.fileCount}</p>
                </div>
                <div className="p-3 bg-white/90 rounded-xl border border-slate-100 shadow-xs col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target Columns</p>
                  <p className="text-base font-bold text-amber-600">{columnNames.length} Columns</p>
                </div>
              </div>

              {/* Data Preview Table */}
              {gtsResult.previewRows.length > 0 && (
                <div className="mb-6 text-left border border-slate-200/80 rounded-2xl overflow-hidden bg-white/90 shadow-sm">
                  <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Table size={14} className="text-amber-600" />
                      <span className="text-xs font-bold text-slate-700">Preview Consolidated Data (First 15 Rows)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {gtsResult.previewRows.length - 1} shown
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-56 scrollbar-thin scrollbar-thumb-slate-300">
                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                      <thead className="bg-slate-100/80 sticky top-0 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          {gtsResult.previewRows[0].map((h: string, idx: number) => (
                            <th key={idx} className="px-3 py-2 border-r border-slate-200/60 last:border-r-0">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[10px] text-slate-600">
                        {gtsResult.previewRows.slice(1).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-amber-50/40">
                            {row.map((cell: any, cIdx: number) => (
                              <td key={cIdx} className="px-3 py-1.5 border-r border-slate-100 last:border-r-0">
                                {cell !== "" ? String(cell) : <span className="text-slate-300 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-File Header Coverage Audit Toggle */}
              {gtsResult.fileAudits && gtsResult.fileAudits.length > 0 && (
                <div className="mb-6 text-left">
                  <button
                    onClick={() => setShowFileAudit(!showFileAudit)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    {showFileAudit ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>File Coverage Details ({gtsResult.fileAudits.length} files)</span>
                  </button>

                  {showFileAudit && (
                    <div className="mt-2 p-3 bg-white/90 rounded-xl border border-slate-200 text-xs space-y-2 max-h-48 overflow-y-auto">
                      {gtsResult.fileAudits.map((fa, idx) => (
                        <div key={idx} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span className="truncate max-w-[280px]">{fa.fileName}</span>
                            <span className="text-amber-700">{fa.rowCount} rows</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            <span className="text-emerald-600 font-semibold">Matched:</span> {fa.matchedHeaders.length}/{columnNames.length} headers
                            {fa.missingHeaders.length > 0 && (
                              <span className="ml-2 text-slate-400">
                                (Missing: {fa.missingHeaders.join(', ')})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Download Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                <button 
                  onClick={handleDownloadGtsExcel}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Download size={16} />
                  <span>Download GTS (.xlsx)</span>
                </button>

                <button 
                  onClick={handleDownloadGtsCsv}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs transition-colors"
                  title="Universal CSV format with all records"
                >
                  <Download size={14} />
                  <span>CSV</span>
                </button>

                <button 
                  onClick={handleReset}
                  className="w-full sm:w-auto px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors"
                >
                  New
                </button>
              </div>

            </div>

          ) : (
            
            // STANDARD CONSOLIDATION SUCCESS STATE
            <div className="p-10 text-center animate-in fade-in slide-in-from-bottom-8 duration-500 bg-gradient-to-b from-emerald-50/30 to-transparent">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-b from-emerald-100 to-white mb-5 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-100">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 drop-shadow-sm" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-1">Consolidation Successful</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                Successfully merged <span className="font-bold text-indigo-600">{processedResult.fileCount} files</span> with <span className="font-bold text-indigo-600">{processedResult.rowCount.toLocaleString()} total records</span> into Sheet 1 & Sheet 2.
              </p>

              {/* Warnings if any */}
              {processedResult.warnings && processedResult.warnings.length > 0 && (
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-800">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <AlertCircle size={14} className="text-amber-600" />
                    <span>File Notices ({processedResult.warnings.length}):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 opacity-90">
                    {processedResult.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-white/80 rounded-2xl p-4 border border-slate-100 mb-6 shadow-sm flex items-center justify-between backdrop-blur-sm max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Output File</p>
                    <p className="text-xs font-bold text-slate-800 truncate max-w-[180px]">Consolidated_Report.xlsx</p>
                  </div>
                </div>
                <div className="text-right pl-4 border-l border-slate-100">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Size</p>
                   <p className="text-xs font-bold text-slate-800">
                     ~{(processedResult.data.length / (1024 * 1024) > 1 ? `${(processedResult.data.length / (1024 * 1024)).toFixed(1)} MB` : `${(processedResult.data.length / 1024).toFixed(0)} KB`)}
                   </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 max-w-sm mx-auto">
                <button 
                  onClick={handleDownloadStandard}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-md transition-all hover:scale-[1.02]"
                >
                  <Download size={16} />
                  <span>Download Master Report</span>
                </button>
                <button 
                  onClick={handleReset}
                  className="px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
                >
                  Start New
                </button>
              </div>
            </div>
          )}
        </div>
        
        <p className="text-center mt-6 text-slate-400/60 text-[10px] font-medium tracking-wide uppercase">
          Multi-File Merging Engine • Standard Consolidation & Dynamic GTS Column Sorting
        </p>

      </div>

      {/* EDIT TARGET COLUMN NAMES MODAL */}
      {isEditColumnsModalOpen && (
        <div 
          id="edit-columns-modal" 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditColumnsModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-5 md:p-6 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-xs">
                  <Columns size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Edit Column Names & Sequence
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Customize headers, rename columns, add new fields, or reorder column sequence according to requirements. Missing headers in files will be left blank.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditColumnsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Add New Column Toolbar & Quick Presets */}
            <div className="p-4 bg-amber-50/50 border-b border-amber-100/80 flex flex-wrap items-center justify-between gap-3">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddTempColumn();
                }}
                className="flex items-center gap-2 flex-1 min-w-[260px]"
              >
                <input
                  type="text"
                  value={newColumnInput}
                  onChange={(e) => setNewColumnInput(e.target.value)}
                  placeholder="Type new column name and click Add..."
                  className="flex-1 px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="submit"
                  disabled={!newColumnInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs shadow-xs transition-colors flex-shrink-0"
                >
                  <Plus size={14} />
                  <span>Add Column</span>
                </button>
              </form>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetToGtsDefaults}
                  title="Reset columns back to standard 15 GTS headers"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-white hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors shadow-2xs"
                >
                  <RotateCcw size={12} />
                  <span>Reset 15 GTS Defaults</span>
                </button>

                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 font-bold text-xs rounded-xl">
                  {tempColumns.length} Columns
                </span>
              </div>
            </div>

            {/* Columns List */}
            <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-2.5 max-h-[50vh] scrollbar-thin scrollbar-thumb-slate-300">
              {tempColumns.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No columns defined. Click "Reset 15 GTS Defaults" or add custom columns above.
                </div>
              ) : (
                tempColumns.map((col, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-white rounded-xl border border-slate-200/80 shadow-2xs transition-colors group"
                  >
                    {/* Sequence Badge */}
                    <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center font-mono font-bold text-xs bg-slate-200 text-slate-700 rounded-lg">
                      #{idx + 1}
                    </span>

                    {/* Editable Input */}
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => handleUpdateTempColumn(idx, e.target.value)}
                      placeholder={`Column #${idx + 1} name`}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                    />

                    {/* Order buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveColumnUp(idx)}
                        disabled={idx === 0}
                        title="Move column earlier in output"
                        className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-200 rounded-md transition-colors"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveColumnDown(idx)}
                        disabled={idx === tempColumns.length - 1}
                        title="Move column later in output"
                        className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-200 rounded-md transition-colors"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTempColumn(idx)}
                        disabled={tempColumns.length <= 1}
                        title="Delete column"
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:pointer-events-none hover:bg-red-50 rounded-md transition-colors ml-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 md:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Changes will apply to subsequent GTS consolidations and exports.
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditColumnsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveColumns}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-xs transition-colors hover:scale-105 active:scale-95"
                >
                  <Check size={14} />
                  <span>Save & Apply Changes</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
