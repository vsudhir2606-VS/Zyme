import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Copy, Download, Trash2, FileSpreadsheet, Loader2, Mail } from 'lucide-react';
import * as XLSX from 'xlsx';

interface FileData {
  name: string;
  fileCount: number;
  transactionSum: number;
  rows: any[][];
}

export const InventoryReport: React.FC = () => {
  const [metricsFile, setMetricsFile] = useState<FileData | null>(null);
  const [statusFile, setStatusFile] = useState<FileData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [regionalStats, setRegionalStats] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'metrics' | 'status') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    try {
      const data = await file.arrayBuffer();
      
      const xlsxRead = XLSX.read || (XLSX as any).default?.read;
      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;

      if (!xlsxRead || !xlsxUtils) {
        throw new Error('Excel library (XLSX) not properly loaded.');
      }

      const workbook = xlsxRead(data, { cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Use header: 1 to get an array of arrays (rows)
      const rows = xlsxUtils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[][];
      
      // Include all rows including the first one
      let dataRows = rows;

      // Filter metrics file by present day data in Column C (index 2)
      if (type === 'metrics') {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        
        const todayDotted = `${day}.${month}.${year}`;
        const todaySlashed = `${day}/${month}/${year}`;
        const todayISO = `${year}-${month}-${day}`;
        
        dataRows = dataRows.filter(row => {
          const dateVal = row[2];
          const fileName = String(row[3] || '').trim().toUpperCase();
          
          if (!dateVal) return false;
          
          const dateStr = String(dateVal).trim();
          
          // Must be R1 AND match today's date
          const isR1 = fileName.startsWith('R1');
          const isToday = dateStr.includes(todayDotted) || 
                          dateStr.includes(todaySlashed) || 
                          dateStr.includes(todayISO) ||
                          new Date(dateStr).toDateString() === today.toDateString();
          
          return isR1 && isToday;
        });
      } else if (type === 'status') {
        // Only consider file names (Column A) starting with R1
        dataRows = dataRows.filter(row => {
          const fileName = String(row[0] || '').trim().toUpperCase();
          return fileName.startsWith('R1');
        });
      }
      
      // Files: count of rows in Column A (index 0) for status, Column B (index 1) for metrics
      const fileColIndex = type === 'metrics' ? 1 : 0;
      const fileCount = dataRows.filter(row => row[fileColIndex] !== undefined && row[fileColIndex] !== null && String(row[fileColIndex]).trim() !== '').length;
      
      // Transactions: sum of values in Column G (index 6) for metrics, Column C (index 2) for status
      const transColIndex = type === 'metrics' ? 6 : 2;
      const transactionSum = dataRows.reduce((sum, row) => {
        const rawVal = row[transColIndex];
        if (rawVal === undefined || rawVal === null) return sum;
        
        const valStr = String(rawVal).replace(/,/g, '');
        const val = parseFloat(valStr);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

      const fileData: FileData = {
        name: file.name,
        fileCount,
        transactionSum,
        rows: dataRows
      };

      if (type === 'metrics') {
        setMetricsFile(fileData);
      } else {
        setStatusFile(fileData);
      }
    } catch (err: any) {
      console.error('Error parsing excel file:', err);
      setError(`Failed to parse "${file.name}": ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setReport(null);
      if (e.target) e.target.value = '';
    }
  };

  const generateReport = () => {
    if (!metricsFile || !statusFile) return;

    // Escalations logic: Data from Metrics file Column I (index 8) based on Column D (index 3)
    const getMetricsEscalations = (dataRows: any[][]) => {
      const counts = { APJ: 0, AMS: 0, EMEA: 0 };
      dataRows.forEach(row => {
        const fileName = String(row[3] || '').toUpperCase();
        const escalationVal = parseFloat(String(row[8] || '').replace(/,/g, '')) || 0;
        
        if (fileName.includes('_APJ_')) counts.APJ += escalationVal;
        else if (fileName.includes('_AMS_')) counts.AMS += escalationVal;
        else if (fileName.includes('_EMEA_')) counts.EMEA += escalationVal;
      });
      return counts;
    };

    const totalEscalations = getMetricsEscalations(metricsFile.rows);

    // Regional Table Logic
    const regions = ['APJ', 'AMS', 'EMEA'];
    const stats: Record<string, any> = {};
    
    regions.forEach(r => {
      stats[r] = {
        region: r,
        receivedFiles: 0,
        receivedTransactions: 0,
        releasedFiles: 0,
        releasedTransactions: 0,
        pendingFiles: 0,
        pendingTransactions: 0
      };
    });

    // From Status File (Received)
    statusFile.rows.forEach(row => {
      const fileName = String(row[0] || '').toUpperCase();
      let region = '';
      if (fileName.includes('_APJ_') || fileName.includes('APJ')) region = 'APJ';
      else if (fileName.includes('_AMS_') || fileName.includes('AMS') || fileName.includes('AMER')) region = 'AMS';
      else if (fileName.includes('_EMEA_') || fileName.includes('EMEA')) region = 'EMEA';

      if (region) {
        stats[region].receivedFiles++;
        const transVal = parseFloat(String(row[2] || '').replace(/,/g, '')) || 0;
        stats[region].receivedTransactions += transVal;
      }
    });

    // From Metrics File (Released and also adds to Received)
    metricsFile.rows.forEach(row => {
      const fileName = String(row[3] || '').toUpperCase(); // Column D
      let region = '';
      if (fileName.includes('_APJ_')) region = 'APJ';
      else if (fileName.includes('_AMS_')) region = 'AMS';
      else if (fileName.includes('_EMEA_')) region = 'EMEA';

      if (region) {
        // Released stats: Count from Metrics Column D (index 3) and Value from Column G (index 6)
        stats[region].releasedFiles++;
        const transVal = parseFloat(String(row[6] || '').replace(/,/g, '')) || 0;
        stats[region].releasedTransactions += transVal;
        
        // Add to Received stats as per user request (Received = Status + Metrics)
        stats[region].receivedFiles++;
        stats[region].receivedTransactions += transVal;
      }
    });

    // Calculate Pending and Totals
    const finalStats = regions.map(r => {
      const s = stats[r];
      s.pendingFiles = Math.max(0, s.receivedFiles - s.releasedFiles);
      s.pendingTransactions = Math.max(0, s.receivedTransactions - s.releasedTransactions);
      return s;
    });

    const totalRow = {
      region: 'Total',
      receivedFiles: finalStats.reduce((a, b) => a + b.receivedFiles, 0),
      receivedTransactions: finalStats.reduce((a, b) => a + b.receivedTransactions, 0),
      releasedFiles: finalStats.reduce((a, b) => a + b.releasedFiles, 0),
      releasedTransactions: finalStats.reduce((a, b) => a + b.releasedTransactions, 0),
      pendingFiles: finalStats.reduce((a, b) => a + b.pendingFiles, 0),
      pendingTransactions: finalStats.reduce((a, b) => a + b.pendingTransactions, 0),
    };

    setRegionalStats([...finalStats, totalRow]);

    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Summary text uses the totals from the table to ensure consistency
    const reportText = `Hi Team,

Please find the inventory details

• New Volume (R1 files received during the day): - ${totalRow.receivedFiles} files / ${Math.round(totalRow.receivedTransactions)} Transactions
• Transactions Cleared during the day – ${totalRow.releasedFiles} files / ${Math.round(totalRow.releasedTransactions)} Transactions
• Remaining Transactions R1– ${totalRow.pendingFiles} / ${Math.round(totalRow.pendingTransactions)} Transactions
• Escalations to Gina, Kiran, and Shawn – ( ${totalEscalations.APJ} - APJ, ${totalEscalations.AMS} - AMS and ${totalEscalations.EMEA} - EMEA)

Status of Received R1 File – ${formattedDate}`;

    setReport(reportText);
  };

  const copyToClipboard = () => {
    if (report) {
      navigator.clipboard.writeText(report);
      alert('Text report copied to clipboard!');
    }
  };

  const copyForEmail = async () => {
    if (!report || !regionalStats) return;

    try {
      // Create HTML for the table
      const tableHtml = `
        <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 12px; margin-top: 20px;">
          <thead>
            <tr style="background-color: #1e293b; color: white;">
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Region</th>
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Received File Count</th>
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Received Transaction Count</th>
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Released File Count</th>
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Released Transaction Count</th>
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Pending R1 Files</th>
              <th style="padding: 8px; border: 1px solid #334155; text-align: left;">Pending Transaction Count</th>
            </tr>
          </thead>
          <tbody>
            ${regionalStats.map((row, idx) => `
              <tr style="background-color: ${idx === regionalStats.length - 1 ? '#f1f5f9' : 'white'}; font-weight: ${idx === regionalStats.length - 1 ? 'bold' : 'normal'};">
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.region}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.receivedFiles}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${Math.round(row.receivedTransactions)}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.releasedFiles}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${Math.round(row.releasedTransactions)}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.pendingFiles}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${Math.round(row.pendingTransactions)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      const fullHtml = `
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
          <pre style="font-family: sans-serif; white-space: pre-wrap; margin: 0;">${report}</pre>
          ${tableHtml}
        </div>
      `;

      const textContent = `${report}\n\nRegional Stats:\n${regionalStats.map(r => `${r.region}: Received ${r.receivedFiles}/${Math.round(r.receivedTransactions)}, Released ${r.releasedFiles}/${Math.round(r.releasedTransactions)}, Pending ${r.pendingFiles}/${Math.round(r.pendingTransactions)}`).join('\n')}`;

      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([textContent], { type: 'text/plain' });

      const data = [new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      })];

      await navigator.clipboard.write(data);
      alert('Full report (including table) copied for email!');
    } catch (err) {
      console.error('Failed to copy for email:', err);
      // Fallback to text only
      copyToClipboard();
    }
  };

  const resetAll = () => {
    setMetricsFile(null);
    setStatusFile(null);
    setReport(null);
    setRegionalStats(null);
    setError(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 relative z-10">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Metrics File Upload */}
          <div className={`p-6 rounded-2xl border-2 border-dashed transition-all ${metricsFile ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-white/50 border-slate-200 hover:border-indigo-400'}`}>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`p-3 rounded-xl ${metricsFile ? 'bg-emerald-500/20 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Metrics File</h3>
                <p className="text-xs text-slate-500 mt-1">Upload the daily metrics Excel file</p>
              </div>
              
              {metricsFile ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold">
                  <CheckCircle2 size={14} />
                  <span className="truncate max-w-[150px]">{metricsFile.name}</span>
                  <button onClick={() => setMetricsFile(null)} className="ml-1 hover:text-emerald-900">
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-200">
                  Select File
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'metrics')} />
                </label>
              )}
            </div>
          </div>

          {/* Status File Upload */}
          <div className={`p-6 rounded-2xl border-2 border-dashed transition-all ${statusFile ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-white/50 border-slate-200 hover:border-indigo-400'}`}>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`p-3 rounded-xl ${statusFile ? 'bg-emerald-500/20 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Status File</h3>
                <p className="text-xs text-slate-500 mt-1">Upload the daily status Excel file</p>
              </div>
              
              {statusFile ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold">
                  <CheckCircle2 size={14} />
                  <span className="truncate max-w-[150px]">{statusFile.name}</span>
                  <button onClick={() => setStatusFile(null)} className="ml-1 hover:text-emerald-900">
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-200">
                  Select File
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'status')} />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={18} />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">Upload Error</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {/* Action Button */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={generateReport}
              disabled={!metricsFile || !statusFile || isProcessing}
              className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all shadow-xl ${
                !metricsFile || !statusFile || isProcessing
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0'
              }`}
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
              Generate Inventory Report
            </button>

            {(metricsFile || statusFile || report) && (
              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-6 py-4 rounded-2xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
              >
                <Trash2 size={18} />
                Clear All
              </button>
            )}
          </div>
          
          {(!metricsFile || !statusFile) && !isProcessing && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Please upload {!metricsFile && 'Metrics'} {!metricsFile && !statusFile && '&'} {!statusFile && 'Status'} files to proceed
            </p>
          )}
        </div>

        {/* Report Output */}
        {report && (
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-700">Generated Status Comment</h3>
              <div className="flex gap-2">
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all text-xs font-bold"
                  title="Copy Text Only"
                >
                  <Copy size={16} />
                  Text Only
                </button>
                <button 
                  onClick={copyForEmail}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-all text-xs font-bold shadow-sm shadow-indigo-100"
                  title="Copy for Email (with Table)"
                >
                  <Mail size={16} />
                  Copy for Email
                </button>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-sm bg-slate-50 p-6 rounded-2xl border border-slate-100">
                {report}
              </pre>

              {regionalStats && (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="p-3 border border-slate-700">Region</th>
                        <th className="p-3 border border-slate-700">Received File Count</th>
                        <th className="p-3 border border-slate-700">Received Transaction Count</th>
                        <th className="p-3 border border-slate-700">Released File Count</th>
                        <th className="p-3 border border-slate-700">Released Transaction Count</th>
                        <th className="p-3 border border-slate-700">Pending R1 Files</th>
                        <th className="p-3 border border-slate-700">Pending Transaction Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionalStats.map((row, idx) => (
                        <tr 
                          key={idx} 
                          className={`${idx === regionalStats.length - 1 ? 'bg-slate-100 font-bold' : 'bg-white'} border-b border-slate-200 hover:bg-slate-50 transition-colors`}
                        >
                          <td className="p-3 border border-slate-200">{row.region}</td>
                          <td className="p-3 border border-slate-200">{row.receivedFiles}</td>
                          <td className="p-3 border border-slate-200">{Math.round(row.receivedTransactions)}</td>
                          <td className="p-3 border border-slate-200">{row.releasedFiles}</td>
                          <td className="p-3 border border-slate-200">{Math.round(row.releasedTransactions)}</td>
                          <td className="p-3 border border-slate-200">{row.pendingFiles}</td>
                          <td className="p-3 border border-slate-200">{Math.round(row.pendingTransactions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!report && (
          <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
            <div className="flex gap-4">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg h-fit">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-900 mb-1">How it works</h4>
                <ul className="text-xs text-indigo-700 space-y-2 list-disc ml-4">
                  <li>Upload both the <b>Metrics</b> and <b>Status</b> Excel files.</li>
                  <li>The system will automatically calculate total transactions and file counts.</li>
                  <li>It looks for a <b>"Region"</b> column to identify APJ, AMS, and EMEA escalations.</li>
                  <li>If a <b>"File Name"</b> column exists, it will count unique files; otherwise, it counts the uploaded files.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
