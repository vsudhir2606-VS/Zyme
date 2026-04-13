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
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const parseZymeNumber = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    const str = String(val).trim();
    if (!str) return 0;
    
    // Handle the specific case where . is used as a thousands separator (e.g., 1.100 -> 1100)
    // If the string has a dot followed by 3 digits, or multiple dots, treat dots as separators.
    // If it has both . and ,, determine which is the decimal based on position.
    if (str.includes('.') && str.includes(',')) {
      const dotIdx = str.lastIndexOf('.');
      const commaIdx = str.lastIndexOf(',');
      if (dotIdx < commaIdx) {
        // . is thousands, , is decimal
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        // , is thousands, . is decimal
        return parseFloat(str.replace(/,/g, '')) || 0;
      }
    }
    
    // If it only has dots and matches thousands pattern (e.g. 1.100 or 1.100.000)
    if (str.includes('.') && !str.includes(',')) {
      // If it looks like a thousands format (e.g., 1.100, 12.345, 1.234.567)
      // We'll treat the dot as a thousands separator if it's followed by 3 digits
      if (/\.\d{3}/.test(str)) {
        return parseFloat(str.replace(/\./g, '')) || 0;
      }
    }

    // Default: remove commas, treat dot as decimal
    return parseFloat(str.replace(/,/g, '')) || 0;
  };

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

      // Filter metrics file by selected date data in Column C (index 2)
      if (type === 'metrics') {
        const targetDate = new Date(selectedDate);
        const day = String(targetDate.getDate()).padStart(2, '0');
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const year = targetDate.getFullYear();
        
        const targetDotted = `${day}.${month}.${year}`;
        const targetSlashed = `${day}/${month}/${year}`;
        const targetISO = `${year}-${month}-${day}`;
        
        dataRows = dataRows.filter(row => {
          const dateVal = row[2];
          const fileName = String(row[3] || '').trim().toUpperCase();
          
          if (!dateVal) return false;
          
          const dateStr = String(dateVal).trim();
          
          // Must be R1 AND match target date
          const isR1 = fileName.startsWith('R1');
          const isTargetDate = dateStr.includes(targetDotted) || 
                               dateStr.includes(targetSlashed) || 
                               dateStr.includes(targetISO) ||
                               new Date(dateStr).toDateString() === targetDate.toDateString();
          
          return isR1 && isTargetDate;
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
        return sum + parseZymeNumber(row[transColIndex]);
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

    // Regional Table Logic
    const regions = ['APJ', 'AMS', 'EMEA'];
    const stats: Record<string, any> = {};
    const totalEscalations = { APJ: 0, AMS: 0, EMEA: 0 };
    
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

    const statusFileNames = new Set<string>();
    statusFile.rows.forEach(row => {
      const fileName = String(row[0] || '').trim().toUpperCase();
      if (fileName) statusFileNames.add(fileName);
    });

    // Use a Map to track unique files and their best data
    // This avoids double counting when files exist in both metrics and status
    const fileDataMap = new Map<string, { 
      region: string, 
      transVal: number, 
      isApproved: boolean, 
      escalationVal: number 
    }>();

    // 1. Process Status File first (as baseline for pending files)
    statusFile.rows.forEach(row => {
      const fileName = String(row[0] || '').trim().toUpperCase();
      if (!fileName) return;

      let region = '';
      if (fileName.includes('_APJ_') || fileName.includes('APJ')) region = 'APJ';
      else if (fileName.includes('_AMS_') || fileName.includes('AMS') || fileName.includes('AMER')) region = 'AMS';
      else if (fileName.includes('_EMEA_') || fileName.includes('EMEA')) region = 'EMEA';

      if (region) {
        const transVal = parseZymeNumber(row[2]);
        fileDataMap.set(fileName, {
          region,
          transVal,
          isApproved: false,
          escalationVal: 0
        });
      }
    });

    // 2. Process Metrics File (overwrites or adds to the map)
    // Group metrics rows by fileName to handle duplicates
    const metricsGroups = new Map<string, any[]>();
    metricsFile.rows.forEach(row => {
      const fileName = String(row[3] || '').trim().toUpperCase();
      if (!fileName) return;
      if (!metricsGroups.has(fileName)) metricsGroups.set(fileName, []);
      metricsGroups.get(fileName)!.push(row);
    });

    metricsGroups.forEach((rows, fileName) => {
      // If file exists in both, don't consider metrics file (Request 11)
      if (fileDataMap.has(fileName)) return;

      // Find if any row has "Approved Entries"
      const approvedRow = rows.find(row => 
        row.some(cell => String(cell || '').toLowerCase().includes('approved entries'))
      );
      
      // If duplicates exist, prioritize the approved row, otherwise take the first one
      const rowToUse = approvedRow || rows[0];
      const isApproved = !!approvedRow;

      let region = '';
      if (fileName.includes('_APJ_')) region = 'APJ';
      else if (fileName.includes('_AMS_')) region = 'AMS';
      else if (fileName.includes('_EMEA_')) region = 'EMEA';

      if (region) {
        const transVal = parseZymeNumber(rowToUse[6]);
        // Only consider escalation if not repeated in metrics (Request 12)
        const escalationVal = rows.length === 1 ? parseZymeNumber(rowToUse[8]) : 0;
        
        fileDataMap.set(fileName, {
          region,
          transVal,
          isApproved,
          escalationVal
        });
      }
    });

    // 3. Calculate stats from the consolidated map
    fileDataMap.forEach((data, fileName) => {
      const { region, transVal, isApproved, escalationVal } = data;
      
      // Received stats
      stats[region].receivedFiles++;
      stats[region].receivedTransactions += transVal;

      // Released logic:
      // - If it has "Approved Entries" in metrics, it's released (Request 9)
      // - If it's NOT in the status file, it's released (Standard logic)
      const isReleased = isApproved || !statusFileNames.has(fileName);

      if (isReleased) {
        stats[region].releasedFiles++;
        stats[region].releasedTransactions += transVal;
      }
      
      // Add escalation value (Request 12)
      // This will be Column I for metrics-only files (if not repeated), 
      // and 0 for status files or repeated metrics files.
      totalEscalations[region as keyof typeof totalEscalations] += escalationVal;
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

    const reportDateObj = new Date(selectedDate);
    const formattedDate = reportDateObj.toLocaleDateString('en-GB', {
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
        
        {/* Date Selection */}
        <div className="bg-white/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Report Date</h3>
            <p className="text-xs text-slate-500 mt-1">Select the date for which to pull data</p>
          </div>
          <div className="relative">
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
            />
          </div>
        </div>

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
