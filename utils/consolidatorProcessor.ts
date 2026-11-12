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

export interface FailedFileDetail {
  fileName: string;
  fileSize: number;
  reason: string;
}

export class ConsolidationError extends Error {
  public failedFiles: FailedFileDetail[];
  constructor(message: string, failedFiles: FailedFileDetail[] = []) {
    super(message);
    this.name = 'ConsolidationError';
    this.failedFiles = failedFiles;
  }
}

export interface ConsolidationResult {
  data: Uint8Array;
  csvBlob: Blob;
  fileCount: number;
  rowCount: number;
  columnCount: number;
  headers: string[];
  headerSourceFileName: string;
  previewRows: any[][];
  fileContributions: FileContribution[];
  warnings?: string[];
}

export interface ConsolidatorOptions {
  onProgress?: (progress: ConsolidatorProgressUpdate) => void;
  signal?: AbortSignal;
  includeFileName?: boolean;
  takeFirstFileHeaderOnly?: boolean;
  smartColumnAlignment?: boolean;
  removeDuplicateHeaders?: boolean;
  strictAllFilesRequired?: boolean;
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
 * Zyme Consolidator Engine:
 * - Must consolidate ALL files; if any file fails/empty/corrupted, raises an error so UI pops up error modal.
 * - Takes 1 file header (File 1) and consolidates remaining files' data underneath it.
 * - Strips redundant headers from subsequent files.
 */
export const consolidateFiles = async (
  files: File[],
  options?: ConsolidatorOptions
): Promise<ConsolidationResult> => {
  if (!files || files.length === 0) {
    throw new Error("No files selected for consolidation.");
  }

  const { 
    onProgress, 
    signal, 
    includeFileName = false, 
    takeFirstFileHeaderOnly = true,
    smartColumnAlignment = true, 
    removeDuplicateHeaders = true,
    strictAllFilesRequired = true
  } = options || {};

  const totalFiles = files.length;
  const warnings: string[] = [];
  const fileContributions: FileContribution[] = [];
  const failedFiles: FailedFileDetail[] = [];

  interface ParsedFile {
    file: File;
    rows: any[][];
    headers: string[];
  }
  const parsedFiles: ParsedFile[] = [];

  // Phase 1: Read and validate EVERY uploaded file
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

    // Zero-byte check
    if (file.size === 0) {
      failedFiles.push({
        fileName: file.name,
        fileSize: file.size,
        reason: "File is completely empty (0 bytes)."
      });
      continue;
    }

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
            failedFiles.push({
              fileName: file.name,
              fileSize: file.size,
              reason: `Unsupported format or corrupted spreadsheet: ${textErr?.message || 'Read error'}`
            });
            continue;
          }
        }
      }

      if (!tempWb || !tempWb.SheetNames || !tempWb.SheetNames.length) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: "Workbook contains no readable sheets or tabs."
        });
        continue;
      }

      const sheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[sheetName];
      if (!worksheet) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: `Sheet "${sheetName}" is empty or could not be loaded.`
        });
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
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: "File contains 0 data rows."
        });
        continue;
      }

      // Filter out completely blank rows
      const nonEmptyRows = rawRows.filter(row => 
        Array.isArray(row) && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== "")
      );

      if (nonEmptyRows.length === 0) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: "File contains only blank rows."
        });
        continue;
      }

      // Check if file only has a header and no actual data rows
      if (nonEmptyRows.length === 1) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: "File contains only a header row with 0 data rows underneath."
        });
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
      failedFiles.push({
        fileName: file.name,
        fileSize: file.size,
        reason: err.message || "Failed to parse file."
      });
    }
  }

  // Strict check: ALL files must be consolidated! If not, popup error!
  if (strictAllFilesRequired && failedFiles.length > 0) {
    const errorMsg = failedFiles.length === 1
      ? `Zyme Consolidator error: "${failedFiles[0].fileName}" could not be consolidated (${failedFiles[0].reason}). All files must be valid to consolidate.`
      : `Zyme Consolidator error: ${failedFiles.length} of ${totalFiles} files failed consolidation. All files must be valid to consolidate.`;
    throw new ConsolidationError(errorMsg, failedFiles);
  }

  if (parsedFiles.length === 0) {
    throw new ConsolidationError(
      "None of the selected files could be parsed or all were empty.",
      failedFiles
    );
  }

  // Phase 2: Master Header Definition
  // Requirement: "just take 1 file header & remaining just consolidate"
  const firstParsedFile = parsedFiles[0];
  const primaryHeaderSourceFileName = firstParsedFile.file.name;
  
  let masterHeaders: string[] = [];

  if (takeFirstFileHeaderOnly) {
    // Strictly use File 1's header as requested
    masterHeaders = [...firstParsedFile.headers];
  } else if (smartColumnAlignment) {
    // Union headers across files
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
    masterHeaders = [...firstParsedFile.headers];
  }

  // Optional: Add "Source File" to Column A if user explicitly checked it
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

  // Phase 3: Consolidate data rows across ALL files
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

    // Build column index mapping for this file against masterHeaders
    const colIndexMap: number[] = [];
    headers.forEach((h, srcIdx) => {
      const normH = h.trim().toLowerCase();
      const targetIdx = masterHeaders.findIndex(mh => mh.toLowerCase() === normH);
      // If exact or case-insensitive match found, use it; otherwise, if same column index is available, fallback to index
      if (targetIdx !== -1) {
        colIndexMap[srcIdx] = targetIdx;
      } else if (srcIdx < masterHeaders.length) {
        colIndexMap[srcIdx] = srcIdx;
      } else {
        colIndexMap[srcIdx] = -1; // excess column
      }
    });

    let fileRowCount = 0;

    // Row 0 in every file is its header.
    // For file 0: row 0 was used to create masterHeaders.
    // For all files (including subsequent ones): data rows start strictly from index 1!
    const startIndex = 1;

    for (let r = startIndex; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Check if this row is a duplicate repeated header row inside the file
      if (removeDuplicateHeaders) {
        const isDuplicateHeader = row.every((val, colIdx) => {
          const strVal = String(val ?? "").trim();
          if (!strVal) return true;
          const selfHeaderMatch = headers[colIdx] && strVal.toLowerCase() === headers[colIdx].toLowerCase();
          const masterHeaderMatch = masterHeaders[colIdx] && strVal.toLowerCase() === masterHeaders[colIdx].toLowerCase();
          return selfHeaderMatch || masterHeaderMatch;
        });
        if (isDuplicateHeader) continue;
      }

      // Check if row has any non-empty data
      const hasData = row.some(c => c !== undefined && c !== null && String(c).trim() !== "");
      if (!hasData) continue;

      // Construct aligned unified row matching masterHeaders
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
    ['Master Header Source', primaryHeaderSourceFileName],
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
    headerSourceFileName: primaryHeaderSourceFileName,
    previewRows,
    fileContributions,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};
