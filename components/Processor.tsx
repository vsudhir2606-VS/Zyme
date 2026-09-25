import React, { useState, useRef, useMemo } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  ShieldAlert, 
  CheckCircle2, 
  Download, 
  FileText, 
  Loader2, 
  RefreshCw, 
  X, 
  Search, 
  Check, 
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  FileCheck
} from 'lucide-react';
import { 
  processZymeE4hFile, 
  ZymeE4hResult, 
  ZymeE4hColumnMapping,
  TARGET_ZYME_E4H_COLUMNS,
  findHeaderRow 
} from '../utils/zymeE4hProcessor.ts';
import * as XLSX from 'xlsx';

interface ProcessorProps {
  highRiskKeywords?: string[];
  aprvCodes?: string[];
  referenceData?: Record<string, string[]> | null;
  referenceFileName?: string | null;
  onOpenLiveProcessing?: (rows: any[][], fileName: string) => void;
}

export const Processor: React.FC<ProcessorProps> = ({ 
  highRiskKeywords, 
  aprvCodes,
  onOpenLiveProcessing
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ZymeE4hResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sheet selection state for multi-sheet workbooks
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  
  // Custom column mapping state (optional collapsible)
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [includeRemainingColumns, setIncludeRemainingColumns] = useState(true);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [customMapping, setCustomMapping] = useState<ZymeE4hColumnMapping>({
    status: -1,
    posnr: -1,
    sequenceNo: -1,
    partnerId: -1,
    country: -1,
    name: -1,
    match: -1,
    street: -1,
    city: -1,
    postalCode: -1,
    rplName: -1,
    typeOfList: -1,
    splId: -1,
    rplScreeningStatus: -1,
    rplStreet1: -1,
    rplStreet2: -1,
    state: -1,
  });

  // Preview table state
  const [activeTab, setActiveTab] = useState<'sheet1' | 'sheet2' | 'duplicates' | 'columns'>('sheet1');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scan file on selection to detect sheets & columns before running
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const selected = e.target.files[0];
    setFile(selected);
    setResult(null);
    setError(null);
    setCurrentPage(1);

    try {
      const arrayBuffer = await selected.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      setAvailableSheets(wb.SheetNames);
      const activeSheet = wb.SheetNames[0] || '';
      setSelectedSheet(activeSheet);

      if (activeSheet && wb.Sheets[activeSheet]) {
        const rawRows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[activeSheet], {
          header: 1,
          defval: '',
          blankrows: false,
        });
        if (rawRows && rawRows.length > 0) {
          const { headerRowIndex, mapping } = findHeaderRow(rawRows);
          const headers = (rawRows[headerRowIndex] || []).map((h, i) => String(h || `Column ${i + 1}`).trim());
          setDetectedHeaders(headers);
          setCustomMapping(mapping);
        }
      }
    } catch (err: any) {
      console.warn('Pre-scan notice:', err);
    }
  };

  const handleSheetChange = async (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      if (wb.Sheets[newSheet]) {
        const rawRows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[newSheet], {
          header: 1,
          defval: '',
          blankrows: false,
        });
        if (rawRows && rawRows.length > 0) {
          const { headerRowIndex, mapping } = findHeaderRow(rawRows);
          const headers = (rawRows[headerRowIndex] || []).map((h, i) => String(h || `Column ${i + 1}`).trim());
          setDetectedHeaders(headers);
          setCustomMapping(mapping);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const res = await processZymeE4hFile(file, {
        selectedSheet: selectedSheet || undefined,
        includeRemainingColumns,
        customMapping,
        highRiskKeywords,
        aprvCodes
      });
      setResult(res);
    } catch (err: any) {
      console.error('Zyme E4H processing error:', err);
      setError(err.message || 'An error occurred while processing the Excel file.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!result) return;
    const blob = new Blob([result.excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file?.name.replace(/\.[^/.]+$/, '') || 'Zyme_E4H_Report';
    a.download = `Zyme_E4H_Processed_${baseName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadSheet1Csv = () => {
    if (!result) return;
    const blob = new Blob([result.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file?.name.replace(/\.[^/.]+$/, '') || 'Zyme_E4H_Report';
    a.download = `Zyme_E4H_Sheet1_${baseName}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadSheet2Csv = () => {
    if (!result) return;
    const blob = new Blob([result.sheet2CsvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file?.name.replace(/\.[^/.]+$/, '') || 'Zyme_E4H_Report';
    a.download = `Zyme_E4H_Sheet2_Match_${baseName}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setAvailableSheets([]);
    setSelectedSheet('');
    setDetectedHeaders([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Active headers based on current sheet tab
  const activeHeaders = useMemo(() => {
    if (!result) return [];
    return activeTab === 'sheet2' ? result.sheet2Headers : result.headers;
  }, [result, activeTab]);

  // Filtered rows for clean output preview (Sheet 1 vs Sheet 2)
  const activeDataRows = useMemo(() => {
    if (!result) return [];
    return activeTab === 'sheet2' 
      ? result.sheet2ProcessedRows.slice(1) 
      : result.processedRows.slice(1);
  }, [result, activeTab]);

  const filteredPreviewRows = useMemo(() => {
    if (!activeDataRows.length) return [];
    if (!searchQuery.trim()) return activeDataRows;

    const query = searchQuery.toLowerCase().trim();
    return activeDataRows.filter(row => 
      row.some(cell => String(cell ?? '').toLowerCase().includes(query))
    );
  }, [activeDataRows, searchQuery]);

  const totalPages = Math.ceil(filteredPreviewRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPreviewRows.slice(start, start + pageSize);
  }, [filteredPreviewRows, currentPage, pageSize]);

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-start p-4 md:p-8 overflow-y-auto max-h-full">
      <div className="w-full max-w-5xl">
        
        {/* MAIN CONTAINER CARD */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {!result ? (
            // ==========================================
            // CLEAN & PROFESSIONAL UPLOAD STATE
            // ==========================================
            <div className="p-8 md:p-12">
              
              {/* Clean Title */}
              <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold mb-3">
                  <FileCheck size={14} className="text-indigo-600" />
                  <span>Compliance Data Engine</span>
                </div>
                
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  Zyme E4H New
                </h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto mt-2">
                  Upload your spreadsheet to run deduplication, sequence rules, and standard column sorting.
                </p>
              </div>

              {/* Upload Dropzone */}
              {!file ? (
                <label 
                  className={`
                    group relative flex flex-col items-center justify-center w-full min-h-[200px] rounded-2xl border-2 border-dashed
                    border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/20
                    transition-all duration-200 cursor-pointer p-8 text-center
                  `}
                >
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    className="hidden" 
                    accept=".xlsx, .xls, .xlsm, .xlsb, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                    onChange={handleFileChange} 
                  />
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-xs group-hover:scale-105 group-hover:border-indigo-300 transition-transform mb-3">
                    <Upload size={22} className="text-slate-500 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    <span className="text-indigo-600 hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports Microsoft Excel (.xlsx, .xls, .xlsm) and CSV files
                  </p>
                </label>
              ) : (
                /* Selected File Clean Card */
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 flex-shrink-0">
                        <FileSpreadsheet size={24} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {file.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {(file.size / 1024).toFixed(1)} KB • {detectedHeaders.length} columns detected
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={handleReset}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                      title="Choose another file"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Multi-Sheet Selection */}
                  {availableSheets.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-slate-200/70 flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-600">Select Sheet:</span>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="text-xs font-semibold px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                      >
                        {availableSheets.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Optional Mapping Config Collapsible */}
                  <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={includeRemainingColumns}
                        onChange={(e) => setIncludeRemainingColumns(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span>Include extra unmapped columns at end of file</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setShowMappingConfig(!showMappingConfig)}
                      className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      <SlidersHorizontal size={13} />
                      <span>{showMappingConfig ? 'Hide Column Mapping' : 'Adjust Column Mapping'}</span>
                    </button>
                  </div>

                  {/* Collapsible Column Mapping Overrides */}
                  {showMappingConfig && detectedHeaders.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-xs font-medium text-slate-500 mb-3">
                        Verify or override mapped source columns for standard sorted output (A–P):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1 scrollbar-thin">
                        {TARGET_ZYME_E4H_COLUMNS.map((target) => (
                          <div key={target.key} className="bg-white p-2 rounded-lg border border-slate-200">
                            <label className="text-[10px] font-semibold text-slate-700 block mb-1">
                              Col {target.colLetter}: {target.defaultHeader}
                            </label>
                            <select
                              value={customMapping[target.key as keyof ZymeE4hColumnMapping]}
                              onChange={(e) => setCustomMapping({ 
                                ...customMapping, 
                                [target.key]: Number(e.target.value) 
                              })}
                              className="w-full text-[11px] p-1.5 bg-slate-50 border border-slate-200 rounded text-slate-800 truncate"
                            >
                              <option value={-1}>-- Blank / Unmapped --</option>
                              {detectedHeaders.map((h, i) => (
                                <option key={i} value={i}>Col {i + 1}: {h}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-xs">Error processing file</p>
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
                    w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200
                    ${!file || processing 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm active:scale-[0.99]'
                    }
                  `}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Processing File...</span>
                    </>
                  ) : (
                    <span>Process File</span>
                  )}
                </button>
              </div>

            </div>
          ) : (
            // ==========================================
            // CLEAN & PROFESSIONAL RESULTS VIEW
            // ==========================================
            <div className="p-6 md:p-8">
              
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Processing Complete
                    </h3>
                    <p className="text-xs text-slate-500">
                      {result.fileName} • Sheet: {result.sheetName}
                    </p>
                  </div>
                </div>

                {/* Download Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button 
                    onClick={handleDownloadExcel}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                    title="Download Excel file containing both Sheet 1 and Sheet 2"
                  >
                    <Download size={14} />
                    <span>Download Excel</span>
                    <span className="text-[10px] bg-emerald-800/40 text-emerald-100 px-1.5 py-0.5 rounded">
                      Sheets 1 & 2
                    </span>
                  </button>

                  <button 
                    onClick={handleDownloadSheet1Csv}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg transition-colors"
                    title="Download Sheet 1 as CSV"
                  >
                    <FileText size={14} className="text-slate-500" />
                    <span>Sheet 1 CSV</span>
                  </button>

                  <button 
                    onClick={handleDownloadSheet2Csv}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg transition-colors"
                    title="Download Sheet 2 (Match Analysis) as CSV"
                  >
                    <FileText size={14} className="text-indigo-500" />
                    <span>Sheet 2 CSV</span>
                  </button>

                  {onOpenLiveProcessing && (
                    <button 
                      onClick={() => onOpenLiveProcessing(result.sheet2ProcessedRows || result.processedRows, result.fileName)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                      title="Open this processed dataset directly in Live Processing for compliance action review"
                    >
                      <SlidersHorizontal size={14} />
                      <span>Live Review ➜</span>
                    </button>
                  )}

                  <button 
                    onClick={handleReset}
                    title="Process another file"
                    className="inline-flex items-center justify-center p-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 rounded-lg transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-6">
                
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Clean Rows Kept</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {result.uniqueRowsKept.toLocaleString()}
                  </p>
                  <span className="text-[9px] text-slate-400 font-medium">From {result.totalOriginalRows.toLocaleString()} total rows</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Duplicates Removed</p>
                  <p className="text-xl font-bold text-rose-600 mt-1">
                    {result.duplicatesRemoved.toLocaleString()}
                  </p>
                  <span className="text-[9px] text-slate-400 font-medium">Posnr + Name + RPL + Type</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">High Risk / APRV</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-rose-600">
                      {result.highRiskFlaggedCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Risk</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-xl font-bold text-blue-600">
                      {result.aprvFlaggedCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">APRV</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-medium">{result.statusKeywordsFlaggedCount.toLocaleString()} flagged in Seq 1</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Match (Sheet 2)</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-emerald-600">
                      {result.exactMatchCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Exact</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-xl font-bold text-indigo-600">
                      {result.keywordMatchCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Keyword</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-medium">{(result.exactMatchCount + result.keywordMatchCount).toLocaleString()} common keywords</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Name Retained</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">
                    {result.nameRetainedCount.toLocaleString()}
                  </p>
                  <span className="text-[9px] text-slate-400 font-medium">{result.nameBlankedCount.toLocaleString()} blanked (Seq ≠ 1)</span>
                </div>

              </div>

              {/* Tab Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 mb-4 pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => {
                      setActiveTab('sheet1');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      activeTab === 'sheet1' 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>Sheet 1: Clean Data</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'sheet1' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>
                      {result.uniqueRowsKept.toLocaleString()}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('sheet2');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      activeTab === 'sheet2' 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>Sheet 2: Match Analysis</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === 'sheet2' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                      {result.exactMatchCount} exact
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('duplicates')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === 'duplicates' 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    Removed Duplicates ({result.duplicatesRemoved.toLocaleString()})
                  </button>

                  <button
                    onClick={() => setActiveTab('columns')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === 'columns' 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    Column Mapping
                  </button>
                </div>

                {/* Filter Search */}
                {(activeTab === 'sheet1' || activeTab === 'sheet2') && (
                  <div className="relative w-full sm:w-60">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder={`Search ${activeTab === 'sheet2' ? 'Sheet 2' : 'Sheet 1'}...`}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                    />
                  </div>
                )}
              </div>

              {/* TAB 1 & TAB 2: DATA TABLES (Sheet 1 and Sheet 2) */}
              {(activeTab === 'sheet1' || activeTab === 'sheet2') && (
                <div className="space-y-3">
                  {activeTab === 'sheet2' && (
                    <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-700">Sheet 2 Format:</span>
                        <span>Contains the <strong>Match</strong> column between Name and RPLname comparing customer name & RPL data.</span>
                      </div>
                      <span className="text-[11px] text-indigo-600">
                        {result.exactMatchCount} exact matches • {result.keywordMatchCount} keyword matches
                      </span>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-[420px] scrollbar-thin">
                    <table className="w-full text-left text-xs text-slate-600 border-collapse">
                      <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-10 text-center text-slate-400">#</th>
                          {activeHeaders.map((h, i) => {
                            const colLetter = i < 26 ? String.fromCharCode(65 + i) : `+${i - 25}`;
                            const isMatchHeader = h.toLowerCase() === 'match';
                            return (
                              <th key={i} className={`p-3 font-mono whitespace-nowrap ${isMatchHeader ? 'bg-indigo-50/80 text-indigo-900' : ''}`}>
                                <div className="flex items-center gap-1">
                                  <span className={`text-[10px] font-bold px-1 rounded ${isMatchHeader ? 'text-indigo-700 bg-indigo-100' : 'text-indigo-600 bg-indigo-50'}`}>
                                    {colLetter}
                                  </span>
                                  <span className={isMatchHeader ? 'font-bold text-indigo-900' : ''}>{h}</span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedRows.length === 0 ? (
                          <tr>
                            <td colSpan={activeHeaders.length + 1} className="p-8 text-center text-slate-400">
                              No records found matching search query.
                            </td>
                          </tr>
                        ) : (
                          paginatedRows.map((row, rowIdx) => {
                            const actualRowIdx = (currentPage - 1) * pageSize + rowIdx + 1;

                            return (
                              <tr key={rowIdx} className="hover:bg-slate-50/60 transition-colors">
                                <td className="p-3 text-center font-mono text-[10px] text-slate-400">
                                  {actualRowIdx}
                                </td>
                                {activeHeaders.map((hdr, colI) => {
                                  const cellVal = row[colI];
                                  const hLower = (hdr || '').toLowerCase().trim();
                                  const isStatusCol = colI === 0 || hLower === 'status';
                                  const isMatchCol = hLower === 'match';
                                  const isNameCol = hLower === 'name';
                                  const isSeqCol = hLower.includes('sequence');
                                  const isRplCol = hLower.includes('rpl');

                                  return (
                                    <td 
                                      key={colI} 
                                      className={`p-3 font-mono whitespace-nowrap max-w-xs truncate ${isMatchCol ? 'bg-indigo-50/20' : ''}`}
                                    >
                                      {isStatusCol ? (
                                        cellVal ? (
                                          <div className="flex flex-wrap items-center gap-1">
                                            {String(cellVal).split(',').map((part, pIdx) => {
                                              const tag = part.trim();
                                              const isRisk = tag.toLowerCase().includes('risk');
                                              const isAprv = tag.toUpperCase().includes('APRV');
                                              const isZembZkwd = tag.toUpperCase().includes('ZEMB') || tag.toUpperCase().includes('ZKWD');
                                              
                                              const badgeClass = isRisk
                                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                                : isAprv
                                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                                : isZembZkwd
                                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                                : 'bg-slate-100 text-slate-800 border-slate-300';

                                              return (
                                                <span 
                                                  key={pIdx} 
                                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shadow-2xs ${badgeClass}`}
                                                >
                                                  {tag}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <span className="text-slate-300 font-mono text-[10px]">—</span>
                                        )
                                      ) : isMatchCol ? (
                                        cellVal === 'Exact match' ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                            Exact match
                                          </span>
                                        ) : cellVal ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                                            {String(cellVal)}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300 font-mono text-[10px]">—</span>
                                        )
                                      ) : isNameCol ? (
                                        cellVal ? (
                                          <span className="font-semibold text-slate-800">{String(cellVal)}</span>
                                        ) : (
                                          <span className="text-slate-300 italic text-[10px]">[Blank]</span>
                                        )
                                      ) : isSeqCol ? (
                                        <span className="font-semibold text-slate-700">{String(cellVal ?? '')}</span>
                                      ) : isRplCol ? (
                                        <span className="font-medium text-slate-700">{String(cellVal ?? '')}</span>
                                      ) : (
                                        String(cellVal ?? '')
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 px-1">
                      <span>
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredPreviewRows.length)} of {filteredPreviewRows.length} records
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="font-medium text-slate-700">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: REMOVED DUPLICATES AUDIT */}
              {activeTab === 'duplicates' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-[420px] scrollbar-thin">
                  <table className="w-full text-left text-xs text-slate-600 border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-14 text-center text-slate-400">Row</th>
                        <th className="p-3">Posnr</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">RPL name</th>
                        <th className="p-3">Type of List</th>
                        <th className="p-3">Sequence No</th>
                        <th className="p-3 text-slate-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.duplicateAudit.filter(d => d.isDuplicate).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            No duplicate records found in this file.
                          </td>
                        </tr>
                      ) : (
                        result.duplicateAudit.filter(d => d.isDuplicate).map((dup, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 font-mono text-[11px]">
                            <td className="p-3 text-center text-slate-400">#{dup.rowIndex}</td>
                            <td className="p-3 font-semibold text-slate-800">{dup.posnr || '-'}</td>
                            <td className="p-3 text-slate-700">{dup.name || '-'}</td>
                            <td className="p-3 text-slate-700">{dup.rplName || '-'}</td>
                            <td className="p-3 text-slate-700">{dup.typeOfList || '-'}</td>
                            <td className="p-3 text-slate-700">{dup.sequenceNo || '-'}</td>
                            <td className="p-3 text-rose-600 font-medium">Removed</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: COLUMN MAPPING AUDIT */}
              {activeTab === 'columns' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {result.columnAudits.map((audit) => (
                      <div 
                        key={audit.key} 
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            Col {audit.colLetter}
                          </span>
                          <span className={`text-[10px] font-medium ${audit.isFoundInSource ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {audit.isFoundInSource ? 'Mapped' : 'Blank'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 mt-2">{audit.outputHeader}</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                          {audit.matchedHeaderName}
                        </p>
                      </div>
                    ))}
                  </div>

                  {result.unmappedSourceHeaders.length > 0 && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Appended Columns (after Column P): </span>
                      {result.unmappedSourceHeaders.map(h => h.headerName).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Actions */}
              <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Process Another File
                </button>
                <button
                  onClick={handleDownloadExcel}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <Download size={14} />
                  <span>Download Excel Report</span>
                </button>
              </div>

            </div>
          )}
          
        </div>

      </div>
    </div>
  );
};
