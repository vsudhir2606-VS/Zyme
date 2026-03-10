import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, ShieldAlert, CheckCircle2, Download, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import { processExcelFile } from '../utils/excelProcessor.ts';

interface ProcessorProps {
  highRiskKeywords: string[];
  aprvCodes: string[];
}

export const Processor: React.FC<ProcessorProps> = ({ highRiskKeywords, aprvCodes }) => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      await new Promise(resolve => setTimeout(resolve, 1200)); // Smooth animation delay
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
    
    let baseName = file?.name || 'Report';
    const lastDotIndex = baseName.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      baseName = baseName.substring(0, lastDotIndex);
    }
    a.download = `Processed_${baseName}.xlsx`;
    
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
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl transform transition-all hover:scale-[1.01] duration-500">
        
        {/* GLASS CARD */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden ring-1 ring-white/60">
          
          {!processedData ? (
            // Upload State
            <div className="p-12 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>

              <div className="mb-10 text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-50 to-white mb-6 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <Upload className="w-9 h-9 text-indigo-600 relative z-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Upload File</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto">
                  Drag and drop your <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">.xlsx / .xls / .csv</span> file here to begin processing.
                </p>
              </div>

              <label 
                className={`
                  group relative flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed
                  transition-all duration-300 cursor-pointer overflow-hidden bg-slate-50/50
                  ${file 
                    ? 'border-indigo-500 bg-indigo-50/30' 
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-white/80'
                  }
                  ${processing ? 'pointer-events-none opacity-80' : ''}
                `}
              >
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx, .xls, .xlsm, .xlsb, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  onChange={handleFileChange} 
                />
                
                {file ? (
                  <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <div className="p-3 bg-white rounded-xl shadow-md mb-3">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                    </div>
                    <span className="font-semibold text-slate-800 text-sm">{file.name}</span>
                    <span className="text-xs font-medium text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB</span>
                    
                    {!processing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm">
                         <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                            <RefreshCw size={16} /> Change File
                         </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
                    <div className="p-4 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow">
                      <Upload size={24} className="opacity-50 group-hover:opacity-100" />
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600">Click to browse</span>
                      <span className="text-sm font-medium opacity-70"> or drag file here</span>
                    </div>
                  </div>
                )}
              </label>

              {error && (
                <div className="mt-6 p-4 bg-red-50/80 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in slide-in-from-top-2 backdrop-blur-sm shadow-sm">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Processing Failed</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="mt-8">
                <button 
                  onClick={handleProcess}
                  disabled={!file || processing}
                  className={`
                    w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white shadow-xl transition-all duration-300 relative overflow-hidden
                    ${!file || processing 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:scale-[1.02] hover:shadow-indigo-500/30'
                    }
                  `}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Running Analysis...</span>
                    </>
                  ) : (
                    <>
                      <span>Run Process</span>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Success State
            <div className="p-12 text-center animate-in fade-in slide-in-from-bottom-8 duration-500 bg-gradient-to-b from-emerald-50/30 to-transparent">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-b from-emerald-100 to-white mb-6 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-100">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 drop-shadow-sm" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Analysis Complete</h3>
              <p className="text-slate-500 text-sm mb-10 max-w-xs mx-auto leading-relaxed">
                The file has been successfully processed and converted to a modern Excel report.
              </p>

              <div className="bg-white/80 rounded-2xl p-5 border border-slate-100 mb-10 shadow-sm flex items-center justify-between backdrop-blur-sm">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <FileText className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Ready for download</p>
                    <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">Processed_{file?.name.replace(/\.[^/.]+$/, "")}.xlsx</p>
                  </div>
                </div>
                <div className="text-right pl-4 border-l border-slate-100">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Size</p>
                   <p className="text-sm font-bold text-slate-800">~{(processedData.length / 1024).toFixed(0)} KB</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDownload}
                  className="group w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold shadow-xl shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                >
                  <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                  Download Report
                </button>
                <button 
                  onClick={handleReset}
                  className="w-full py-4 text-slate-500 hover:text-slate-700 font-semibold transition-colors text-sm hover:bg-slate-50 rounded-xl"
                >
                  Process Another File
                </button>
              </div>
            </div>
          )}
        </div>
        
        <p className="text-center mt-8 text-slate-400/60 text-[10px] font-medium tracking-wide uppercase">
          Encrypted Local Processing • Zero Data Retention
        </p>

      </div>
    </div>
  );
};
