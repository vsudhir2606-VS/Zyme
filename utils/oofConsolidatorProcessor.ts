import * as XLSX from 'xlsx';
import './cptableSetup.ts';

export interface ProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'processing' | 'generating' | 'done';
}

export interface OofConsolidationResult {
  data: Uint8Array | null;
  csvBlob: Blob;
  fileCount: number;
  rowCount: number;
  previewRows: any[][];
  warnings?: string[];
  isCsvOnly?: boolean;
}

export interface ConsolidateOptions {
  onProgress?: (progress: ProgressUpdate) => void;
  signal?: AbortSignal;
  removeBlankColumnB?: boolean;
  removeDuplicateHeaders?: boolean;
  includeMasterHeader?: boolean;
}

// Target max cells per worksheet to stay well within browser V8 array allocation limits
const TARGET_MAX_CELLS_PER_SHEET = 350000;
const ABSOLUTE_MAX_ROWS_PER_SHEET = 50000;

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

/**
 * Escapes a cell value for clean RFC-4180 compliant CSV output
 */
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
 * Consolidates multiple Excel/CSV files (even up to 200+ huge files) into a master report.
 * The source file name is prepended to Column A for every row.
 * Uses SheetJS dense mode, safe sheet partitioning, and uncompressed packaging
 * to eliminate "Invalid array length" and "Too many properties to enumerate" errors.
 */
export const consolidateOofFiles = async (
  files: File[],
  options?: ConsolidateOptions
): Promise<OofConsolidationResult> => {
  if (files.length === 0) {
    throw new Error("No files selected for consolidation.");
  }

  const { 
    onProgress, 
    signal, 
    removeBlankColumnB = true, 
    removeDuplicateHeaders = true, 
    includeMasterHeader = true 
  } = options || {};

  const previewRows: any[][] = [];
  const warnings: string[] = [];
  let totalRowCount = 0;

  // SheetJS workbook
  const workbook = XLSX.utils.book_new();

  // CSV accumulator chunks (each chunk holds ~2500 lines to avoid massive strings)
  const csvChunks: string[] = [];
  let currentCsvLines: string[] = [];

  const flushCsvLines = () => {
    if (currentCsvLines.length > 0) {
      csvChunks.push(currentCsvLines.join("\r\n") + "\r\n");
      currentCsvLines = [];
    }
  };

  // Dynamic sheet row chunking
  let currentSheetRows: any[][] = [];
  let sheetIndex = 1;
  let estimatedColumns = 10;

  const flushCurrentSheet = () => {
    if (currentSheetRows.length === 0) return;
    // CRITICAL: Must use dense mode so cells are stored in 2D array, not as millions of object properties
    const ws = (XLSX.utils.aoa_to_sheet as any)(currentSheetRows, { dense: true });
    const sheetTitle = sheetIndex === 1 ? 'Off Consolidated' : `Off Consolidated (${sheetIndex})`;
    XLSX.utils.book_append_sheet(workbook, ws, sheetTitle);
    currentSheetRows = [];
    sheetIndex++;
  };

  const totalFiles = files.length;
  let headerSignature = '';

  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    if (signal?.aborted) {
      throw new Error("Consolidation was cancelled by the user.");
    }

    const file = files[fileIdx];

    // Report progress before reading file
    if (onProgress) {
      const readPercent = Math.min(88, Math.round((fileIdx / totalFiles) * 88));
      onProgress({
        currentFile: fileIdx + 1,
        totalFiles,
        fileName: file.name,
        totalRows: totalRowCount,
        percent: readPercent,
        stage: 'reading'
      });
    }

    // Yield control to the browser so the UI stays interactive and GC can run
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      let tempWb: XLSX.WorkBook | null = null;

      // Strategy 1: Fast memory-efficient dense read
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
        // Strategy 2: Fallback to standard array read (for complex legacy BIFF8 XLS)
        try {
          tempWb = XLSX.read(uint8, {
            type: 'array',
            cellDates: true
          });
        } catch (_arrayErr) {
          // Strategy 3: Text/string read (often needed when ERP/legacy systems export HTML tables or XML SpreadsheetML with .xls extension)
          try {
            const text = await file.text();
            tempWb = XLSX.read(text, { type: 'string' });
          } catch (textErr: any) {
            throw new Error(`Unable to read spreadsheet: ${textErr.message || 'Corrupted or unsupported format'}`);
          }
        }
      }

      if (!tempWb || !tempWb.SheetNames || !tempWb.SheetNames.length) {
        warnings.push(`File "${file.name}" has no readable sheets and was skipped.`);
        continue;
      }

      const firstSheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[firstSheetName];
      if (!worksheet) {
        warnings.push(`File "${file.name}" sheet "${firstSheetName}" was empty or could not be loaded.`);
        continue;
      }

      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;
      const jsonData: any[][] = xlsxUtils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false
      });

      if (!jsonData || jsonData.length === 0) {
        continue;
      }

      // Check if Column B is truly blank across sample rows
      const hasColumnB = jsonData.some(r => r && r.length > 1);
      const isColBActuallyBlank = hasColumnB && jsonData.slice(0, 50).every(
        r => !r || r.length <= 1 || r[1] === "" || r[1] === null || r[1] === undefined || String(r[1]).trim() === ""
      );

      const shouldDropColB = removeBlankColumnB && isColBActuallyBlank;

      // Update estimated columns to dynamically calculate safe rows per sheet
      if (jsonData[0] && jsonData[0].length > 0) {
        estimatedColumns = Math.max(estimatedColumns, jsonData[0].length);
      }
      const maxRowsForThisSheet = Math.max(
        10000,
        Math.min(ABSOLUTE_MAX_ROWS_PER_SHEET, Math.floor(TARGET_MAX_CELLS_PER_SHEET / Math.max(1, estimatedColumns)))
      );

      // Process rows for this file
      for (let r = 0; r < jsonData.length; r++) {
        const rawRow = jsonData[r];
        if (!rawRow || rawRow.length === 0) continue;

        // Verify if row is completely empty
        const hasContent = rawRow.some(cell => cell !== "" && cell !== null && cell !== undefined);
        if (!hasContent) continue;

        // Build clean row (filtering Column B if requested and truly blank)
        const cleanRow: any[] = [file.name];
        for (let c = 0; c < rawRow.length; c++) {
          if (shouldDropColB && c === 1) {
            // Drop the blank B column
            continue;
          }
          cleanRow.push(clampCell(rawRow[c]));
        }

        // Row signature to detect repeated headers across files
        const rowSig = rawRow.map(c => String(c ?? '').trim().toLowerCase()).join('|');

        // If this is row 0 of the first file, save header signature
        if (fileIdx === 0 && r === 0) {
          headerSignature = rowSig;
          if (!includeMasterHeader) {
            // User opted out of master header
            continue;
          }
        } else if (removeDuplicateHeaders) {
          // If this is row 0 of any subsequent file, or matches header signature, skip it so headers don't split data
          if (r === 0 || (headerSignature && rowSig === headerSignature)) {
            continue;
          }
        }

        // Add to active sheet
        currentSheetRows.push(cleanRow);
        totalRowCount++;

        // Add to CSV stream lines
        currentCsvLines.push(cleanRow.map(escapeCsvCell).join(','));
        if (currentCsvLines.length >= 2500) {
          flushCsvLines();
        }

        // Store up to 100 sample rows for instant preview
        if (previewRows.length < 100) {
          previewRows.push(cleanRow);
        }

        // If current sheet reaches safe limit, flush to workbook and start next sheet
        if (currentSheetRows.length >= maxRowsForThisSheet) {
          flushCurrentSheet();
        }

        // Yield occasionally on massive individual files (every 10,000 rows)
        if (r > 0 && r % 10000 === 0) {
          if (onProgress) {
            onProgress({
              currentFile: fileIdx + 1,
              totalFiles,
              fileName: file.name,
              totalRows: totalRowCount,
              percent: Math.min(88, Math.round(((fileIdx + (r / jsonData.length)) / totalFiles) * 88)),
              stage: 'processing'
            });
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (err: any) {
      console.error(`Error reading file ${file.name}:`, err);
      warnings.push(`File "${file.name}" encountered an error: ${err.message || 'Failed to parse'}`);
    }
  }

  // Flush any remaining rows to workbook and CSV
  if (currentSheetRows.length > 0) {
    flushCurrentSheet();
  } else if (workbook.SheetNames.length === 0) {
    const emptyWs = (XLSX.utils.aoa_to_sheet as any)([["File Name", "No Data Found"]], { dense: true });
    XLSX.utils.book_append_sheet(workbook, emptyWs, 'Off Consolidated');
  }
  flushCsvLines();

  if (signal?.aborted) {
    throw new Error("Consolidation was cancelled by the user.");
  }

  // Final generation stage
  if (onProgress) {
    onProgress({
      currentFile: totalFiles,
      totalFiles,
      fileName: 'Packaging final reports...',
      totalRows: totalRowCount,
      percent: 92,
      stage: 'generating'
    });
  }

  // Build the CSV Blob (instant, memory-light, and handles millions of rows)
  const csvBlob = new Blob(csvChunks, { type: 'text/csv;charset=utf-8;' });

  // Yield to allow UI update before binary packaging
  await new Promise(resolve => setTimeout(resolve, 20));

  let outData: Uint8Array | null = null;
  let isCsvOnly = false;

  try {
    // Generate output XLSX buffer using compression: false
    // Note: compression: false writes directly in STORE mode, avoiding SheetJS's internal
    // pure-JS deflate realloc buffer doubling that causes "Invalid array length".
    const outBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
      compression: false,
      bookSST: false
    });
    outData = new Uint8Array(outBuffer);
  } catch (err: any) {
    console.warn("XLSX packaging hit browser memory ceiling; CSV fallback is ready:", err);
    warnings.push(
      "The dataset was exceptionally large. While XLSX binary generation hit browser memory limits, your complete consolidated dataset is safely preserved and available via the CSV download button."
    );
    isCsvOnly = true;
  }

  if (onProgress) {
    onProgress({
      currentFile: totalFiles,
      totalFiles,
      fileName: 'Complete',
      totalRows: totalRowCount,
      percent: 100,
      stage: 'done'
    });
  }

  return {
    data: outData,
    csvBlob,
    fileCount: files.length,
    rowCount: totalRowCount,
    previewRows,
    warnings: warnings.length > 0 ? warnings : undefined,
    isCsvOnly
  };
};
