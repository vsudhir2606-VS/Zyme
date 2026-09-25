import React, { useState, useRef, useMemo } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  Download, 
  FileText, 
  Loader2, 
  X, 
  Trash2, 
  Search, 
  AlertCircle, 
  ArrowRight, 
  Sparkles, 
  Copy, 
  Check, 
  SlidersHorizontal, 
  Users, 
  ListFilter, 
  HelpCircle,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  processE4hFile, 
  E4hExtractionResult, 
  E4hProgressUpdate,
  colLetterToIndex,
  indexToColLetter
} from '../utils/e4hProcessor.ts';

export const ZymeNewE4H: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<E4hProgressUpdate | null>(null);
  const [result, setResult] = useState<E4hExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration options
  const [rplCol, setRplCol] = useState<string>('H');
  const [customerCol, setCustomerCol] = useState<string>('J');
  const [outputFormat, setOutputFormat] = useState<'all_columns' | 'two_column'>('all_columns');
  const [includeRowNumber, setIncludeRowNumber] = useState(true);
  const [skipHeaderKeywords, setSkipHeaderKeywords] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // Filter & Pagination
  const [activeTab, setActiveTab] = useState<'records' | 'customers'>('records');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // When a file is selected, inspect sheet names
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setError(null);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', bookSheets: true });
      if (wb.SheetNames && wb.SheetNames.length > 0) {
        setSheetNames(wb.SheetNames);
        setSelectedSheet(wb.SheetNames[0]);
      } else {
        setSheetNames([]);
        setSelectedSheet('');
      }
    } catch (err) {
      console.error('Error inspecting workbook sheets:', err);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const clearFile = () => {
    setFile(null);
    setSheetNames([]);
    setSelectedSheet('');
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Generate Sample E4H file for testing
  const handleLoadSampleFile = () => {
    const sampleRows = [
      ['Doc ID', 'Type', 'Vendor', 'Plant', 'Code', 'Ref', 'Note', 'RPL Status', 'Batch', 'Customer Name', 'Ship-to City', 'Country'],
      ['', '', '', '', '', '', '', '', '', 'BOEING AEROSPACE CORP', '', ''],
      ['DOC-9001', 'SO', 'V-100', 'US01', 'CAT-A', 'REF-99', 'Cleared', 'RPL-882190', 'B-1', '', 'Seattle', 'US'],
      ['DOC-9002', 'SO', 'V-100', 'US01', 'CAT-A', 'REF-99', 'Cleared', 'RPL-882191', 'B-1', '', 'Seattle', 'US'],
      ['DOC-9003', 'SO', 'V-100', 'US01', 'CAT-A', 'REF-99', 'Cleared', 'RPL-882192', 'B-2', '', 'Seattle', 'US'],
      ['', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', 'RAYTHEON TECHNOLOGIES LTD', '', ''],
      ['DOC-9004', 'SO', 'V-200', 'UK02', 'CAT-B', 'REF-100', 'Review', 'RPL-443100', 'B-9', '', 'Bristol', 'GB'],
      ['DOC-9005', 'SO', 'V-200', 'UK02', 'CAT-B', 'REF-100', 'Review', 'RPL-443101', 'B-9', '', 'Bristol', 'GB'],
      ['', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', 'AIRBUS DEFENCE & SPACE SAS', '', ''],
      ['DOC-9006', 'SO', 'V-300', 'FR01', 'CAT-A', 'REF-102', 'Hold', 'RPL-551020', 'B-14', '', 'Toulouse', 'FR'],
      ['DOC-9007', 'SO', 'V-300', 'FR01', 'CAT-A', 'REF-102', 'Hold', 'RPL-551021', 'B-14', '', 'Toulouse', 'FR'],
      ['DOC-9008', 'SO', 'V-300', 'FR01', 'CAT-A', 'REF-102', 'Hold', 'RPL-551022', 'B-15', '', 'Toulouse', 'FR'],
      ['DOC-9009', 'SO', 'V-300', 'FR01', 'CAT-A', 'REF-102', 'Hold', 'RPL-551023', 'B-15', '', 'Toulouse', 'FR'],
      ['', '', '', '', '', '', '', '', '', '', '', '']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    XLSX.utils.book_append_sheet(wb, ws, 'E4H_Source_Data');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const sampleBlob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const sampleFileObj = new File([sampleBlob], 'Sample_E4H_Export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    handleFileSelect(sampleFileObj);
  };

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setResult(null);
    setCurrentPage(1);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await processE4hFile(file, {
        rplColumn: rplCol.trim().toUpperCase() || 'H',
        customerColumn: customerCol.trim().toUpperCase() || 'J',
        outputFormat,
        includeRowNumber,
        skipHeaderKeywords,
        targetSheetName: selectedSheet,
        signal: controller.signal,
        onProgress: (p) => setProgress(p)
      });
      setResult(res);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setError('Processing cancelled by user.');
      } else {
        console.error(err);
        setError(err.message || 'An error occurred while processing the E4H file.');
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
  };

  const handleDownloadExcel = () => {
    if (!result || !result.xlsxData) return;
    const blob = new Blob([result.xlsxData], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadCsv = () => {
    if (!result || !result.csvBlob) return;
    const url = window.URL.createObjectURL(result.csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName.replace(/\.xlsx$/i, '.csv');
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleCopyToClipboard = () => {
    if (!result || !result.previewRows || result.previewRows.length === 0) return;
    const tsv = result.previewRows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!result) return [];
    return result.records.filter(rec => {
      const matchesSearch = 
        !searchQuery ||
        rec.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.rpl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rec.sourceRowData && rec.sourceRowData.some(c => String(c).toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesCustomer = 
        selectedCustomerFilter === 'all' || 
        rec.customerName === selectedCustomerFilter;

      return matchesSearch && matchesCustomer;
    });
  }, [result, searchQuery, selectedCustomerFilter]);

  // Paginated records
  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      
      {/* Visual Header & Pattern Explainer */}
      <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-white/60 shadow-xl shadow-slate-200/50">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Sparkles size={13} className="text-indigo-600" />
              <span>Zyme New E4H Engine</span>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Zyme New E4H Processor
            </h1>
            <p className="text-xs md:text-sm text-slate-500 max-w-2xl leading-relaxed">
              Finds RPL records in <strong className="text-indigo-600 font-bold">Column H</strong>, detects Customer Name in <strong className="text-indigo-600 font-bold">Column J</strong> from the row above, and correlates all subsequent RPL items until a blank row to that same customer.
            </p>
          </div>

          {/* Logic Diagram Card */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 text-xs space-y-1.5 shadow-2xs self-stretch md:self-auto min-w-[280px]">
            <div className="flex items-center justify-between font-bold text-[11px] text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-200">
              <span>E4H Mapping Logic</span>
              <span className="text-emerald-600 font-semibold">Automatic</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-mono font-bold">Row N - 1</span>
              <ArrowRight size={12} className="text-slate-400" />
              <span>Col J has <strong>Customer Name</strong></span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-900 rounded font-mono font-bold">Row N, N+1...</span>
              <ArrowRight size={12} className="text-slate-400" />
              <span>Col H has <strong>RPL item data</strong></span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-mono font-bold">Blank Row</span>
              <ArrowRight size={12} className="text-slate-400" />
              <span>Completes group & awaits next customer</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone & Configuration */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-lg space-y-6">
        
        {/* Dropzone */}
        {!file ? (
          <div 
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all rounded-3xl p-8 md:p-12 text-center flex flex-col items-center justify-center cursor-pointer group relative"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".xlsx,.xls,.xlsm,.csv" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              className="hidden" 
            />

            <div className="w-16 h-16 rounded-2xl bg-indigo-100/80 group-hover:bg-indigo-200/80 text-indigo-600 flex items-center justify-center transition-all duration-300 shadow-inner mb-4 group-hover:scale-110">
              <Upload size={28} />
            </div>

            <h3 className="text-base md:text-lg font-bold text-slate-800 mb-1">
              Upload your E4H Excel Spreadsheet
            </h3>
            <p className="text-xs text-slate-500 max-w-md mb-4">
              Drag and drop your <code className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">.xlsx</code> or <code className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">.xls</code> file here, or click to browse.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200">
                <FileSpreadsheet size={14} className="text-indigo-600" />
                <span>Select File from Computer</span>
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadSampleFile();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 transition-colors shadow-2xs"
              >
                <Sparkles size={14} className="text-amber-600" />
                <span>Try Sample E4H Dataset</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-800 text-sm md:text-base">
                    {file.name}
                  </h4>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB • Last modified: {new Date(file.lastModified).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Sheet Selection if multi-sheet */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Worksheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium"
                  >
                    {sheetNames.map((sn) => (
                      <option key={sn} value={sn}>{sn}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={clearFile}
                disabled={processing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
                <span>Replace File</span>
              </button>
            </div>
          </div>
        )}

        {/* Configuration Accordion */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <SlidersHorizontal size={14} className="text-indigo-600" />
            <span>Column Settings & Advanced Options</span>
            <span className="px-2 py-0.5 text-[10px] bg-indigo-50 text-indigo-700 rounded-full font-bold">
              Default: Col H (RPL) & Col J (Customer)
            </span>
          </button>

          {showConfig && (
            <div className="mt-4 p-5 bg-slate-50/90 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
              {/* RPL Column */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  RPL Column Letter
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={rplCol}
                  onChange={(e) => setRplCol(e.target.value.toUpperCase())}
                  placeholder="H"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">Default is Column H (8th column)</p>
              </div>

              {/* Customer Column */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer Column Letter
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={customerCol}
                  onChange={(e) => setCustomerCol(e.target.value.toUpperCase())}
                  placeholder="J"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">Default is Column J (10th column, row above)</p>
              </div>

              {/* Output Columns format */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Output Columns Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="all_columns">Customer, RPL + All Original Columns</option>
                  <option value="two_column">Customer & RPL Only (2 Columns)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Choose output columns complexity</p>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Row & Header Options
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeRowNumber}
                    onChange={(e) => setIncludeRowNumber(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-400 w-4 h-4"
                  />
                  <span>Include Source Row #</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={skipHeaderKeywords}
                    onChange={(e) => setSkipHeaderKeywords(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-400 w-4 h-4"
                  />
                  <span>Skip Table Header Rows</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleProcess}
            disabled={!file || processing}
            className={`
              flex-1 w-full py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all duration-300 shadow-xl
              ${!file
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : processing
                ? 'bg-indigo-600 text-white opacity-90 cursor-wait'
                : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/25 hover:scale-[1.01] active:scale-[0.99]'
              }
            `}
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing E4H File ({progress?.percent || 0}%)...</span>
              </>
            ) : (
              <>
                <Database size={18} />
                <span>Extract & Correlate E4H Records</span>
              </>
            )}
          </button>

          {processing && (
            <button
              onClick={handleCancel}
              className="w-full sm:w-auto px-5 py-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold border border-red-200 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Progress Display */}
        {processing && progress && (
          <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
              <span className="capitalize">{progress.stage}... {progress.fileName}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full h-2 bg-indigo-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-4 bg-red-50 rounded-2xl border border-red-200 text-red-800 text-xs flex items-center gap-3">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* RESULTS WORKSPACE */}
      {result && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Top KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total RPL Records</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  <Database size={15} />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-slate-800">
                {result.totalRecords.toLocaleString()}
              </p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                Extracted from Column {rplCol}
              </p>
            </div>

            <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Unique Customers</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
                  <Users size={15} />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-slate-800">
                {result.totalCustomers.toLocaleString()}
              </p>
              <p className="text-[11px] text-amber-700 font-semibold mt-1">
                Identified from Column {customerCol} (Row Above)
              </p>
            </div>

            <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg RPLs / Customer</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">
                  <ListFilter size={15} />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-slate-800">
                {result.totalCustomers > 0 ? (result.totalRecords / result.totalCustomers).toFixed(1) : 0}
              </p>
              <p className="text-[11px] text-purple-700 font-semibold mt-1">
                Per non-blank grouping
              </p>
            </div>

            <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Output Columns</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  <TableIcon size={15} />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-slate-800">
                {result.headers.length}
              </p>
              <p className="text-[11px] text-slate-500 font-semibold mt-1">
                {outputFormat === 'all_columns' ? 'Full Data Sheet' : 'Customer + RPL'}
              </p>
            </div>
          </div>

          {/* Export & Actions Toolbar */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  onClick={() => setActiveTab('records')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'records'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Records Table ({filteredRecords.length})
                </button>
                <button
                  onClick={() => setActiveTab('customers')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'customers'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Customer Groups ({result.customerSummaries.length})
                </button>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleDownloadExcel}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95"
              >
                <Download size={14} />
                <span>Download Excel (.xlsx)</span>
              </button>

              <button
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold border border-slate-200 transition-all"
              >
                <FileText size={14} className="text-slate-600" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handleCopyToClipboard}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold border border-slate-200 transition-all"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Table'}</span>
              </button>
            </div>
          </div>

          {/* TAB 1: RECORDS TABLE */}
          {activeTab === 'records' && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg overflow-hidden space-y-4">
              
              {/* Filter controls */}
              <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50/50">
                <div className="relative w-full md:w-80">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search Customer or RPL..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Filter Customer:</span>
                    <select
                      value={selectedCustomerFilter}
                      onChange={(e) => {
                        setSelectedCustomerFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 max-w-[200px] truncate"
                    >
                      <option value="all">All Customers ({result.totalCustomers})</option>
                      {result.customerSummaries.map((c) => (
                        <option key={c.customerName} value={c.customerName}>
                          {c.customerName} ({c.rplCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">#</th>
                      {includeRowNumber && (
                        <th className="py-3 px-4 w-28">Source Row</th>
                      )}
                      <th className="py-3 px-4 min-w-[220px]">Customer Name (Col J)</th>
                      <th className="py-3 px-4 min-w-[150px]">RPL Item (Col H)</th>
                      {outputFormat === 'all_columns' && result.headers.slice(includeRowNumber ? 3 : 2).map((hdr, i) => (
                        <th key={i} className="py-3 px-4 whitespace-nowrap">{hdr}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal">
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={20} className="py-12 text-center text-slate-400 text-xs">
                          No matching records found.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map((rec, idx) => {
                        const globalIndex = (currentPage - 1) * pageSize + idx + 1;
                        return (
                          <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-400">
                              {globalIndex}
                            </td>
                            {includeRowNumber && (
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                                Row {rec.sourceRowNumber}
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <span className="font-bold text-slate-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-xs">
                                {rec.customerName}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200 text-xs">
                                {rec.rpl}
                              </span>
                            </td>
                            {outputFormat === 'all_columns' && rec.sourceRowData && (
                              result.headers.slice(includeRowNumber ? 3 : 2).map((_, colIdx) => {
                                // Skip Col H and Col J in extra columns
                                const originalColIdx = colIdx >= colLetterToIndex(rplCol) ? (colIdx >= colLetterToIndex(customerCol) ? colIdx + 2 : colIdx + 1) : colIdx;
                                const cellVal = rec.sourceRowData?.[originalColIdx];
                                return (
                                  <td key={colIdx} className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                                    {cellVal !== undefined && cellVal !== null ? String(cellVal) : ''}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                <div>
                  Showing <strong className="text-slate-800">{filteredRecords.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to <strong className="text-slate-800">{Math.min(currentPage * pageSize, filteredRecords.length)}</strong> of <strong className="text-slate-800">{filteredRecords.length}</strong> records
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-bold text-slate-700 px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CUSTOMER GROUPS BREAKDOWN */}
          {activeTab === 'customers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.customerSummaries.map((cust, idx) => (
                <div 
                  key={idx}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-md space-y-3 hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {cust.customerName}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        First identified at Row #{cust.firstRowNumber}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-bold text-xs flex-shrink-0">
                      {cust.rplCount} RPL{cust.rplCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Associated RPL Codes:
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {cust.rpls.map((rpl, rIdx) => (
                        <span 
                          key={rIdx}
                          className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-md font-mono text-[11px]"
                        >
                          {rpl}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

    </div>
  );
};
