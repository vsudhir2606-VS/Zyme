import * as XLSX from 'xlsx';
import './cptableSetup.ts';

export interface E4hProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'processing' | 'generating' | 'done';
}

export interface E4hExtractedRow {
  customerName: string;
  rpl: string;
  sourceRowNumber: number; // 1-indexed row number in source sheet
  customerRowNumber: number; // 1-indexed row number where customer was found
  fileName?: string;
  sourceRowData?: any[];
}

export interface E4hCustomerSummary {
  customerName: string;
  rplCount: number;
  firstRowNumber: number;
  rpls: string[];
}

export interface E4hExtractionResult {
  records: E4hExtractedRow[];
  customerSummaries: E4hCustomerSummary[];
  totalRecords: number;
  totalCustomers: number;
  previewRows: any[][];
  headers: string[];
  xlsxData: Uint8Array | null;
  csvBlob: Blob;
  fileName: string;
  warnings: string[];
}

export interface E4hExtractionOptions {
  rplColumn?: string | number; // default 'H' (7)
  customerColumn?: string | number; // default 'J' (9)
  outputFormat?: 'two_column' | 'all_columns';
  includeFileName?: boolean;
  includeRowNumber?: boolean;
  skipHeaderKeywords?: boolean;
  targetSheetName?: string;
  onProgress?: (progress: E4hProgressUpdate) => void;
  signal?: AbortSignal;
}

/**
 * Converts column letter (e.g. 'A', 'H', 'J', 'AA') to 0-indexed column number.
 */
export const colLetterToIndex = (col: string | number): number => {
  if (typeof col === 'number') return col;
  const str = String(col).trim().toUpperCase();
  if (/^\d+$/.test(str)) {
    return Math.max(0, parseInt(str, 10) - 1);
  }
  let index = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      index = index * 26 + (code - 64);
    }
  }
  return Math.max(0, index - 1);
};

export const indexToColLetter = (index: number): string => {
  let col = '';
  let temp = index + 1;
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    temp = Math.floor((temp - 1) / 26);
  }
  return col || 'A';
};

const clampCell = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (val instanceof Date) {
    return val.toLocaleDateString();
  }
  if (typeof val === 'object') {
    return String(val.v ?? val.text ?? val.w ?? '').trim();
  }
  return String(val).trim();
};

/**
 * Escapes a cell value for RFC-4180 CSV
 */
const escapeCsvCell = (val: any): string => {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

/**
 * Checks if a row is completely blank (all cells empty)
 */
const isRowCompletelyBlank = (row: any[]): boolean => {
  if (!row || !Array.isArray(row) || row.length === 0) return true;
  return row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
};

/**
 * Checks if a string looks like a header label rather than data
 */
const isHeaderLabel = (val: string): boolean => {
  const norm = val.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['rpl', 'rplnumber', 'rplscreening', 'customer', 'customername', 'bpname', 'partnername'].includes(norm);
};

/**
 * Processes a single file (or multiple files) according to the E4H specification:
 * - Column H is RPL
 * - Row above the data of Column H contains Customer Name in Column J
 * - Multiple rows of Column H until a blank row belong to that same customer name
 */
export const processE4hFile = async (
  file: File,
  options?: E4hExtractionOptions
): Promise<E4hExtractionResult> => {
  const {
    rplColumn = 'H',
    customerColumn = 'J',
    outputFormat = 'all_columns',
    includeFileName = false,
    includeRowNumber = true,
    skipHeaderKeywords = true,
    targetSheetName,
    onProgress,
    signal
  } = options || {};

  const colH = colLetterToIndex(rplColumn); // 7 for 'H'
  const colJ = colLetterToIndex(customerColumn); // 9 for 'J'

  if (onProgress) {
    onProgress({
      currentFile: 1,
      totalFiles: 1,
      fileName: file.name,
      totalRows: 0,
      percent: 15,
      stage: 'reading'
    });
  }

  // Read file buffer
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) {
    throw new Error('E4H Processing cancelled by user.');
  }

  // Parse with SheetJS dense mode
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    raw: false,
    dense: true
  });

  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('No worksheets found in uploaded file.');
  }

  // Select target sheet
  const activeSheetName = (targetSheetName && sheetNames.includes(targetSheetName))
    ? targetSheetName
    : sheetNames[0];

  const worksheet = workbook.Sheets[activeSheetName];
  if (!worksheet) {
    throw new Error(`Worksheet "${activeSheetName}" could not be read.`);
  }

  // Convert to 2D array
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: true,
    raw: false
  });

  if (onProgress) {
    onProgress({
      currentFile: 1,
      totalFiles: 1,
      fileName: file.name,
      totalRows: rawRows.length,
      percent: 40,
      stage: 'processing'
    });
  }

  const records: E4hExtractedRow[] = [];
  const warnings: string[] = [];

  // Identify original column headers if present (usually row 0 or 1)
  let originalHeaders: string[] = [];
  let headerRowIdx = -1;

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;
    const hVal = clampCell(row[colH]);
    const jVal = clampCell(row[colJ]);
    if (isHeaderLabel(hVal) || isHeaderLabel(jVal)) {
      headerRowIdx = r;
      originalHeaders = row.map((cell, idx) => {
        const val = clampCell(cell);
        return val ? val : `Col ${indexToColLetter(idx)}`;
      });
      break;
    }
  }

  // If no explicit header detected, generate default letters
  if (originalHeaders.length === 0 && rawRows.length > 0) {
    let maxCols = 0;
    for (let r = 0; r < Math.min(30, rawRows.length); r++) {
      if (rawRows[r]) maxCols = Math.max(maxCols, rawRows[r].length);
    }
    maxCols = Math.max(maxCols, Math.max(colH, colJ) + 1);
    originalHeaders = Array.from({ length: maxCols }, (_, i) => `Col ${indexToColLetter(i)}`);
    if (colH < originalHeaders.length) originalHeaders[colH] = 'RPL (Col H)';
    if (colJ < originalHeaders.length) originalHeaders[colJ] = 'Customer (Col J)';
  }

  // Core E4H Extraction Logic:
  // - Row above the data of column H will have customer name in column J which is customer
  // - Data in column H is RPL
  // - If multiple data in column H until blank row, all belong to that same customer name
  let currentCustomer: string | null = null;
  let currentCustomerRowNumber: number = 0;

  for (let r = 0; r < rawRows.length; r++) {
    // Check cancellation
    if (r % 1000 === 0 && signal?.aborted) {
      throw new Error('E4H Processing cancelled by user.');
    }

    const row = rawRows[r];
    const isBlank = isRowCompletelyBlank(row);
    const rowNum = r + 1; // 1-indexed for user display

    // If completely blank row, reset the active customer group
    if (isBlank) {
      currentCustomer = null;
      currentCustomerRowNumber = 0;
      continue;
    }

    const rplVal = row ? clampCell(row[colH]) : '';
    const custVal = row ? clampCell(row[colJ]) : '';

    // Check if this row is a header row that should be skipped
    if (skipHeaderKeywords && r === headerRowIdx) {
      continue;
    }

    // Check if row above had a customer in Column J:
    // If current row has RPL, or if current row has empty RPL but has a Customer in Col J:
    if (!rplVal) {
      // Column H is blank.
      // If this row has a Customer Name in Column J, this is the customer header row for subsequent RPL rows!
      if (custVal && (!skipHeaderKeywords || !isHeaderLabel(custVal))) {
        currentCustomer = custVal;
        currentCustomerRowNumber = rowNum;
      } else {
        // If both Col H is blank and Col J doesn't have a new customer, this acts as a boundary / blank row
        currentCustomer = null;
        currentCustomerRowNumber = 0;
      }
      continue;
    }

    // If we reach here, rplVal is NOT empty (Column H has data)
    // Check if we already have a currentCustomer, or if row r-1 had Customer in Column J:
    if (!currentCustomer) {
      // Look at row immediately above (r - 1)
      if (r > 0 && rawRows[r - 1]) {
        const prevRowCust = clampCell(rawRows[r - 1][colJ]);
        if (prevRowCust && (!skipHeaderKeywords || !isHeaderLabel(prevRowCust))) {
          currentCustomer = prevRowCust;
          currentCustomerRowNumber = r; // Row number of r-1 is r
        }
      }

      // If still not found, check if row r itself has Customer in Col J
      if (!currentCustomer && custVal && (!skipHeaderKeywords || !isHeaderLabel(custVal))) {
        currentCustomer = custVal;
        currentCustomerRowNumber = rowNum;
      }
    }

    // Skip if this row looks like a header (e.g. RPL in Col H and Customer in Col J)
    if (skipHeaderKeywords && (isHeaderLabel(rplVal) || isHeaderLabel(custVal))) {
      continue;
    }

    const assignedCustomer = currentCustomer || 'Unknown Customer';

    records.push({
      customerName: assignedCustomer,
      rpl: rplVal,
      sourceRowNumber: rowNum,
      customerRowNumber: currentCustomerRowNumber || (rowNum - 1),
      fileName: file.name,
      sourceRowData: row ? [...row] : []
    });
  }

  if (records.length === 0) {
    warnings.push(`No RPL records found in Column ${indexToColLetter(colH)}.`);
  }

  // Aggregate customer summaries
  const customerMap = new Map<string, { rplCount: number; firstRowNumber: number; rpls: string[] }>();
  for (const rec of records) {
    const existing = customerMap.get(rec.customerName);
    if (!existing) {
      customerMap.set(rec.customerName, {
        rplCount: 1,
        firstRowNumber: rec.customerRowNumber || rec.sourceRowNumber,
        rpls: [rec.rpl]
      });
    } else {
      existing.rplCount++;
      existing.rpls.push(rec.rpl);
    }
  }

  const customerSummaries: E4hCustomerSummary[] = Array.from(customerMap.entries()).map(([name, data]) => ({
    customerName: name,
    rplCount: data.rplCount,
    firstRowNumber: data.firstRowNumber,
    rpls: data.rpls
  }));

  // Build output headers and table rows
  let outputHeaders: string[] = [];
  if (includeFileName) outputHeaders.push('File Name');
  if (includeRowNumber) outputHeaders.push('Source Row #');
  outputHeaders.push('Customer Name', 'RPL');

  if (outputFormat === 'all_columns') {
    // Append all other source headers (skipping RPL and Customer if already placed first)
    for (let c = 0; c < originalHeaders.length; c++) {
      if (c !== colH && c !== colJ) {
        outputHeaders.push(originalHeaders[c] || `Col ${indexToColLetter(c)}`);
      }
    }
  }

  // Build 2D array for preview and export
  const exportRows: any[][] = [];
  exportRows.push(outputHeaders);

  for (const rec of records) {
    const row: any[] = [];
    if (includeFileName) row.push(rec.fileName || file.name);
    if (includeRowNumber) row.push(rec.sourceRowNumber);
    row.push(rec.customerName);
    row.push(rec.rpl);

    if (outputFormat === 'all_columns' && rec.sourceRowData) {
      for (let c = 0; c < originalHeaders.length; c++) {
        if (c !== colH && c !== colJ) {
          row.push(clampCell(rec.sourceRowData[c]));
        }
      }
    }
    exportRows.push(row);
  }

  if (onProgress) {
    onProgress({
      currentFile: 1,
      totalFiles: 1,
      fileName: file.name,
      totalRows: records.length,
      percent: 85,
      stage: 'generating'
    });
  }

  // Generate Excel workbook (.xlsx)
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(exportRows);

  // Set column widths
  const colWidths = outputHeaders.map((header, idx) => {
    let maxLen = header.length;
    for (let i = 1; i < Math.min(100, exportRows.length); i++) {
      const cell = exportRows[i]?.[idx];
      if (cell) maxLen = Math.max(maxLen, String(cell).length);
    }
    return { wch: Math.min(45, Math.max(12, maxLen + 3)) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'E4H Consolidated');

  // Customer Summary Sheet
  const summaryHeaders = ['Customer Name', 'Total RPL Records', 'Customer Row #', 'Sample RPLs'];
  const summaryRows: any[][] = [summaryHeaders];
  for (const s of customerSummaries) {
    summaryRows.push([
      s.customerName,
      s.rplCount,
      s.firstRowNumber,
      s.rpls.slice(0, 5).join(', ') + (s.rpls.length > 5 ? ` (+${s.rpls.length - 5} more)` : '')
    ]);
  }
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 16 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Customer Summary');

  const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Generate CSV Blob
  const csvContent = exportRows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
  const csvBlob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], {
    type: 'text/csv;charset=utf-8;'
  });

  if (onProgress) {
    onProgress({
      currentFile: 1,
      totalFiles: 1,
      fileName: file.name,
      totalRows: records.length,
      percent: 100,
      stage: 'done'
    });
  }

  return {
    records,
    customerSummaries,
    totalRecords: records.length,
    totalCustomers: customerSummaries.length,
    previewRows: exportRows,
    headers: outputHeaders,
    xlsxData: new Uint8Array(xlsxData),
    csvBlob,
    fileName: file.name.replace(/\.[^/.]+$/, '') + '_E4H_RPL_Correlated.xlsx',
    warnings
  };
};
