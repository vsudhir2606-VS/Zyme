import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  ShieldAlert, 
  CheckCircle2, 
  Download, 
  Loader2, 
  RefreshCw, 
  X, 
  FileText, 
  Database, 
  Globe, 
  Search, 
  Table, 
  Eye, 
  EyeOff,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { processExcelFile } from '../utils/excelProcessor.ts';
import * as XLSX from 'xlsx';
import { safeSheetToAoA } from '../utils/excelSafety.ts';

interface DataProcessorProps {
  highRiskKeywords?: string[];
  aprvCodes?: string[];
  referenceData?: Record<string, string[]> | null;
  referenceFileName?: string | null;
}

interface ProcessStats {
  totalRows: number;
  highRiskCount: number;
  aprvCount: number;
  zkwdZembCount: number;
  noAddCount: number;
  splCount: number;
  referenceMatchesCount: number;
  rplMatchesCount: number;
}

export const DataProcessor: React.FC<DataProcessorProps> = ({
  highRiskKeywords = [],
  aprvCodes = [],
  referenceData = null,
  referenceFileName = null
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<Uint8Array | null>(null);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [stats, setStats] = useState<ProcessStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview table state
  const [showPreview, setShowPreview] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setProcessedData(null);
      setPreviewRows([]);
      setStats(null);
      setError(null);
      setCurrentPage(1);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setProcessedData(null);
    setPreviewRows([]);
    setStats(null);

    try {
      const buffer = await processExcelFile(file, {
        highRiskKeywords,
        aprvCodes,
        referenceData: referenceData || undefined
      });

      setProcessedData(buffer);

      // Parse the generated workbook buffer to compute summary stats and extract preview
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const worksheet = wb.Sheets[firstSheetName];
      const rows: any[][] = safeSheetToAoA(worksheet, { 
        defval: '', 
        blankrows: false 
      });

      if (rows && rows.length > 0) {
        setPreviewRows(rows);

        // Calculate statistics from data rows (skip header row at index 0)
        let highRisk = 0;
        let aprv = 0;
        let zkwdZemb = 0;
        let noAdd = 0;
        let spl = 0;
        let refMatches = 0;
        let rplMatches = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const status = String(row[0] || '').trim();
          if (status === 'High Risk') highRisk++;
          else if (status === 'APRV') aprv++;
          else if (status.includes('ZKWD') || status.includes('ZEMB')) zkwdZemb++;
          else if (status === 'No add') noAdd++;
          else if (status === 'SPL') spl++;

          // Check if any RPL match exists in columns I to M (indices 8 to 12)
          for (let c = 8; c <= 12; c++) {
            if (row[c] && String(row[c]).trim() !== '') {
              rplMatches++;
              break;
            }
          }

          // Check if reference data was matched (Column index 23 and beyond)
          for (let c = 23; c < row.length; c++) {
            const val = String(row[c] || '').trim();
            if (val && val !== 'N/A') {
              refMatches++;
              break;
            }
          }
        }

        setStats({
          totalRows: Math.max(0, rows.length - 1),
          highRiskCount: highRisk,
          aprvCount: aprv,
          zkwdZembCount: zkwdZemb,
          noAddCount: noAdd,
          splCount: spl,
          referenceMatchesCount: refMatches,
          rplMatchesCount: rplMatches
        });
      }
    } catch (err: any) {
      console.error('Data Processing Error:', err);
      setError(err.message || 'Failed to process file. Ensure it is a valid Excel or CSV document.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedData || !file) return;
    const blob = new Blob([processedData], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    a.download = `Processed_${baseName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    setProcessedData(null);
    setPreviewRows([]);
    setStats(null);
    setError(null);
    setSearchQuery('');
    setStatusFilter('all');
    setCurrentPage(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Preview filtering and pagination
  const headers = previewRows.length > 0 ? previewRows[0] : [];
  const dataRows = previewRows.length > 1 ? previewRows.slice(1) : [];

  const filteredRows = dataRows.filter((row) => {
    const status = String(row[0] || '').trim();
    if (statusFilter !== 'all' && status !== statusFilter) {
      if (statusFilter === 'ZKWD & ZEMB' && !(status.includes('ZKWD') || status.includes('ZEMB'))) {
        return false;
      } else if (statusFilter !== 'ZKWD & ZEMB') {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const customer = String(row[3] || '').toLowerCase();
      const fileName = String(row[1] || '').toLowerCase();
      const refNo = String(row[2] || '').toLowerCase();
      const rpl1 = String(row[8] || '').toLowerCase();
      return customer.includes(q) || fileName.includes(q) || refNo.includes(q) || rpl1.includes(q);
    }

    return true;
  });

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'High Risk':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'APRV':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'ZKWD & ZEMB':
      case 'ZKWD':
      case 'ZEMB':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'No add':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 relative z-10 font-inter">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* CONTAINER CARD */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {!processedData ? (
            // ==========================================
            // UPLOAD & PROCESS SCREEN
            // ==========================================
            <div className="p-8 md:p-12">
              {/* Header */}
              <div className="text-center max-w-xl mx-auto mb-8">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
                  <FileSpreadsheet size={24} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Data Processor
                </h3>
                <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
                  Upload raw compliance logs to extract match names, denial types, SPL IDs, apply risk detection rules, and enrich with Data Sheet mappings.
                </p>
              </div>

              {/* Active Rules Info Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 max-w-2xl mx-auto">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                    <ShieldAlert size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium">Risk Keywords</p>
                    <p className="text-xs font-bold text-slate-800 tabular-nums">
                      {highRiskKeywords.length} configured
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <Globe size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium">APRV Codes</p>
                    <p className="text-xs font-bold text-slate-800 tabular-nums">
                      {aprvCodes.length} active
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                    <Database size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium">Data Sheet</p>
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {referenceData ? `${Object.keys(referenceData).length} entities` : 'None linked'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="max-w-2xl mx-auto">
                {!file ? (
                  <label 
                    className="group relative flex flex-col items-center justify-center w-full min-h-[220px] rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/20 transition-all duration-200 cursor-pointer p-8 text-center"
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls, .xlsm, .xlsb, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                      onChange={handleFileChange} 
                    />
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-2xs group-hover:scale-105 group-hover:border-indigo-300 transition-transform mb-3">
                      <Upload size={20} className="text-slate-500 group-hover:text-indigo-600 transition-colors" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                      <span className="text-indigo-600 hover:underline">Click to upload raw file</span> or drag and drop
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Supports Excel (.xlsx, .xls, .xlsm, .xlsb) and CSV
                    </p>
                  </label>
                ) : (
                  /* Selected File Card */
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 flex-shrink-0">
                          <FileSpreadsheet size={22} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-900 truncate">
                            {file.name}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {(file.size / 1024).toFixed(1)} KB · Ready to process
                          </p>
                        </div>
                      </div>

                      <button 
                        onClick={handleReset}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                        title="Remove file"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-xs">Error Processing File</p>
                      <p className="text-xs text-red-600/90 mt-0.5">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg">
                      <X size={15} />
                    </button>
                  </div>
                )}

                {/* Action Button */}
                <div className="mt-6">
                  <button 
                    onClick={handleProcess}
                    disabled={!file || processing}
                    className={`
                      w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200
                      ${!file || processing 
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs active:scale-[0.99]'
                      }
                    `}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Running Compliance Analysis...</span>
                      </>
                    ) : (
                      <span>Run Data Processor</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // ==========================================
            // PROCESSED RESULTS & PREVIEW SCREEN
            // ==========================================
            <div className="p-6 md:p-8 space-y-6">
              
              {/* Top Completion Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                      Processing Complete
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {file?.name} · Modern Excel report generated with RPL fuzzy lookup sheets
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleDownload}
                    className="inline-flex items-center gap-2 py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-[0.99]"
                  >
                    <Download size={15} />
                    <span>Download Processed Report</span>
                  </button>

                  <button 
                    onClick={handleReset}
                    title="Process another file"
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <RefreshCw size={13} />
                    <span>New File</span>
                  </button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-500 font-medium">Total Rows</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                      {stats.totalRows.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Records parsed</p>
                  </div>

                  <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200">
                    <p className="text-[11px] text-amber-800 font-semibold">High Risk</p>
                    <p className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">
                      {stats.highRiskCount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-amber-600 mt-0.5">Keyword match</p>
                  </div>

                  <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200">
                    <p className="text-[11px] text-emerald-800 font-semibold">APRV</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
                      {stats.aprvCount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">CTR Code match</p>
                  </div>

                  <div className="p-4 bg-orange-50/70 rounded-xl border border-orange-200">
                    <p className="text-[11px] text-orange-800 font-semibold">ZKWD / ZEMB</p>
                    <p className="text-2xl font-bold text-orange-700 mt-1 tabular-nums">
                      {stats.zkwdZembCount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-orange-600 mt-0.5">W/AA flag</p>
                  </div>

                  <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200">
                    <p className="text-[11px] text-blue-800 font-semibold">No add</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">
                      {stats.noAddCount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Blank addresses</p>
                  </div>

                  <div className="p-4 bg-indigo-50/70 rounded-xl border border-indigo-200">
                    <p className="text-[11px] text-indigo-800 font-semibold">Data Sheet Matches</p>
                    <p className="text-2xl font-bold text-indigo-700 mt-1 tabular-nums">
                      {stats.referenceMatchesCount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-indigo-600 mt-0.5">Enriched rows</p>
                  </div>
                </div>
              )}

              {/* Data Preview Section */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Table size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-800">
                      Processed Report Preview ({filteredRows.length.toLocaleString()} rows)
                    </h4>
                  </div>

                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
                  </button>
                </div>

                {showPreview && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    {/* Filter & Search Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Search customer, ref no, file name..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                        />
                      </div>

                      {/* Status Filter Tabs */}
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                        {['all', 'High Risk', 'APRV', 'ZKWD & ZEMB', 'No add', 'SPL'].map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              setStatusFilter(s);
                              setCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              statusFilter === s
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {s === 'all' ? 'All' : s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white max-h-96 scrollbar-thin">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-700 sticky top-0 shadow-2xs">
                          <tr>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">Status</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">File Name</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">Ref No</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">Customer Name</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">City</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">CTR</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">RPL 1</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">Denial Type 1</th>
                            <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">Splid 1</th>
                            {headers.length > 23 && (
                              <th className="p-2.5 border-b border-slate-200 font-bold whitespace-nowrap">Data Sheet Match</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedRows.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="p-8 text-center text-slate-400">
                                No records match your search or filter.
                              </td>
                            </tr>
                          ) : (
                            paginatedRows.map((row, idx) => {
                              const status = String(row[0] || 'SPL');
                              return (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors tabular-nums">
                                  <td className="p-2.5 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(status)}`}>
                                      {status}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-slate-700 max-w-[140px] truncate" title={String(row[1] || '')}>
                                    {String(row[1] || '')}
                                  </td>
                                  <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">
                                    {String(row[2] || '')}
                                  </td>
                                  <td className="p-2.5 font-semibold text-slate-900 max-w-[200px] truncate" title={String(row[3] || '')}>
                                    {String(row[3] || '')}
                                  </td>
                                  <td className="p-2.5 text-slate-600 whitespace-nowrap">
                                    {String(row[6] || '')}
                                  </td>
                                  <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">
                                    {String(row[7] || '')}
                                  </td>
                                  <td className="p-2.5 text-slate-700 max-w-[160px] truncate" title={String(row[8] || '')}>
                                    {String(row[8] || '-')}
                                  </td>
                                  <td className="p-2.5 text-slate-600 max-w-[140px] truncate" title={String(row[13] || '')}>
                                    {String(row[13] || '-')}
                                  </td>
                                  <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                                    {String(row[18] || '-')}
                                  </td>
                                  {headers.length > 23 && (
                                    <td className="p-2.5 text-indigo-700 font-medium max-w-[180px] truncate" title={String(row[23] || '')}>
                                      {String(row[23] || 'N/A')}
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {filteredRows.length > pageSize && (
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <span>
                          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} rows
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="px-2 font-semibold text-slate-700 tabular-nums">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
