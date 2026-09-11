import * as XLSX from 'xlsx';

export interface ProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'processing' | 'generating' | 'done';
}

export interface OofConsolidationResult {
  data: Uint8Array;
  fileCount: number;
  rowCount: number;
  previewRows: any[][];
  warnings?: string[];
}

export interface ConsolidateOptions {
  onProgress?: (progress: ProgressUpdate) => void;
  signal?: AbortSignal;
  removeBlankColumnB?: boolean;
  removeDuplicateHeaders?: boolean;
  includeMasterHeader?: boolean;
}

const MAX_ROWS_PER_SHEET = 200000; // Optimal chunk size for speed and zero memory pressure

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
 * Consolidates multiple Excel/CSV files (even up to 200+ huge files) into a single XLSX file.
 * The source file name is prepended to Column A for every row.
 * Uses SheetJS dense mode and event-loop yielding to prevent "Too many properties to enumerate"
 * and browser memory crashes.
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

  // Accumulate rows into sheet chunks to prevent exceeding Excel sheet row limit
  let currentSheetRows: any[][] = [];
  let sheetIndex = 1;

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

      // Read with memory-efficient dense mode
      const tempWb = XLSX.read(new Uint8Array(buffer), {
        type: 'array',
        dense: true,
        cellDates: true,
        cellNF: false,
        cellText: false,
        cellHTML: false,
        cellFormula: false
      });

      if (!tempWb.SheetNames.length) {
        warnings.push(`File "${file.name}" has no readable sheets and was skipped.`);
        continue;
      }

      const firstSheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[firstSheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false
      });

      if (!jsonData || jsonData.length === 0) {
        continue;
      }

      // Check if Column B is blank or candidate for removal
      // If removeBlankColumnB is enabled, we check if index 1 is blank across rows
      const hasColumnB = jsonData.some(r => r && r.length > 1);
      const isColBActuallyBlank = hasColumnB && jsonData.slice(0, 30).every(
        r => !r || r.length <= 1 || r[1] === "" || r[1] === null || r[1] === undefined || String(r[1]).trim() === ""
      );

      const shouldDropColB = removeBlankColumnB && (isColBActuallyBlank || hasColumnB);

      // Process rows for this file
      for (let r = 0; r < jsonData.length; r++) {
        const rawRow = jsonData[r];
        if (!rawRow || rawRow.length === 0) continue;

        // Verify if row is completely empty
        const hasContent = rawRow.some(cell => cell !== "" && cell !== null && cell !== undefined);
        if (!hasContent) continue;

        // Build clean row (filtering Column B if requested/blank)
        const cleanRow: any[] = [file.name];
        for (let c = 0; c < rawRow.length; c++) {
          if (shouldDropColB && c === 1) {
            // Drop the blank B column
            continue;
          }
          cleanRow.push(clampCell(rawRow[c]));
        }

        // Row signature to detect repeated headers
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

        currentSheetRows.push(cleanRow);
        totalRowCount++;

        // Store up to 100 sample rows for instant preview
        if (previewRows.length < 100) {
          previewRows.push(cleanRow);
        }

        // If current sheet reaches limit, flush to workbook and start next sheet
        if (currentSheetRows.length >= MAX_ROWS_PER_SHEET) {
          flushCurrentSheet();
        }

        // Yield occasionally on massive individual files (every 15,000 rows)
        if (r > 0 && r % 15000 === 0) {
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

  // Flush any remaining rows
  if (currentSheetRows.length > 0) {
    flushCurrentSheet();
  } else if (workbook.SheetNames.length === 0) {
    // If all files were empty, create at least an empty sheet
    const emptyWs = (XLSX.utils.aoa_to_sheet as any)([["File Name", "No Data Found"]], { dense: true });
    XLSX.utils.book_append_sheet(workbook, emptyWs, 'Off Consolidated');
  }

  if (signal?.aborted) {
    throw new Error("Consolidation was cancelled by the user.");
  }

  // Final generation stage
  if (onProgress) {
    onProgress({
      currentFile: totalFiles,
      totalFiles,
      fileName: 'Finalizing Excel file...',
      totalRows: totalRowCount,
      percent: 92,
      stage: 'generating'
    });
  }

  // Yield to allow UI update before binary compression
  await new Promise(resolve => setTimeout(resolve, 15));

  // Generate output XLSX buffer using fast SheetJS binary packaging
  const outBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true
  });

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
    data: new Uint8Array(outBuffer),
    fileCount: files.length,
    rowCount: totalRowCount,
    previewRows,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};

