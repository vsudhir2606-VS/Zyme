import * as XLSX from 'xlsx';
import './cptableSetup.ts';
import { clampWorksheetRange } from './excelSafety.ts';

export interface ConsolidatorProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'processing' | 'generating' | 'done';
}

export interface FileContribution {
  fileName: string;
  rowCount: number;
  columnCount: number;
  fileSize: number;
}

export interface ConsolidationResult {
  data: Uint8Array;
  csvBlob: Blob;
  fileCount: number;
  rowCount: number;
  columnCount: number;
  headers: string[];
  previewRows: any[][];
  fileContributions: FileContribution[];
  warnings?: string[];
}

export interface ConsolidatorOptions {
  onProgress?: (progress: ConsolidatorProgressUpdate) => void;
  signal?: AbortSignal;
  includeFileName?: boolean;
  smartColumnAlignment?: boolean;
  removeDuplicateHeaders?: boolean;
}

const clampCell = (val: any): any => {
  if (val === undefined || val === null) return "";
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    return String(val.v ?? val.text ?? val.w ?? "");
  }
  if (typeof val === 'string' && val.length > 32750) {
    return val.slice(0, 32750) + "... [truncated]";
  }
  return val;
};

const escapeCsvCell = (val: any): string => {
  if (val === undefined || val === null) return '""';
  if (val instanceof Date) return `"${val.toISOString()}"`;
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

/**
 * Universal Consolidator Engine:
 * Merges whatever data is given across any number of files updated.
 * Features:
 * - Smart header union & alignment so columns across different files align properly
 * - Automatic duplicate header removal from subsequent files
 * - Optional "Source File" tracking in Column A
 * - Multi-format support (.xlsx, .xls, .csv, .xlsm, .xlsb)
 * - Both Excel (.xlsx) and CSV exports with preview
 */
export const consolidateFiles = async (
  files: File[],
  options?: ConsolidatorOptions
): Promise<ConsolidationResult> => {
  if (files.length === 0) {
    throw new Error("No files selected for consolidation.");
  }

  const { 
    onProgress, 
    signal, 
    includeFileName = true, 
    smartColumnAlignment = true, 
    removeDuplicateHeaders = true 
  } = options || {};

  const totalFiles = files.length;
  const warnings: string[] = [];
  const fileContributions: FileContribution[] = [];

  // Intermediate raw file sheets
  interface ParsedFile {
    file: File;
    rows: any[][];
    headers: string[];
  }
  const parsedFiles: ParsedFile[] = [];

  // Phase 1: Read all files
  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    if (signal?.aborted) {
      throw new Error("Consolidation was cancelled by the user.");
    }

    const file = files[fileIdx];

    if (onProgress) {
      const readPercent = Math.min(50, Math.round(((fileIdx + 1) / totalFiles) * 50));
      onProgress({
        currentFile: fileIdx + 1,
        totalFiles,
        fileName: file.name,
        totalRows: 0,
        percent: readPercent,
        stage: 'reading'
      });
    }

    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const data = await file.arrayBuffer();
      const uint8 = new Uint8Array(data);

      let tempWb: XLSX.WorkBook | null = null;

      try {
        tempWb = XLSX.read(uint8, {
          type: 'array',
          dense: true,
          cellDates: true,
          cellNF: false,
          cellText: false,
          cellHTML: false,
          cellFormula: false
        });
      } catch (_denseErr) {
        try {
          tempWb = XLSX.read(uint8, {
            type: 'array',
            cellDates: true
          });
        } catch (_arrayErr) {
          try {
            const text = await file.text();
            tempWb = XLSX.read(text, { type: 'string' });
          } catch (textErr: any) {
            throw new Error(`Unable to read spreadsheet: ${textErr.message || 'Unsupported format'}`);
          }
        }
      }

      if (!tempWb || !tempWb.SheetNames || !tempWb.SheetNames.length) {
        warnings.push(`File "${file.name}" contains no sheets and was skipped.`);
        continue;
      }

      const sheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[sheetName];
      if (!worksheet) {
        warnings.push(`File "${file.name}" sheet "${sheetName}" was empty or could not be parsed.`);
        continue;
      }

      clampWorksheetRange(worksheet);

      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;
      const rawRows: any[][] = xlsxUtils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false
      });

      if (!rawRows || rawRows.length === 0) {
        warnings.push(`File "${file.name}" contains no data rows and was skipped.`);
        continue;
      }

      // Filter out completely blank rows
      const nonEmptyRows = rawRows.filter(row => 
        Array.isArray(row) && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== "")
      );

      if (nonEmptyRows.length === 0) {
        warnings.push(`File "${file.name}" only contains blank rows.`);
        continue;
      }

      // Extract raw header from row 0
      const rawHeaderRow = nonEmptyRows[0];
      const headers = rawHeaderRow.map((c, i) => {
        const val = String(c ?? "").trim();
        return val ? val : `Column_${i + 1}`;
      });

      parsedFiles.push({
        file,
        rows: nonEmptyRows,
        headers
      });

    } catch (err: any) {
      console.error(`Error reading file ${file.name}:`, err);
      warnings.push(`File "${file.name}" could not be parsed: ${err.message || 'Error'}`);
    }
  }

  if (parsedFiles.length === 0) {
    throw new Error("None of the selected files could be parsed or all were empty.");
  }

  // Phase 2: Unify Headers across all files
  let masterHeaders: string[] = [];
  
  if (smartColumnAlignment) {
    const seenHeaders = new Set<string>();
    parsedFiles.forEach(pf => {
      pf.headers.forEach(h => {
        const key = h.trim();
        if (key && !seenHeaders.has(key.toLowerCase())) {
          seenHeaders.add(key.toLowerCase());
          masterHeaders.push(key);
        }
      });
    });
  } else {
    // Take max columns or first file's headers
    let maxCols = 0;
    parsedFiles.forEach(pf => {
      if (pf.headers.length > maxCols) maxCols = pf.headers.length;
    });
    masterHeaders = parsedFiles[0].headers;
    while (masterHeaders.length < maxCols) {
      masterHeaders.push(`Column_${masterHeaders.length + 1}`);
    }
  }

  // Prepend "Source File" if enabled
  const finalHeaders = includeFileName 
    ? ["Source File", ...masterHeaders] 
    : [...masterHeaders];

  // Consolidated rows accumulator
  const consolidatedRows: any[][] = [finalHeaders];

  // CSV accumulator
  const csvChunks: string[] = [];
  let currentCsvLines: string[] = [];

  const flushCsvLines = () => {
    if (currentCsvLines.length > 0) {
      csvChunks.push(currentCsvLines.join("\r\n") + "\r\n");
      currentCsvLines = [];
    }
  };

  // Push header to CSV
  currentCsvLines.push(finalHeaders.map(escapeCsvCell).join(","));
  flushCsvLines();

  let totalRowCount = 0;

  // Phase 3: Merge rows from all files
  for (let pIdx = 0; pIdx < parsedFiles.length; pIdx++) {
    if (signal?.aborted) {
      throw new Error("Consolidation was cancelled by the user.");
    }

    const pf = parsedFiles[pIdx];
    const { file, rows, headers } = pf;

    if (onProgress) {
      const processPercent = Math.min(88, 50 + Math.round(((pIdx + 1) / parsedFiles.length) * 38));
      onProgress({
        currentFile: pIdx + 1,
        totalFiles: parsedFiles.length,
        fileName: file.name,
        totalRows: totalRowCount,
        percent: processPercent,
        stage: 'processing'
      });
    }

    // Build header column index mapping for this file
    const colIndexMap: number[] = [];
    headers.forEach((h, srcIdx) => {
      const normH = h.trim().toLowerCase();
      const targetIdx = masterHeaders.findIndex(mh => mh.toLowerCase() === normH);
      colIndexMap[srcIdx] = targetIdx !== -1 ? targetIdx : srcIdx;
    });

    let fileRowCount = 0;

    // Start from row 1 if file has a header row, or check if row 0 is header
    const startIndex = 1; // row 0 is header in each file

    for (let r = startIndex; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Check if this row is a duplicate header row
      if (removeDuplicateHeaders) {
        const isDuplicateHeader = row.every((val, colIdx) => {
          const strVal = String(val ?? "").trim();
          if (!strVal) return true;
          return headers[colIdx] && strVal.toLowerCase() === headers[colIdx].toLowerCase();
        });
        if (isDuplicateHeader) continue;
      }

      // Check if row has any non-empty data
      const hasData = row.some(c => c !== undefined && c !== null && String(c).trim() !== "");
      if (!hasData) continue;

      // Construct aligned unified row
      const unifiedRow = new Array(masterHeaders.length).fill("");
      row.forEach((cellVal, srcColIdx) => {
        const targetColIdx = colIndexMap[srcColIdx];
        if (targetColIdx !== undefined && targetColIdx >= 0 && targetColIdx < masterHeaders.length) {
          unifiedRow[targetColIdx] = clampCell(cellVal);
        }
      });

      const fullRow = includeFileName ? [file.name, ...unifiedRow] : unifiedRow;

      consolidatedRows.push(fullRow);
      currentCsvLines.push(fullRow.map(escapeCsvCell).join(","));

      if (currentCsvLines.length >= 2500) {
        flushCsvLines();
      }

      fileRowCount++;
      totalRowCount++;

      if (r > 0 && r % 15000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    fileContributions.push({
      fileName: file.name,
      rowCount: fileRowCount,
      columnCount: headers.length,
      fileSize: file.size
    });
  }

  flushCsvLines();

  // Phase 4: Generate Excel workbook
  if (onProgress) {
    onProgress({
      currentFile: parsedFiles.length,
      totalFiles: parsedFiles.length,
      fileName: 'Generating Excel workbook...',
      totalRows: totalRowCount,
      percent: 92,
      stage: 'generating'
    });
  }

  await new Promise(resolve => setTimeout(resolve, 15));

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Consolidated Data
  const ws1 = (XLSX.utils.aoa_to_sheet as any)(
    consolidatedRows.length > 0 ? consolidatedRows : [["No Data"]],
    { dense: true }
  );

  // Auto column widths
  const colWidths = finalHeaders.map((h, colIdx) => {
    let maxLen = Math.max(10, String(h).length);
    const sampleLimit = Math.min(consolidatedRows.length, 100);
    for (let r = 1; r < sampleLimit; r++) {
      const cell = consolidatedRows[r]?.[colIdx];
      if (cell !== undefined && cell !== null) {
        maxLen = Math.max(maxLen, Math.min(50, String(cell).length));
      }
    }
    return { wch: maxLen + 2 };
  });
  ws1['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, ws1, 'Consolidated Data');

  // Sheet 2: File Audit & Consolidation Summary
  const summaryHeaders = ['#', 'File Name', 'Rows Consolidated', 'File Size (KB)', 'Status'];
  const summaryRows = fileContributions.map((fc, idx) => [
    idx + 1,
    fc.fileName,
    fc.rowCount,
    (fc.fileSize / 1024).toFixed(1),
    fc.rowCount > 0 ? 'Merged Successfully' : 'Empty / Header Only'
  ]);

  const overviewRows = [
    ['METRIC', 'VALUE'],
    ['Total Files Consolidated', fileContributions.length],
    ['Total Rows Consolidated', totalRowCount],
    ['Total Columns Unified', finalHeaders.length],
    ['Consolidation Timestamp', new Date().toLocaleString()],
    ['', ''],
    ['FILE BREAKDOWN', '']
  ];

  const ws2Data = [
    ...overviewRows,
    summaryHeaders,
    ...summaryRows
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  ws2['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, ws2, 'Consolidation Summary');

  // Write Excel binary
  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: false,
    bookSST: false
  });

  const csvBlob = new Blob(csvChunks, { type: 'text/csv;charset=utf-8;' });

  // Preview rows (first 25 rows for instant UI viewing)
  const previewRows = consolidatedRows.slice(0, 26);

  if (onProgress) {
    onProgress({
      currentFile: parsedFiles.length,
      totalFiles: parsedFiles.length,
      fileName: 'Consolidation Complete',
      totalRows: totalRowCount,
      percent: 100,
      stage: 'done'
    });
  }

  return {
    data: new Uint8Array(buffer),
    csvBlob,
    fileCount: fileContributions.length,
    rowCount: totalRowCount,
    columnCount: finalHeaders.length,
    headers: finalHeaders,
    previewRows,
    fileContributions,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};
