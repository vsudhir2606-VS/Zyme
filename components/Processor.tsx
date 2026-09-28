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
  SlidersHorizontal,
  ArrowRight,
  FileCheck,
  Lock
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
  isLiveLocked?: boolean;
}

export const Processor: React.FC<ProcessorProps> = ({ 
  highRiskKeywords, 
  aprvCodes,
  onOpenLiveProcessing,
  isLiveLocked = false
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scan file on selection to detect sheets & columns before running
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const selected = e.target.files[0];
    setFile(selected);
    setResult(null);
    setError(null);

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

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-start p-4 md:p-8 overflow-y-auto max-h-full">
      <div className="w-full max-w-3xl">
        
        {/* MAIN CONTAINER CARD */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {!result ? (
            // ==========================================
            // SIMPLE & CLEAN UPLOAD STATE
            // ==========================================
            <div className="p-8 md:p-10">
              
              {/* Clean Title */}
              <div className="mb-8 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
                  <FileCheck size={22} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Zyme E4H New
                </h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto mt-1.5">
                  Upload your spreadsheet to deduplicate records, apply sequence rules, and export the clean Excel workbook.
                </p>
              </div>

              {/* Upload Dropzone */}
              {!file ? (
                <label 
                  className="group relative flex flex-col items-center justify-center w-full min-h-[190px] rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/20 transition-all duration-200 cursor-pointer p-8 text-center"
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
                    <span className="text-indigo-600 hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports Excel (.xlsx, .xls, .xlsm) and CSV files
                  </p>
                </label>
              ) : (
                /* Selected File Clean Card */
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
                          {(file.size / 1024).toFixed(1)} KB · {detectedHeaders.length} columns detected
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
                      <span className="text-xs font-medium text-slate-600">Worksheet:</span>
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
                      <span>Include extra unmapped columns</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setShowMappingConfig(!showMappingConfig)}
                      className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      <SlidersHorizontal size={13} />
                      <span>{showMappingConfig ? 'Hide Mapping' : 'Adjust Columns'}</span>
                    </button>
                  </div>

                  {/* Collapsible Column Mapping Overrides */}
                  {showMappingConfig && detectedHeaders.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 max-h-52 overflow-y-auto p-1 scrollbar-thin">
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
                <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
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
            // SIMPLE & CLEAN RESULTS VIEW (NO CLUTTERED TABS OR TABLES)
            // ==========================================
            <div className="p-8 md:p-10 space-y-6">
              
              {/* Clean Completion Header */}
              <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                      Processing Complete
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {result.fileName} <span aria-hidden="true">·</span> Worksheet: {result.sheetName}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={handleReset}
                  title="Process another file"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                >
                  <RefreshCw size={13} />
                  <span>New File</span>
                </button>
              </div>

              {/* Clean Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <p className="text-xs text-slate-500 font-medium">Clean Rows</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {result.uniqueRowsKept.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                    of {result.totalOriginalRows.toLocaleString()} total
                  </p>
                </div>

                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <p className="text-xs text-slate-500 font-medium">Duplicates Removed</p>
                  <p className="text-2xl font-bold text-rose-600 mt-1 tabular-nums">
                    {result.duplicatesRemoved.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Deduplicated
                  </p>
                </div>

                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200/80">
                  <p className="text-xs text-blue-700 font-medium">NO add Flagged</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1 tabular-nums">
                    {(result.noAddFlaggedCount || 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-blue-600/70 mt-0.5">
                    Blank address (E, F, G)
                  </p>
                </div>

                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <p className="text-xs text-slate-500 font-medium">Alerts & Matches</p>
                  <div className="flex items-baseline gap-2 mt-1 tabular-nums">
                    <span className="text-2xl font-bold text-slate-900">
                      {result.statusKeywordsFlaggedCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400">flagged</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                    {result.exactMatchCount} exact · {result.keywordMatchCount} keyword
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button 
                  onClick={handleDownloadExcel}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all active:scale-[0.99]"
                >
                  <Download size={15} />
                  <span>Download Excel Report</span>
                </button>

                {onOpenLiveProcessing && (
                  <button 
                    onClick={() => onOpenLiveProcessing(result.sheet2ProcessedRows || result.processedRows, result.fileName)}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border text-xs font-semibold rounded-lg transition-all active:scale-[0.99] ${
                      isLiveLocked
                        ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 border-slate-300'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                    }`}
                    title={isLiveLocked ? 'Locked — Click to enter password or configure in Settings' : 'Open in Live Processing'}
                  >
                    {isLiveLocked && <Lock size={12} className="text-slate-500" />}
                    <span>Open in Live Processing</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>

            </div>
          )}
          
        </div>

      </div>
    </div>
  );
};
