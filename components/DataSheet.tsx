import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, ShieldAlert, Trash2, Search, Table, RefreshCw, Download, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';

export const normalizeKey = (val: string): string => {
  return (val || "")
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\s]+/g, " ") // Standardize multiple/non-breaking spaces
    .replace(/[^\w\s]/gi, "")    // Strip punctuation or non-alphanumeric chars
    .trim();
};

interface DataSheetProps {
  onDataLoaded: (data: Record<string, string[]> | null, fileName: string | null) => void;
  referenceData: Record<string, string[]> | null;
  referenceFileName: string | null;
}

export const DataSheet: React.FC<DataSheetProps> = ({ onDataLoaded, referenceData, referenceFileName }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0], false);
    }
  };

  const handleAppendFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0], true);
    }
  };

  const processFile = async (selectedFile: File, isAppend: boolean = false) => {
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file data");

        // Standard reading for maximum compatibility and robust parsing across all Excel templates
        const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), { 
          type: 'array'
        });

        if (!workbook.SheetNames.length) {
          throw new Error("The file has no readable sheets.");
        }

        // Helper to quickly parse only a small sample of sheet (first 100 rows) for zero-latency sheet identification
        const getSheetSampleRows = (ws: XLSX.WorkSheet): any[][] => {
          if (!ws) return [];
          const originalRef = ws["!ref"];
          if (!originalRef) return [];
          try {
            const startCell = originalRef.split(":")[0] || "A1";
            const endCell = originalRef.split(":")[1] || "AF100";
            const endCol = endCell.replace(/[0-9]/g, '');
            const rangeStr = `${startCell}:${endCol}100`;
            return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, range: rangeStr });
          } catch (e) {
            console.warn("Could not parse sub-range, falling back to full sheet parse for identification", e);
            return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
          }
        };

        let selectedSheetName = workbook.SheetNames[0];
        let maxRecordMatches = 0;

        const findColumnsInRows = (sampleRows: any[][]): { customerColIndex: number; afColIndex: number } => {
          let customerColIndex = 8; // default Column I (index 8)
          let afColIndex = 31;     // default Column AF (index 31)
          let headerRowFound = false;

          const scanRowsLimit = Math.min(sampleRows.length, 15);
          
          // Strategy 1: Look for a row that contains BOTH a clear customer and an AF column header.
          for (let r = 0; r < scanRowsLimit; r++) {
            const row = sampleRows[r];
            if (!row || row.length === 0) continue;
            
            let foundCust = -1;
            let foundAF = -1;
            
            for (let c = 0; c < row.length; c++) {
              const cellVal = String(row[c] || "").trim().toLowerCase();
              if (!cellVal) continue;
              
              const isCust = 
                cellVal === "customer name" || 
                cellVal === "customer" || 
                cellVal === "client" || 
                cellVal === "client name" || 
                cellVal === "company" ||
                cellVal === "i" ||
                cellVal === "i column" ||
                cellVal === "column i" ||
                cellVal === "col i";
                
              const isAF = 
                cellVal === "unique match af values 1" ||
                cellVal === "unique match af values" ||
                cellVal === "af" ||
                cellVal === "af column" ||
                cellVal === "column af" ||
                cellVal === "af value" ||
                cellVal === "af values" ||
                cellVal === "col af" ||
                cellVal.includes("unique match af") ||
                cellVal.includes("af values") ||
                cellVal.includes("af values 1");

              if (isCust) {
                foundCust = c;
              }
              if (isAF) {
                foundAF = c;
              }
            }
            
            if (foundCust !== -1 && foundAF !== -1) {
              customerColIndex = foundCust;
              afColIndex = foundAF;
              headerRowFound = true;
              break;
            }
          }

          // Strategy 2: If we didn't find a row with both headers, check for a row with at least ONE header match
          if (!headerRowFound) {
            for (let r = 0; r < scanRowsLimit; r++) {
              const row = sampleRows[r];
              if (!row || row.length === 0) continue;
              
              let foundCust = -1;
              let foundAF = -1;
              
              for (let c = 0; c < row.length; c++) {
                const cellVal = String(row[c] || "").trim().toLowerCase();
                if (!cellVal) continue;
                
                const isCust = 
                  cellVal === "customer name" || 
                  cellVal === "customer" || 
                  cellVal === "client" || 
                  cellVal === "client name" || 
                  cellVal === "company" ||
                  cellVal === "i" ||
                  cellVal === "i column" ||
                  cellVal === "column i" ||
                  cellVal === "col i";
                  
                const isAF = 
                  cellVal === "unique match af values 1" ||
                  cellVal === "unique match af values" ||
                  cellVal === "af" ||
                  cellVal === "af column" ||
                  cellVal === "column af" ||
                  cellVal === "af value" ||
                  cellVal === "af values" ||
                  cellVal === "col af" ||
                  cellVal.includes("unique match af") ||
                  cellVal.includes("af values") ||
                  cellVal.includes("af values 1");

                if (isCust) {
                  foundCust = c;
                }
                if (isAF) {
                  foundAF = c;
                }
              }

              if (foundCust !== -1 || foundAF !== -1) {
                if (foundCust !== -1) {
                  customerColIndex = foundCust;
                  // Gather all non-empty columns to find the best alternative for AF
                  const nonEvCols: number[] = [];
                  for (let scanR = 0; scanR < Math.min(sampleRows.length, 20); scanR++) {
                    const rData = sampleRows[scanR];
                    if (!rData) continue;
                    for (let colIdx = 0; colIdx < rData.length; colIdx++) {
                      if (rData[colIdx] !== undefined && rData[colIdx] !== null && String(rData[colIdx]).trim() !== "") {
                        if (!nonEvCols.includes(colIdx)) {
                          nonEvCols.push(colIdx);
                        }
                      }
                    }
                  }
                  nonEvCols.sort((a, b) => a - b);
                  const otherCols = nonEvCols.filter(colIdx => colIdx !== foundCust);
                  if (otherCols.length > 0) {
                    // AF Column should be the one with the longest average length
                    let bestOtherCol = otherCols[0];
                    let maxAvgLen = -1;
                    otherCols.forEach(colIdx => {
                      let totalLen = 0;
                      let nonEmpCount = 0;
                      for (let sr = 0; sr < Math.min(sampleRows.length, 50); sr++) {
                        const val = sampleRows[sr]?.[colIdx];
                        if (val !== undefined && val !== null && String(val).trim() !== "") {
                          totalLen += String(val).trim().length;
                          nonEmpCount++;
                        }
                      }
                      const avgLen = nonEmpCount > 0 ? totalLen / nonEmpCount : 0;
                      if (avgLen > maxAvgLen) {
                        maxAvgLen = avgLen;
                        bestOtherCol = colIdx;
                      }
                    });
                    afColIndex = bestOtherCol;
                  } else {
                    afColIndex = foundCust === 0 ? 1 : 0;
                  }
                } else if (foundAF !== -1) {
                  afColIndex = foundAF;
                  // Find the best alternative for Customer Name
                  const nonEvCols: number[] = [];
                  for (let scanR = 0; scanR < Math.min(sampleRows.length, 20); scanR++) {
                    const rData = sampleRows[scanR];
                    if (!rData) continue;
                    for (let colIdx = 0; colIdx < rData.length; colIdx++) {
                      if (rData[colIdx] !== undefined && rData[colIdx] !== null && String(rData[colIdx]).trim() !== "") {
                        if (!nonEvCols.includes(colIdx)) {
                          nonEvCols.push(colIdx);
                        }
                      }
                    }
                  }
                  nonEvCols.sort((a, b) => a - b);
                  const otherCols = nonEvCols.filter(colIdx => colIdx !== foundAF);
                  if (otherCols.length > 0) {
                    // Customer Column should be the one with the shortest average length (but non-zero)
                    let bestOtherCol = otherCols[0];
                    let minAvgLen = Infinity;
                    otherCols.forEach(colIdx => {
                      let totalLen = 0;
                      let nonEmpCount = 0;
                      for (let sr = 0; sr < Math.min(sampleRows.length, 50); sr++) {
                        const val = sampleRows[sr]?.[colIdx];
                        if (val !== undefined && val !== null && String(val).trim() !== "") {
                          totalLen += String(val).trim().length;
                          nonEmpCount++;
                        }
                      }
                      const avgLen = nonEmpCount > 0 ? totalLen / nonEmpCount : 0;
                      if (avgLen < minAvgLen && avgLen > 0) {
                        minAvgLen = avgLen;
                        bestOtherCol = colIdx;
                      }
                    });
                    customerColIndex = bestOtherCol;
                  } else {
                    customerColIndex = foundAF === 0 ? 1 : 0;
                  }
                }
                headerRowFound = true;
                break;
              }
            }
          }

          // Strategy 3: Pure automatic heuristic fallback if no headers matched at all.
          if (!headerRowFound) {
            const colStats: Record<number, { count: number; totalLen: number }> = {};
            for (let r = 0; r < Math.min(sampleRows.length, 50); r++) {
              const row = sampleRows[r];
              if (!row) continue;
              for (let c = 0; c < row.length; c++) {
                const cellVal = row[c];
                if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== "") {
                  if (!colStats[c]) {
                    colStats[c] = { count: 0, totalLen: 0 };
                  }
                  colStats[c].count++;
                  colStats[c].totalLen += String(cellVal).trim().length;
                }
              }
            }

            const activeCols = Object.keys(colStats).map(Number).sort((a, b) => a - b);
            if (activeCols.length >= 2) {
              // Sort active columns by their average string length
              const sortedByLength = [...activeCols].sort((colA, colB) => {
                const avgA = colStats[colA].totalLen / colStats[colA].count;
                const avgB = colStats[colB].totalLen / colStats[colB].count;
                return avgA - avgB;
              });

              // Shorter average length is Customer
              customerColIndex = sortedByLength[0];
              // Longer average length is AF Values
              afColIndex = sortedByLength[sortedByLength.length - 1];
            } else if (activeCols.length === 1) {
              customerColIndex = activeCols[0];
              afColIndex = activeCols[0] === 0 ? 1 : 0;
            } else {
              customerColIndex = 8;
              afColIndex = 31;
            }
          }

          return { customerColIndex, afColIndex };
        };

        for (const name of workbook.SheetNames) {
          const ws = workbook.Sheets[name];
          if (!ws) continue;
          const sampleRows = getSheetSampleRows(ws);
          if (!sampleRows || sampleRows.length === 0) continue;

          const { customerColIndex, afColIndex } = findColumnsInRows(sampleRows);

          let matchesCount = 0;
          sampleRows.forEach((row) => {
            if (row) {
              const customerRaw = row[customerColIndex];
              const afRaw = row[afColIndex];
              if (customerRaw !== undefined && customerRaw !== null && afRaw !== undefined && afRaw !== null) {
                const customerStr = String(customerRaw).trim();
                const afStr = String(afRaw).trim();
                const isHeaderName = customerStr.toLowerCase() === "customer name" || customerStr.toLowerCase() === "customer" || customerStr.toLowerCase() === "client" || customerStr.toLowerCase() === "client name" || customerStr.toLowerCase() === "company";
                if (customerStr && afStr && !isHeaderName) {
                  matchesCount++;
                }
              }
            }
          });

          if (matchesCount > maxRecordMatches) {
            maxRecordMatches = matchesCount;
            selectedSheetName = name;
          }
        }

        const worksheet = workbook.Sheets[selectedSheetName];
        if (!worksheet) {
          throw new Error("Unable to read selected worksheet. Please make sure the Excel file contains sheet data.");
        }

        // Parse full sheet but without allocating empty entries 'defval', keeping memory incredibly sleek
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rows.length === 0) {
          throw new Error("The uploaded file is empty.");
        }

        const { customerColIndex, afColIndex } = findColumnsInRows(rows);

        // Using Set for duplicate identification rather than linear array search, O(1) matching!
        const processedSetMap: Record<string, Set<string>> = {};

        // If appending, populate from current reference data
        if (isAppend && referenceData) {
          Object.entries(referenceData).forEach(([customer, values]) => {
            const key = customer.toLowerCase().trim();
            processedSetMap[key] = new Set(values as string[]);
          });
        }

        // Start from index 0 or index 1 depending on header, but let's just parse all rows
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;

          const customerRaw = row[customerColIndex];
          const afRaw = row[afColIndex];

          if (customerRaw !== undefined && customerRaw !== null && afRaw !== undefined && afRaw !== null) {
            const customerStr = String(customerRaw).trim();
            let afStr = String(afRaw).trim();
            if (afStr.length > 32750) {
              afStr = afStr.slice(0, 32750) + "... [truncated]";
            }

            const isHeaderName = customerStr.toLowerCase() === "customer name" || customerStr.toLowerCase() === "customer" || customerStr.toLowerCase() === "client" || customerStr.toLowerCase() === "client name" || customerStr.toLowerCase() === "company" || customerStr.toLowerCase() === "col i" || customerStr.toLowerCase() === "column i" || customerStr.toLowerCase() === "i";
            if (customerStr && afStr && !isHeaderName) {
              const key = customerStr.toLowerCase();
              let sSet = processedSetMap[key];
              if (!sSet) {
                sSet = new Set<string>();
                processedSetMap[key] = sSet;
              }
              sSet.add(afStr);
            }
          }
        }

        const processedMap: Record<string, string[]> = {};
        const clientKeys = Object.keys(processedSetMap);
        for (let i = 0; i < clientKeys.length; i++) {
          const valsArray = Array.from(processedSetMap[clientKeys[i]]);
          // Sort descending by characters length so longest comments appear first
          valsArray.sort((a, b) => b.length - a.length);
          processedMap[clientKeys[i]] = valsArray;
        }

        if (clientKeys.length === 0) {
          throw new Error("No matching records found. Ensure your file contains a Customer Name column and an AF Values column.");
        }

        const targetFileName = isAppend && referenceFileName
          ? `${referenceFileName} + ${selectedFile.name}`
          : selectedFile.name;

        onDataLoaded(processedMap, targetFileName);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "An error occurred while parsing the Data Sheet. Ensure Customer Name column and AF Values column are present.");
      } finally {
        setLoading(false);
        if (appendFileInputRef.current) {
          appendFileInputRef.current.value = "";
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      setError("File reading failed.");
      setLoading(false);
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (loading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    onDataLoaded(null, null);
    setSearchTerm('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    if (!referenceData) return;

    try {
      const rows: any[][] = [];
      
      // Headers row: Column I (index 8) is "Customer Name", Column AF (index 31) is "Data Sheet AF"
      const headerRow: any[] = [];
      for (let c = 0; c < 32; c++) {
        if (c === 8) {
          headerRow.push("Customer Name");
        } else if (c === 31) {
          headerRow.push("Data Sheet AF");
        } else {
          headerRow.push("");
        }
      }
      rows.push(headerRow);

      // Data rows: loop through every client and write all associated values
      Object.entries(referenceData).forEach(([clientName, afValues]) => {
        const safeClientName = clientName.length > 32750 ? clientName.slice(0, 32750) + "... [truncated]" : clientName;
        (afValues as string[]).forEach((afVal) => {
          const dataRow: any[] = [];
          const safeAfVal = afVal.length > 32750 ? afVal.slice(0, 32750) + "... [truncated]" : afVal;
          for (let c = 0; c < 32; c++) {
            if (c === 8) {
              dataRow.push(safeClientName);
            } else if (c === 31) {
              dataRow.push(safeAfVal);
            } else {
              dataRow.push("");
            }
          }
          rows.push(dataRow);
        });
      });

      // Assemble workbook
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Active Reference Mappings");

      // Write array buffer
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Download name formatting
      let name = referenceFileName ? referenceFileName.replace(/ \+ /g, "_and_") : "active_data_sheet";
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".xlsm")) {
        name += ".xlsx";
      }
      a.download = name;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setError("Failed to export active reference data.");
    }
  };

  const totalMappedClients = referenceData ? Object.keys(referenceData).length : 0;

  // Optimized generator that stops looking immediately after finding 100 entries, preventing browser freezes
  const getFilteredPreview = () => {
    if (!referenceData) return [];
    const results: { customer: string; values: string[] }[] = [];
    const keys = Object.keys(referenceData);
    const lowerSearch = searchTerm.trim().toLowerCase();
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const vals = referenceData[key] || [];
      
      if (!lowerSearch) {
        results.push({ customer: key, values: vals });
        if (results.length >= 100) break; // Cap at first 100 elements
      } else {
        const matchesCustomer = key.includes(lowerSearch);
        const matchesValue = vals.some(v => String(v).toLowerCase().includes(lowerSearch));
        
        if (matchesCustomer || matchesValue) {
          results.push({ customer: key, values: vals });
          if (results.length >= 100) break; // Cap at first 100 search matches
        }
      }
    }
    return results;
  };

  const filteredPreview = getFilteredPreview();

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={appendFileInputRef}
        className="hidden" 
        accept=".xlsx, .xls, .xlsm, .xlsb, .csv" 
        onChange={handleAppendFileUpload} 
      />

      <div className="w-full max-w-4xl transform transition-all duration-500">
        
        {/* GLASS CARD */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden ring-1 ring-white/60 flex flex-col">
          
          {!referenceData ? (
            // UPLOAD STATE
            <div className="p-10 relative">
              <div className="mb-8 text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-50 to-white mb-6 shadow-xl shadow-indigo-500/10 border border-white">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg"></div>
                  <Table className="w-9 h-9 text-indigo-600 relative z-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Data Sheet Mappings</h3>
                <p className="text-slate-500 text-sm max-w-lg mx-auto leading-relaxed">
                  Attach your central mapping file to enrich data processing. Customer names in <span className="font-semibold text-slate-700">Column I</span> will be matched to transfer unique values from <span className="font-semibold text-slate-700">Column AF</span> straight into Column V.
                </p>
              </div>

              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                  group relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed
                  transition-all duration-300 cursor-pointer overflow-hidden bg-slate-50/50
                  border-slate-300 hover:border-indigo-400 hover:bg-white/85
                  ${loading ? 'pointer-events-none opacity-80 bg-slate-100/30' : ''}
                `}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept=".xlsx, .xls, .xlsm, .xlsb, .csv" 
                  onChange={handleFileUpload} 
                />

                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <LoaderIcon className="w-10 h-10 text-indigo-600 animate-spin" />
                    <span className="text-sm font-semibold text-slate-600">Reading Excel worksheets...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-slate-400 group-hover:text-indigo-500 transition-colors">
                    <div className="p-4 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow">
                      <Upload size={24} className="opacity-50 group-hover:opacity-100" />
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600">Click to attach Mapper Sheet</span>
                      <span className="text-sm font-medium opacity-70"> or drag file here</span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-2">Required: Column I (Customer Name) & Column AF (Target Values)</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-6 p-4 bg-red-50/80 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in slide-in-from-top-2 backdrop-blur-sm shadow-sm">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce" />
                  <div className="flex-1">
                    <p className="font-semibold">Verification Failed</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            // ACTIVE PREVIEW STATE
            <div className="flex flex-col h-[520px]">
              
              {/* Header section with status */}
              <div className="p-6 border-b border-slate-100 bg-white/40 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100/50">
                    <Table className="w-5 h-5 text-indigo-600 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-800">Enrichment Mapping Index</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Automated match lookup table active</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 relative" ref={settingsRef}>
                  <div className="px-3 py-1.5 bg-indigo-50/60 border border-indigo-100/50 rounded-xl text-right">
                    <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">MAPPED CLIENTS</span>
                    <span className="text-sm font-black text-indigo-600 leading-none mt-1 block">{totalMappedClients}</span>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className="p-2 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border border-slate-200/80 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                      title="Data Sheet Settings"
                    >
                      <Settings size={18} className={`transition-transform duration-300 ${showSettings ? "rotate-45 text-indigo-600" : ""}`} />
                    </button>

                    {showSettings && (
                      <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 p-4 animate-in fade-in slide-in-from-top-2 duration-150">
                        {/* Status detail inside settings popup */}
                        <div className="pb-3 border-b border-slate-100 mb-2">
                          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Database State</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <CheckCircle2 size={16} className="text-emerald-500 animate-bounce" />
                            <span className="text-xs font-bold text-slate-700">Mappings Loaded</span>
                          </div>
                          {referenceFileName && (
                            <p className="text-[10px] text-slate-400 font-mono mt-1 break-all bg-slate-50 p-1.5 rounded-lg border border-slate-100/60" title={referenceFileName}>
                              {referenceFileName}
                            </p>
                          )}
                        </div>

                        {/* Interactive operations */}
                        <div className="space-y-1">
                          <button
                            onClick={() => {
                              appendFileInputRef.current?.click();
                              setShowSettings(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 text-indigo-600 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer"
                          >
                            <Upload size={14} className={loading ? "animate-spin" : ""} />
                            <span>Add/Append File</span>
                          </button>

                          <button
                            onClick={() => {
                              handleDownload();
                              setShowSettings(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-emerald-50 text-emerald-600 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer"
                          >
                            <Download size={14} />
                            <span>Download Data Sheet</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              handleClear();
                              setShowSettings(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold transition-all text-left border-t border-slate-100 pt-2 mt-2 cursor-pointer"
                          >
                            <Trash2 size={14} />
                            <span>Clear Data</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Search bar */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search mapped customers or mapped unique values..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Interactive preview grid */}
              <div className="flex-1 overflow-auto">
                {filteredPreview.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 sticky top-0 border-b border-slate-100 z-10">
                        <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer Name (Col I matched)</th>
                        <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unique Match AF Values</th>
                        <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white/40">
                      {filteredPreview.map((item, index) => (
                        <tr key={index} className="hover:bg-indigo-50/20 transition-all duration-150">
                          <td className="px-6 py-3 text-xs font-semibold text-slate-700 capitalize max-w-[250px] truncate">{item.customer}</td>
                          <td className="px-6 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {item.values.map((v, i) => (
                                <span key={i} className="px-2 py-0.5 bg-indigo-50 border border-indigo-100/50 rounded text-[10px] font-semibold text-indigo-600">
                                  {v}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-xs font-bold text-slate-400 text-right">{item.values.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <Search size={32} className="opacity-40 mb-2" />
                    <p className="text-sm font-semibold">No matching records found</p>
                    <p className="text-xs opacity-70 mt-1">Try refining your search text</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center mt-6 text-slate-400/60 text-[10px] font-medium tracking-wide uppercase">
          Enrichment mappings run client-side • Zero analytical latency
        </p>
      </div>
    </div>
  );
};

// Simple loader helper components
const LoaderIcon = ({ className }: { className?: string }) => (
  <RefreshCw className={`${className}`} />
);

const XIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
