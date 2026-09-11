import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, Download, FileText, Loader2, X, FolderArchive, Trash2, Eye, StopCircle, Search, AlertCircle } from 'lucide-react';
import { consolidateOofFiles, OofConsolidationResult, ProgressUpdate } from '../utils/oofConsolidatorProcessor.ts';

export const OofConsolidator: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [processedResult, setProcessedResult] = useState<OofConsolidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [removeBlankColumnB, setRemoveBlankColumnB] = useState(true);
  const [removeDuplicateHeaders, setRemoveDuplicateHeaders] = useState(true);
  const [includeMasterHeader, setIncludeMasterHeader] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      setProcessedResult(null);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setProcessedResult(null);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
  };

  const handleConsolidate = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setProcessedResult(null);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      fileName: 'Initializing consolidation engine...',
      totalRows: 0,
      percent: 0,
      stage: 'reading'
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await consolidateOofFiles(files, {
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
        removeBlankColumnB,
        removeDuplicateHeaders,
        includeMasterHeader
      });
      setProcessedResult(result);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setError("Consolidation cancelled.");
      } else {
        console.error(err);
        setError(err.message || "An error occurred while consolidating Off files.");
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleDownload = () => {
    if (!processedResult) return;
    const blob = new Blob([processedResult.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Off_Consolidated_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFiles([]);
    setProcessedResult(null);
    setError(null);
    setProgress(null);
    setSearchFilter('');
  };

  const totalSizeMB = (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1);

  const filteredFiles = searchFilter.trim() === '' 
    ? files 
    : files.filter(f => f.name.toLowerCase().includes(searchFilter.toLowerCase()));

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-4xl transform transition-all duration-500 my-auto">
        
        {/* GLASS CARD */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden ring-1 ring-white/60">
          
          {!processedResult ? (
            // Upload / Processing State
            <div className="p-8 md:p-10 relative">
              <div className="mb-8 text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-violet-50 to-indigo-50 mb-6 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <FolderArchive className="w-9 h-9 text-indigo-600 relative z-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Off Consolidator</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                  Consolidate up to 200+ huge files into a single master report. Source file name is prepended to Column A for every row.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upload Area */}
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
                        <p className="text-xs font-medium opacity-70 mt-1">Drag & drop files or click to browse</p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* File List */}
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

                  {/* Search bar inside queue if more than 6 files */}
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
                        <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 shadow-sm">
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

              {/* Progress UI for Huge Datasets / 200 Files */}
              {processing && progress && (
                <div className="mt-6 p-5 bg-indigo-50/70 border border-indigo-100 rounded-2xl backdrop-blur-sm shadow-sm space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-indigo-950">
                      <Loader2 size={14} className="animate-spin text-indigo-600" />
                      <span>Processing file {progress.currentFile} of {progress.totalFiles}</span>
                    </div>
                    <span className="font-mono font-bold text-indigo-700 text-sm">{progress.percent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-indigo-200/60 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(3, progress.percent)}%` }}
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
                <div className="mt-6 p-4 bg-red-50/80 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm backdrop-blur-sm shadow-sm">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Consolidation Failed</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Consolidation Settings */}
              <div className="mt-6 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Consolidation Options</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={removeBlankColumnB} 
                      onChange={(e) => setRemoveBlankColumnB(e.target.checked)}
                      disabled={processing}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Remove blank Column B</span>
                      <p className="text-[11px] text-slate-500">Strips empty spacer Column B so columns align directly with File Name in Col A</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={removeDuplicateHeaders} 
                      onChange={(e) => setRemoveDuplicateHeaders(e.target.checked)}
                      disabled={processing}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Prevent headers from splitting data</span>
                      <p className="text-[11px] text-slate-500">Removes repetitive headers from individual files so data flows continuously</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none sm:col-span-2">
                    <input 
                      type="checkbox" 
                      checked={includeMasterHeader} 
                      onChange={(e) => setIncludeMasterHeader(e.target.checked)}
                      disabled={processing}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Keep 1 master header row at top (Row 1)</span>
                      <p className="text-[11px] text-slate-500">Includes the column title row once at the top of the worksheet (uncheck for 100% pure raw data)</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={handleConsolidate}
                  disabled={files.length === 0 || processing}
                  className={`
                    w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white shadow-xl transition-all duration-300 relative overflow-hidden
                    ${files.length === 0 || processing 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:scale-[1.02] hover:shadow-indigo-500/30'
                    }
                  `}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Consolidating {files.length} Files...</span>
                    </>
                  ) : (
                    <>
                      <span>Consolidate {files.length > 0 ? `${files.length} Files` : 'Off Files'}</span>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Success State with Preview
            <div className="p-8 md:p-10 text-center bg-gradient-to-b from-emerald-50/30 to-transparent">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-b from-emerald-100 to-white mb-4 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-100">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 drop-shadow-sm" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-1">Off Consolidation Completed</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto leading-relaxed">
                Successfully merged <span className="font-bold text-indigo-600">{processedResult.fileCount} files</span> into <span className="font-bold text-indigo-600">{processedResult.rowCount.toLocaleString()} total rows</span>. Column A contains the source file name for all rows.
              </p>

              {/* Warnings if any files had problems */}
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
                    {processedResult.warnings.length > 5 && (
                      <li>...and {processedResult.warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Eye size={14} className="text-indigo-600" />
                    <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-md transition-all hover:scale-[1.02]"
                  >
                    <Download size={16} />
                    <span>Download Report</span>
                  </button>
                  <button 
                    onClick={handleReset}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
                  >
                    Start New
                  </button>
                </div>
              </div>

              {/* Data Preview Table */}
              {showPreview && processedResult.previewRows.length > 0 && (
                <div className="mb-6 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-inner max-h-80 overflow-y-auto">
                  <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dataset Preview (First {processedResult.previewRows.length} rows)</span>
                    <span className="text-[10px] text-slate-400 font-medium">Column 1 = Source File Name</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/70 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                          <th className="px-3 py-1.5 border-r border-slate-200">Source File</th>
                          <th className="px-3 py-1.5 border-r border-slate-200">Col 1</th>
                          <th className="px-3 py-1.5 border-r border-slate-200">Col 2</th>
                          <th className="px-3 py-1.5 border-r border-slate-200">Col 3</th>
                          <th className="px-3 py-1.5 border-r border-slate-200">Col 4</th>
                          <th className="px-3 py-1.5 border-r border-slate-200">Col 5</th>
                          <th className="px-3 py-1.5">Col 6+</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedResult.previewRows.map((row, rIdx) => (
                          <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50/80 font-mono text-[11px]">
                            {row.slice(0, 7).map((cell: any, cIdx: number) => (
                              <td key={cIdx} className={`px-3 py-1.5 truncate max-w-[150px] border-r border-slate-100 ${cIdx === 0 ? 'font-semibold text-indigo-700 bg-indigo-50/30' : 'text-slate-700'}`}>
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <p className="text-center mt-6 text-slate-400/60 text-[10px] font-medium tracking-wide uppercase">
          Off Consolidation Engine • High-Performance Processing Up to 200+ Huge Files
        </p>

      </div>
    </div>
  );
};

