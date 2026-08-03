import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, Download, FileText, Loader2, X, FolderArchive, Trash2, Eye } from 'lucide-react';
import { consolidateOofFiles, OofConsolidationResult } from '../utils/oofConsolidatorProcessor.ts';

export const OofConsolidator: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processedResult, setProcessedResult] = useState<OofConsolidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

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

  const handleConsolidate = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setProcessedResult(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Smooth animation delay
      const result = await consolidateOofFiles(files);
      setProcessedResult(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while consolidating Off files.");
    } finally {
      setProcessing(false);
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
  };

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-4xl transform transition-all duration-500 my-auto">
        
        {/* GLASS CARD */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden ring-1 ring-white/60">
          
          {!processedResult ? (
            // Upload State
            <div className="p-8 md:p-10 relative">
              <div className="mb-8 text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-violet-50 to-indigo-50 mb-6 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <FolderArchive className="w-9 h-9 text-indigo-600 relative z-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Off Consolidator</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                  Consolidate multiple files into a single master report. The source file name is automatically inserted into Column A for all rows.
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
                      ${processing ? 'pointer-events-none opacity-80' : ''}
                    `}
                  >
                    <input 
                      type="file" 
                      className="hidden" 
                      multiple
                      accept=".xlsx, .xls, .xlsm, .xlsb, .csv" 
                      onChange={handleFileChange} 
                    />
                    
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <div className="p-4 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow">
                        <Upload size={24} className="opacity-50 group-hover:opacity-100" />
                      </div>
                      <div className="text-center px-4">
                        <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600">Select Files</span>
                        <p className="text-xs font-medium opacity-70 mt-1">Drag & drop files to consolidate</p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* File List */}
                <div className="flex flex-col h-64 bg-slate-900/5 rounded-2xl border border-slate-200/60 overflow-hidden">
                  <div className="p-3 border-b border-slate-200/60 bg-white/40 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Queue ({files.length})</span>
                    {files.length > 0 && (
                      <button onClick={() => setFiles([])} className="text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider">Clear All</button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                    {files.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                        <FileText size={32} strokeWidth={1.5} />
                        <p className="text-[10px] font-bold uppercase mt-2">No files selected</p>
                      </div>
                    ) : (
                      files.map((f, idx) => (
                        <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 shadow-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 bg-indigo-50 rounded-lg">
                              <FileSpreadsheet size={14} className="text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-700 truncate">{f.name}</p>
                              <p className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => removeFile(idx)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Error Toast */}
              {error && (
                <div className="mt-6 p-4 bg-red-50/80 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm backdrop-blur-sm shadow-sm">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Off Consolidation Failed</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

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
                      <span>Consolidating Off Files...</span>
                    </>
                  ) : (
                    <>
                      <span>Consolidate Off Files</span>
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
              <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                Merged <span className="font-bold text-indigo-600">{processedResult.fileCount} files</span> with <span className="font-bold text-indigo-600">{processedResult.rowCount} total rows</span> (Column A contains the source file name for all rows).
              </p>

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
                    <span className="text-[10px] text-slate-400 font-medium">Column 1 = File Name</span>
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
          Off Consolidation Engine • Source File Name Prepend in Column A
        </p>

      </div>
    </div>
  );
};
