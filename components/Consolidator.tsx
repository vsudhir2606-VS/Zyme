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
  AlertTriangle,
  Table,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Sparkles,
  RefreshCw,
  ShieldAlert,
  Info
} from 'lucide-react';
import { 
  consolidateFiles, 
  ConsolidationResult, 
  ConsolidatorProgressUpdate,
  ConsolidationError,
  FailedFileDetail
} from '../utils/consolidatorProcessor.ts';

export const Consolidator: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ConsolidatorProgressUpdate | null>(null);
  const [processedResult, setProcessedResult] = useState<ConsolidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [failedFilesList, setFailedFilesList] = useState<FailedFileDetail[]>([]);
  
  const [searchFilter, setSearchFilter] = useState('');
  const [previewSearch, setPreviewSearch] = useState('');
  const [showFileBreakdown, setShowFileBreakdown] = useState(true);

  // Consolidation Options
  // "just take 1 file header & remaining just consolidate"
  const [takeFirstFileHeaderOnly, setTakeFirstFileHeaderOnly] = useState(true);
  const [includeFileName, setIncludeFileName] = useState(false);
  const [smartColumnAlignment, setSmartColumnAlignment] = useState(true);
  const [removeDuplicateHeaders, setRemoveDuplicateHeaders] = useState(true);
  const [strictAllFilesRequired, setStrictAllFilesRequired] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      setProcessedResult(null);
      setError(null);
      setErrorModalOpen(false);
      setFailedFilesList([]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setProcessedResult(null);
  };

  const moveFileUp = (index: number) => {
    if (index === 0) return;
    setFiles(prev => {
      const updated = [...prev];
      const temp = updated[index - 1];
      updated[index - 1] = updated[index];
      updated[index] = temp;
      return updated;
    });
  };

  const moveFileDown = (index: number) => {
    if (index === files.length - 1) return;
    setFiles(prev => {
      const updated = [...prev];
      const temp = updated[index + 1];
      updated[index + 1] = updated[index];
      updated[index] = temp;
      return updated;
    });
  };

  const makePrimaryHeader = (index: number) => {
    if (index === 0) return;
    setFiles(prev => {
      const target = prev[index];
      const remaining = prev.filter((_, i) => i !== index);
      return [target, ...remaining];
    });
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
  };

  const handleConsolidate = async () => {
    if (files.length === 0) {
      fileInputRef.current?.click();
      return;
    }

    setProcessing(true);
    setError(null);
    setErrorModalOpen(false);
    setFailedFilesList([]);
    setProcessedResult(null);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      fileName: 'Validating & reading files...',
      totalRows: 0,
      percent: 0,
      stage: 'reading'
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await consolidateFiles(files, {
        includeFileName,
        takeFirstFileHeaderOnly,
        smartColumnAlignment,
        removeDuplicateHeaders,
        strictAllFilesRequired,
        onProgress: (p) => setProgress(p),
        signal: controller.signal
      });
      setProcessedResult(result);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setError("Consolidation cancelled.");
      } else if (err instanceof ConsolidationError) {
        // Strict requirement: Popup error if any file could not be consolidated!
        setError(err.message);
        setFailedFilesList(err.failedFiles);
        setErrorModalOpen(true);
      } else {
        console.error(err);
        setError(err.message || "An error occurred while consolidating files.");
        setFailedFilesList([{
          fileName: "General Consolidation",
          fileSize: 0,
          reason: err.message || "Spreadsheet parsing error."
        }]);
        setErrorModalOpen(true);
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleRemoveFailedFilesAndRetry = () => {
    const failedNames = new Set(failedFilesList.map(f => f.fileName));
    const validFiles = files.filter(f => !failedNames.has(f.name));
    setFiles(validFiles);
    setErrorModalOpen(false);
    setError(null);
    setFailedFilesList([]);
  };

  const handleDownloadExcel = () => {
    if (!processedResult) return;
    const blob = new Blob([processedResult.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `Zyme_Consolidated_${processedResult.fileCount}_Files_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadCsv = () => {
    if (!processedResult || !processedResult.csvBlob) return;
    const url = window.URL.createObjectURL(processedResult.csvBlob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `Zyme_Consolidated_${processedResult.fileCount}_Files_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFiles([]);
    setProcessedResult(null);
    setError(null);
    setErrorModalOpen(false);
    setFailedFilesList([]);
    setProgress(null);
    setSearchFilter('');
    setPreviewSearch('');
  };

  const totalSizeMB = (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1);

  const filteredFiles = searchFilter.trim() === '' 
    ? files 
    : files.filter(f => f.name.toLowerCase().includes(searchFilter.toLowerCase()));

  // Filtered preview rows
  const filteredPreviewRows = processedResult ? (() => {
    const rows = processedResult.previewRows;
    if (rows.length <= 1) return rows;
    if (!previewSearch.trim()) return rows;
    const q = previewSearch.toLowerCase();
    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => 
      r.some(cell => String(cell).toLowerCase().includes(q))
    );
    return [headers, ...dataRows];
  })() : [];

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-8 overflow-y-auto">
      <div className="w-full max-w-4xl transform transition-all duration-500 my-auto">
        
        {/* MAIN GLASS CARD */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)] border border-white/60 overflow-hidden ring-1 ring-slate-200/50">
          
          {!processedResult ? (
            // Upload & Consolidation Setup View
            <div className="p-6 md:p-10 relative">
              
              {/* Header */}
              <div className="mb-6 text-center relative">
                <div className="relative inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-tr from-indigo-50 to-white mb-4 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <Layers className="w-8 h-8 md:w-9 md:h-9 text-indigo-600 relative z-10" />
                </div>
                
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight mb-1">
                  Zyme Consolidator
                </h3>
                <p className="text-slate-500 text-xs md:text-sm max-w-lg mx-auto leading-relaxed">
                  Consolidates all files into one master dataset. Takes <strong>1 file header</strong> and consolidates all remaining files under it. If any file fails to consolidate, an alert error immediately pops up.
                </p>
              </div>

              {/* Upload Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Upload Zone */}
                <div className="space-y-4">
                  <label 
                    className={`
                      group relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed
                      transition-all duration-300 cursor-pointer overflow-hidden bg-slate-50/60
                      border-slate-300 hover:border-indigo-400 hover:bg-white/80
                      ${processing ? 'pointer-events-none opacity-60' : ''}
                    `}
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      className="hidden" 
                      multiple
                      accept=".xlsx, .xls, .xlsm, .xlsb, .csv, .ods, .tsv, .txt" 
                      onChange={handleFileChange} 
                    />
                    
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <div className="p-4 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow">
                        <Upload size={24} className="opacity-60 group-hover:opacity-100 text-indigo-600" />
                      </div>
                      <div className="text-center px-4">
                        <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600">
                          Select Files to Consolidate
                        </span>
                        <p className="text-xs font-medium text-slate-400 mt-1">
                          Supports .xlsx, .xls, .csv, .xlsm, .tsv (2 to 200+ files)
                        </p>
                        <p className="text-[11px] font-semibold text-indigo-600 mt-2 bg-indigo-50/80 px-2.5 py-1 rounded-full inline-block border border-indigo-100">
                          File 1 header will be taken for all data
                        </p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* File Queue List */}
                <div className="flex flex-col h-64 bg-slate-900/5 rounded-2xl border border-slate-200/60 overflow-hidden">
                  <div className="p-3 border-b border-slate-200/60 bg-white/50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Files Uploaded ({files.length})
                      </span>
                      {files.length > 0 && (
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                          {totalSizeMB} MB
                        </span>
                      )}
                    </div>
                    {files.length > 0 && !processing && (
                      <button 
                        onClick={() => setFiles([])} 
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {files.length > 5 && (
                    <div className="p-2 border-b border-slate-200/60 bg-white/70">
                      <div className="relative flex items-center">
                        <Search size={12} className="absolute left-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter file queue..."
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
                      filteredFiles.map((f, idx) => {
                        const originalIndex = files.indexOf(f);
                        const isPrimaryHeader = originalIndex === 0;

                        return (
                          <div 
                            key={`${f.name}-${originalIndex}`} 
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              isPrimaryHeader 
                                ? 'bg-indigo-50/60 border-indigo-200 shadow-xs' 
                                : 'bg-white border-slate-200/60 shadow-xs'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className={`p-1.5 rounded-lg flex-shrink-0 ${isPrimaryHeader ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'}`}>
                                <FileSpreadsheet size={14} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs font-bold text-slate-800 truncate max-w-[180px]">{f.name}</p>
                                  {isPrimaryHeader && (
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-2xs">
                                      Header Source
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  # {originalIndex + 1} • {(f.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>

                            {!processing && (
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                {!isPrimaryHeader && (
                                  <button
                                    onClick={() => makePrimaryHeader(originalIndex)}
                                    title="Set as File 1 (Header Source)"
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded text-[10px] font-bold transition-colors cursor-pointer"
                                  >
                                    Set Header
                                  </button>
                                )}
                                {originalIndex > 0 && (
                                  <button
                                    onClick={() => moveFileUp(originalIndex)}
                                    title="Move Up"
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                )}
                                {originalIndex < files.length - 1 && (
                                  <button
                                    onClick={() => moveFileDown(originalIndex)}
                                    title="Move Down"
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                  >
                                    <ArrowDown size={12} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => removeFile(originalIndex)}
                                  className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                                  title="Remove file"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Consolidation Options */}
              <div className="mt-6 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Consolidation Engine Rules
                  </span>
                  {files.length > 0 && (
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      Header source: <strong className="font-bold">{files[0].name}</strong>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex items-start gap-2.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={takeFirstFileHeaderOnly}
                      onChange={(e) => setTakeFirstFileHeaderOnly(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400 border-slate-300"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Take 1 File Header (File 1)</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">
                        Applies row 1 from the 1st file as the master header. Strips headers from remaining files and consolidates all rows.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={strictAllFilesRequired}
                      onChange={(e) => setStrictAllFilesRequired(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400 border-slate-300"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Strict Mode (Popup Error if Any Fails)</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">
                        Every single file must consolidate. If any file is empty, corrupted, or missing data, an error pops up immediately.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={smartColumnAlignment}
                      onChange={(e) => setSmartColumnAlignment(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400 border-slate-300"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Smart Column Alignment</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">
                        Aligns columns in subsequent files to the matching column in File 1's header.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={includeFileName}
                      onChange={(e) => setIncludeFileName(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400 border-slate-300"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Add "Source File" Column (Col A)</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">
                        Optional: Prepends source file name to each row (unchecked keeps 100% pure 1-file header).
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Progress Bar UI */}
              {processing && progress && (
                <div className="mt-6 p-5 bg-indigo-50/80 border border-indigo-100 rounded-2xl backdrop-blur-sm shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-indigo-950">
                      <Loader2 size={14} className="animate-spin text-indigo-600" />
                      <span>
                        Consolidating file {progress.currentFile} of {progress.totalFiles}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-indigo-700 text-sm">{progress.percent}%</span>
                  </div>

                  <div className="w-full h-2.5 bg-indigo-200/60 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-600 to-violet-600"
                      style={{ width: `${Math.max(4, progress.percent)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="truncate max-w-[280px] font-mono text-slate-700" title={progress.fileName}>
                      📄 {progress.fileName}
                    </span>
                    <span className="font-semibold text-indigo-900">
                      {progress.totalRows.toLocaleString()} rows consolidated
                    </span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      <StopCircle size={14} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              )}

              {/* On-Page Error Alert (Banner) */}
              {error && !errorModalOpen && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in slide-in-from-top-2 shadow-xs">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-bold">Consolidation Alert</p>
                    <p className="opacity-95 mt-0.5">{error}</p>
                    {failedFilesList.length > 0 && (
                      <button
                        onClick={() => setErrorModalOpen(true)}
                        className="mt-2 text-xs font-bold underline text-red-800 hover:text-red-950 cursor-pointer block"
                      >
                        View Error Details & Remove Failed Files ({failedFilesList.length})
                      </button>
                    )}
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors cursor-pointer">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Main Action Button */}
              <div className="mt-8 flex items-center justify-center">
                <button 
                  onClick={handleConsolidate}
                  disabled={processing}
                  className={`
                    w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold shadow-xl transition-all duration-300 relative overflow-hidden group cursor-pointer
                    ${files.length === 0
                      ? 'bg-indigo-600/80 hover:bg-indigo-600 text-white shadow-indigo-500/10'
                      : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white hover:scale-[1.01] shadow-indigo-500/25 active:scale-[0.99]'
                    }
                  `}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/20 text-white font-bold text-xs shadow-inner">
                    <Layers size={16} />
                  </div>
                  
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                      <span>Consolidating {files.length} Files...</span>
                    </>
                  ) : (
                    <div className="flex flex-col items-start text-left leading-tight">
                      <span className="text-sm font-extrabold text-white">
                        {files.length > 0 ? `Consolidate ${files.length} Files (1 Master Header)` : 'Select Files to Consolidate'}
                      </span>
                      <span className="text-[10px] font-medium text-indigo-100 opacity-90">
                        {files.length > 0 ? 'All files must consolidate successfully or error will popup' : 'Click to browse files'}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                </button>
              </div>

            </div>

          ) : (

            // SUCCESS / CONSOLIDATED RESULTS VIEW
            <div className="p-6 md:p-10 text-center animate-in fade-in slide-in-from-bottom-6 duration-500 bg-gradient-to-b from-indigo-50/20 to-transparent">
              
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-b from-emerald-100 to-white mb-4 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-200">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 drop-shadow-xs" />
              </div>

              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                All Files Consolidated Successfully
              </h3>
              
              <p className="text-slate-600 text-xs md:text-sm mb-4 max-w-lg mx-auto leading-relaxed">
                Consolidated <span className="font-bold text-indigo-600">{processedResult.fileCount} files</span> under 1 single header with <span className="font-bold text-indigo-600">{processedResult.rowCount.toLocaleString()} total data rows</span>.
              </p>

              {/* Master Header Source Indicator */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-semibold mb-6">
                <Sparkles size={14} className="text-indigo-600" />
                <span>Single Header Source: <strong>{processedResult.headerSourceFileName}</strong> ({processedResult.columnCount} columns)</span>
              </div>

              {/* Warnings / Notices */}
              {processedResult.warnings && processedResult.warnings.length > 0 && (
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-800">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <AlertCircle size={14} className="text-amber-600" />
                    <span>Consolidation Notices ({processedResult.warnings.length}):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 opacity-90">
                    {processedResult.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stats Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-6">
                <div className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Files Merged</p>
                  <p className="text-xl font-black text-slate-800 mt-0.5">{processedResult.fileCount}</p>
                </div>
                <div className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Data Rows</p>
                  <p className="text-xl font-black text-emerald-600 mt-0.5">{processedResult.rowCount.toLocaleString()}</p>
                </div>
                <div className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Master Columns</p>
                  <p className="text-xl font-black text-indigo-600 mt-0.5">{processedResult.columnCount}</p>
                </div>
              </div>

              {/* Interactive Data Preview Table */}
              {processedResult.previewRows.length > 0 && (
                <div className="mb-6 text-left border border-slate-200/80 rounded-2xl overflow-hidden bg-white/95 shadow-sm">
                  <div className="p-3 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Table size={15} className="text-indigo-600" />
                      <span className="text-xs font-bold text-slate-700">Consolidated Preview (Showing 1 Master Header & Rows)</span>
                    </div>

                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text"
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        placeholder="Search preview records..."
                        className="pl-7 pr-3 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-64 scrollbar-thin scrollbar-thumb-slate-300">
                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                      <thead className="bg-slate-100/95 sticky top-0 text-slate-800 font-bold border-b border-slate-200 z-10">
                        <tr>
                          {filteredPreviewRows[0]?.map((h: string, idx: number) => (
                            <th key={idx} className="px-3 py-2 border-r border-slate-200/60 last:border-r-0 bg-slate-100/95">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[10px] text-slate-600">
                        {filteredPreviewRows.slice(1).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-indigo-50/40">
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

              {/* Per-File Breakdown Collapsible */}
              {processedResult.fileContributions && processedResult.fileContributions.length > 0 && (
                <div className="mb-6 text-left">
                  <button
                    onClick={() => setShowFileBreakdown(!showFileBreakdown)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    {showFileBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>File Consolidation Breakdown ({processedResult.fileContributions.length} files)</span>
                  </button>

                  {showFileBreakdown && (
                    <div className="mt-2 p-3 bg-white/95 rounded-2xl border border-slate-200 text-xs space-y-2 max-h-48 overflow-y-auto">
                      {processedResult.fileContributions.map((fc, idx) => (
                        <div key={idx} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0 flex items-center justify-between">
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 truncate block max-w-sm">{fc.fileName}</span>
                              {fc.fileName === processedResult.headerSourceFileName && (
                                <span className="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded">
                                  Header Source
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">{(fc.fileSize / 1024).toFixed(1)} KB • {fc.columnCount} cols</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-bold text-indigo-700">{fc.rowCount.toLocaleString()} rows</span>
                            <span className="text-[10px] text-slate-400 block">
                              {processedResult.rowCount > 0 ? `${Math.round((fc.rowCount / processedResult.rowCount) * 100)}%` : '0%'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action / Download Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                <button 
                  onClick={handleDownloadExcel}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <Download size={16} />
                  <span>Download Excel (.xlsx)</span>
                </button>

                <button 
                  onClick={handleDownloadCsv}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer"
                  title="Download universal CSV"
                >
                  <Download size={14} />
                  <span>CSV</span>
                </button>

                <button 
                  onClick={handleReset}
                  className="w-full sm:w-auto px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
                >
                  Consolidate More
                </button>
              </div>

            </div>

          )}

        </div>

      </div>

      {/* 
        =========================================================
        POPUP ERROR MODAL: REQUIRED WHEN CONSOLIDATION CANNOT CONSOLIDATE ALL FILES
        =========================================================
      */}
      {errorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-red-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-red-600 to-rose-600 text-white relative">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Consolidation Error
                  </h3>
                  <p className="text-xs text-red-100 mt-0.5">
                    All files must consolidate successfully
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setErrorModalOpen(false)}
                className="absolute top-5 right-5 p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50/80 border border-red-200/80 rounded-2xl p-4 text-xs text-red-900 leading-relaxed">
                <p className="font-bold text-red-950 mb-1 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-red-600 flex-shrink-0" />
                  <span>Validation Requirement Failed:</span>
                </p>
                <p>
                  Zyme Consolidator halted because <strong>{failedFilesList.length}</strong> of your {files.length} uploaded files could not be consolidated. As required, all files must be valid and contain non-empty data rows to produce the consolidated report.
                </p>
              </div>

              {/* List of Failed Files */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Problematic File(s) Breakdown:
                </span>
                
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                  {failedFilesList.map((fail, i) => (
                    <div 
                      key={i} 
                      className="p-3 bg-slate-50 rounded-xl border border-red-100 flex items-start gap-2.5 text-xs"
                    >
                      <div className="p-1.5 bg-red-100 text-red-700 rounded-lg flex-shrink-0 mt-0.5">
                        <FileSpreadsheet size={13} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-800 truncate">{fail.fileName}</p>
                          {fail.fileSize > 0 && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(fail.fileSize / 1024).toFixed(1)} KB
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-red-600 font-medium mt-0.5">
                          {fail.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                {files.length > failedFilesList.length && (
                  <button
                    onClick={handleRemoveFailedFilesAndRetry}
                    className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    Remove Failed Files ({files.length - failedFilesList.length} Valid Remain)
                  </button>
                )}
                
                <button
                  onClick={() => setErrorModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Dismiss & Fix Files
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
