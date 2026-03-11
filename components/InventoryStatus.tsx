import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, Copy, FileText, Loader2, RefreshCw, X, LayoutDashboard, ClipboardCheck } from 'lucide-react';
import { processInventoryFiles, InventorySummary } from '../utils/inventoryProcessor.ts';

export const InventoryStatus: React.FC = () => {
  const [metricsFile, setMetricsFile] = useState<File | null>(null);
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleProcess = async () => {
    if (!metricsFile || !statusFile) return;

    setProcessing(true);
    setError(null);
    setSummary(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Smooth animation delay
      const result = await processInventoryFiles(metricsFile, statusFile);
      setSummary(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing inventory files.");
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = () => {
    if (!summary) return;
    
    const text = `Hi Team,
 
Please find the inventory details
 
•             New Volume (R1 files received during the day):   - ${summary.newVolumeFiles} files / ${summary.newVolumeTransactions} Transactions
•             Transactions Cleared during the day – ${summary.clearedFiles} files / ${summary.clearedTransactions} Transactions
•             Remaining Transactions R1– ${summary.remainingFiles} / ${summary.remainingTransactions} Transactions
•             Escalations to Gina, Kiran, and Shawn –  ( ${summary.escalations.apj} - APJ, ${summary.escalations.ams} - AMS and ${summary.escalations.emea} - EMEA)
 
Status of Received R1 File – ${summary.date}
		
Region	Received File Count	Received Transaction Count	Released File Count	Released Transaction Count	Pending R1 Files	Pending Transaction Count		
${summary.table.map(t => `${t.region}	${t.receivedFiles}	${t.receivedTransactions}	${t.releasedFiles}	${t.releasedTransactions}	${t.pendingFiles}	${t.pendingTransactions}`).join('\n')}
Total	${summary.table.reduce((s, t) => s + t.receivedFiles, 0)}	${summary.table.reduce((s, t) => s + t.receivedTransactions, 0)}	${summary.table.reduce((s, t) => s + t.releasedFiles, 0)}	${summary.table.reduce((s, t) => s + t.releasedTransactions, 0)}	${summary.table.reduce((s, t) => s + t.pendingFiles, 0)}	${summary.table.reduce((s, t) => s + t.pendingTransactions, 0)}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setMetricsFile(null);
    setStatusFile(null);
    setSummary(null);
    setError(null);
  };

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-4xl transform transition-all duration-500">
        
        {/* GLASS CARD */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden ring-1 ring-white/60">
          
          {!summary ? (
            // Upload State
            <div className="p-10 relative">
              <div className="mb-8 text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-50 to-white mb-6 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <LayoutDashboard className="w-9 h-9 text-indigo-600 relative z-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Inventory Status Generator</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  Upload the Metrics and Status files to generate the daily inventory summary comment.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Metrics File Area */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Metrics File</p>
                  <label 
                    className={`
                      group relative flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed
                      transition-all duration-300 cursor-pointer overflow-hidden bg-slate-50/50
                      ${metricsFile ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-300 hover:border-indigo-400 hover:bg-white/80'}
                      ${processing ? 'pointer-events-none opacity-80' : ''}
                    `}
                  >
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls, .xlsm, .xlsb, .csv" 
                      onChange={(e) => setMetricsFile(e.target.files?.[0] || null)} 
                    />
                    
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <div className={`p-3 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow ${metricsFile ? 'text-emerald-500' : ''}`}>
                        {metricsFile ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                      </div>
                      <div className="text-center px-4">
                        <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600 truncate max-w-[150px] inline-block">
                          {metricsFile ? metricsFile.name : 'Select Metrics File'}
                        </span>
                        <p className="text-[10px] font-medium opacity-70 mt-1">Contains regional volume data</p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Status File Area */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Status File</p>
                  <label 
                    className={`
                      group relative flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed
                      transition-all duration-300 cursor-pointer overflow-hidden bg-slate-50/50
                      ${statusFile ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-300 hover:border-indigo-400 hover:bg-white/80'}
                      ${processing ? 'pointer-events-none opacity-80' : ''}
                    `}
                  >
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls, .xlsm, .xlsb, .csv" 
                      onChange={(e) => setStatusFile(e.target.files?.[0] || null)} 
                    />
                    
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <div className={`p-3 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow ${statusFile ? 'text-emerald-500' : ''}`}>
                        {statusFile ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                      </div>
                      <div className="text-center px-4">
                        <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600 truncate max-w-[150px] inline-block">
                          {statusFile ? statusFile.name : 'Select Status File'}
                        </span>
                        <p className="text-[10px] font-medium opacity-70 mt-1">Contains escalation details</p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Error Toast */}
              {error && (
                <div className="mt-6 p-4 bg-red-50/80 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in slide-in-from-top-2 backdrop-blur-sm shadow-sm">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Processing Failed</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="mt-10">
                <button 
                  onClick={handleProcess}
                  disabled={!metricsFile || !statusFile || processing}
                  className={`
                    w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white shadow-xl transition-all duration-300 relative overflow-hidden
                    ${!metricsFile || !statusFile || processing 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:scale-[1.02] hover:shadow-indigo-500/30'
                    }
                  `}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Analyzing Data...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Inventory Status</span>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Success State - Display Comment
            <div className="p-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <ClipboardCheck className="text-emerald-600 w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Inventory Summary Generated</h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={copyToClipboard}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                  >
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy Comment'}
                  </button>
                  <button 
                    onClick={handleReset}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-6 font-mono text-sm leading-relaxed text-slate-300 overflow-x-auto shadow-inner border border-slate-800">
                <p className="text-slate-100 mb-4">Hi Team,</p>
                <p className="mb-4">Please find the inventory details</p>
                
                <div className="space-y-1 mb-6">
                  <p>• New Volume (R1 files received during the day): - {summary.newVolumeFiles} files / {summary.newVolumeTransactions} Transactions</p>
                  <p>• Transactions Cleared during the day – {summary.clearedFiles} files / {summary.clearedTransactions} Transactions</p>
                  <p>• Remaining Transactions R1– {summary.remainingFiles} / {summary.remainingTransactions} Transactions</p>
                  <p>• Escalations to Gina, Kiran, and Shawn – ( {summary.escalations.apj} - APJ, {summary.escalations.ams} - AMS and {summary.escalations.emea} - EMEA)</p>
                </div>

                <p className="text-slate-100 mb-4">Status of Received R1 File – {summary.date}</p>
                
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-4 font-bold uppercase text-[10px]">Region</th>
                      <th className="py-2 pr-4 font-bold uppercase text-[10px]">Rec. Files</th>
                      <th className="py-2 pr-4 font-bold uppercase text-[10px]">Rec. Trans</th>
                      <th className="py-2 pr-4 font-bold uppercase text-[10px]">Rel. Files</th>
                      <th className="py-2 pr-4 font-bold uppercase text-[10px]">Rel. Trans</th>
                      <th className="py-2 pr-4 font-bold uppercase text-[10px]">Pend. Files</th>
                      <th className="py-2 font-bold uppercase text-[10px]">Pend. Trans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.table.map((t, i) => (
                      <tr key={i} className="border-b border-slate-800/50">
                        <td className="py-2 pr-4 font-bold text-indigo-400">{t.region}</td>
                        <td className="py-2 pr-4">{t.receivedFiles}</td>
                        <td className="py-2 pr-4">{t.receivedTransactions}</td>
                        <td className="py-2 pr-4">{t.releasedFiles}</td>
                        <td className="py-2 pr-4">{t.releasedTransactions}</td>
                        <td className="py-2 pr-4">{t.pendingFiles}</td>
                        <td className="py-2">{t.pendingTransactions}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-800/30">
                      <td className="py-2 pr-4 font-bold text-white">Total</td>
                      <td className="py-2 pr-4 font-bold text-white">{summary.table.reduce((s, t) => s + t.receivedFiles, 0)}</td>
                      <td className="py-2 pr-4 font-bold text-white">{summary.table.reduce((s, t) => s + t.receivedTransactions, 0)}</td>
                      <td className="py-2 pr-4 font-bold text-white">{summary.table.reduce((s, t) => s + t.releasedFiles, 0)}</td>
                      <td className="py-2 pr-4 font-bold text-white">{summary.table.reduce((s, t) => s + t.releasedTransactions, 0)}</td>
                      <td className="py-2 pr-4 font-bold text-white">{summary.table.reduce((s, t) => s + t.pendingFiles, 0)}</td>
                      <td className="py-2 font-bold text-white">{summary.table.reduce((s, t) => s + t.pendingTransactions, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-8 flex justify-center">
                <button 
                  onClick={handleReset}
                  className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all"
                >
                  Process New Files
                </button>
              </div>
            </div>
          )}
        </div>
        
        <p className="text-center mt-8 text-slate-400/60 text-[10px] font-medium tracking-wide uppercase">
          Inventory Analytics Engine • Automated Reporting
        </p>

      </div>
    </div>
  );
};
