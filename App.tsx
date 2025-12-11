import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, ShieldAlert, Globe, Settings, CheckCircle2, Download, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import { processExcelFile } from './utils/excelProcessor';
import { TagInput } from './components/TagInput';

// Default values
const DEFAULT_APRV_CODES = ['RU', 'UA', 'NI', 'VE', 'BY', 'CU', 'IR', 'KP', 'SY'];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Configuration State with Persistence
  const [highRiskKeywords, setHighRiskKeywords] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zyme_highRiskKeywords');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load high risk keywords', e);
      return [];
    }
  });

  const [aprvCodes, setAprvCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zyme_aprvCodes');
      return saved ? JSON.parse(saved) : DEFAULT_APRV_CODES;
    } catch (e) {
      console.error('Failed to load APRV codes', e);
      return DEFAULT_APRV_CODES;
    }
  });

  // Persist state
  useEffect(() => {
    localStorage.setItem('zyme_highRiskKeywords', JSON.stringify(highRiskKeywords));
  }, [highRiskKeywords]);

  useEffect(() => {
    localStorage.setItem('zyme_aprvCodes', JSON.stringify(aprvCodes));
  }, [aprvCodes]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setProcessedData(null);
      setError(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setProcessedData(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // UI smoothness
      const result = await processExcelFile(file, {
        highRiskKeywords,
        aprvCodes
      });
      setProcessedData(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the file.");
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedData) return;
    const blob = new Blob([processedData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Processed_${file?.name || 'Report.xlsx'}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    setProcessedData(null);
    setError(null);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-inter selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Dark Sidebar */}
      <aside className="w-80 bg-slate-900 flex-shrink-0 flex flex-col border-r border-slate-800 shadow-2xl z-10">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">ZymeProcessor</h1>
              <p className="text-xs text-slate-400 font-medium">Compliance Tool</p>
            </div>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <ShieldAlert className="w-4 h-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Risk Configuration</h2>
            </div>
            <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Keywords defined here will trigger a <span className="text-amber-400 font-medium">High Risk</span> status if matched in the Customer Name.
              </p>
              <TagInput 
                tags={highRiskKeywords} 
                onChange={setHighRiskKeywords} 
                placeholder="e.g. SANCTION" 
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-2">
              <Globe className="w-4 h-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Country Codes</h2>
            </div>
            <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                CTR values matching these codes will be flagged as <span className="text-emerald-400 font-medium">APRV</span>.
              </p>
              <TagInput 
                tags={aprvCodes} 
                onChange={setAprvCodes} 
                placeholder="e.g. US" 
              />
            </div>
          </div>

        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 text-center">
           <p className="text-[10px] text-slate-600">v1.2.0 • Secure Local Processing</p>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Decorative Mesh */}
        <div className="absolute inset-0 bg-slate-50">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-indigo-200/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-200/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-200/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>

        {/* Header */}
        <header className="relative z-10 px-8 py-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
            <p className="text-slate-500 text-sm">Upload raw data to generate compliance reports</p>
          </div>
          <div className="flex items-center gap-3">
             <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 shadow-sm">
               Read-only mode off
             </span>
             <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
               <Settings className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
          
          <div className="w-full max-w-xl">
            
            {/* Main Card */}
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden transition-all duration-300">
              
              {!processedData ? (
                // Upload State
                <div className="p-10">
                  <div className="mb-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 mb-4 ring-8 ring-indigo-50/50">
                      <Upload className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">Upload Data File</h3>
                    <p className="text-slate-500 text-sm">Select your Excel file (.xlsx) to begin analysis</p>
                  </div>

                  <label 
                    className={`
                      relative group flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed
                      transition-all duration-300 cursor-pointer overflow-hidden
                      ${file 
                        ? 'border-indigo-500 bg-indigo-50/50' 
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                      }
                      ${processing ? 'pointer-events-none opacity-50' : ''}
                    `}
                  >
                    <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                    
                    {file ? (
                      <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <FileText className="w-10 h-10 text-indigo-600 mb-2" />
                        <span className="font-semibold text-indigo-900 text-sm">{file.name}</span>
                        <span className="text-xs text-indigo-500 mt-1">{(file.size / 1024).toFixed(1)} KB • Ready to process</span>
                        <div className="absolute top-2 right-2 p-1 bg-white/50 rounded-full hover:bg-white text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                           <RefreshCw size={14} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400 group-hover:text-indigo-500 transition-colors">
                        <span className="text-sm font-medium">Drop file here or browse</span>
                        <span className="text-[10px] mt-1 uppercase tracking-wider opacity-60">Supports XLSX</span>
                      </div>
                    )}
                  </label>

                  {/* Error Toast */}
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-700 text-sm animate-in slide-in-from-top-2">
                      <X className="w-4 h-4 flex-shrink-0 cursor-pointer" onClick={() => setError(null)} />
                      <p>{error}</p>
                    </div>
                  )}

                  <div className="mt-8">
                    <button 
                      onClick={handleProcess}
                      disabled={!file || processing}
                      className={`
                        w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white shadow-lg transition-all duration-300
                        ${!file || processing 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                          : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/25 active:scale-[0.98]'
                        }
                      `}
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processing Data...</span>
                        </>
                      ) : (
                        <>
                          <span>Run Analysis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                // Success State
                <div className="p-10 text-center animate-in fade-in slide-in-from-bottom-8 duration-500">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-6 ring-8 ring-emerald-50">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Processing Complete</h3>
                  <p className="text-slate-500 text-sm mb-8">
                    Your data has been analyzed and formatted successfully.
                  </p>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                        <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-slate-400 font-medium uppercase">Output File</p>
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">Processed_{file?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-xs text-slate-400 font-medium uppercase">Status</p>
                       <p className="text-sm font-semibold text-emerald-600">Ready</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={handleDownload}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98]"
                    >
                      <Download className="w-5 h-5" />
                      Download Report
                    </button>
                    <button 
                      onClick={handleReset}
                      className="w-full py-3.5 text-slate-500 hover:text-slate-700 font-medium transition-colors text-sm"
                    >
                      Process Another File
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-center mt-6 text-slate-400 text-xs font-medium">
              Data is processed locally in your browser.
            </p>

          </div>
        </div>
      </main>
    </div>
  );
}