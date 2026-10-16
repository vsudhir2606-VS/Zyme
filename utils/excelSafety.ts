import * as XLSX from 'xlsx';

/**
 * Safely clamps a worksheet's !ref to the actual occupied bounding box of cells.
 * Fixes "RangeError: Invalid array length" or out-of-memory errors caused by Excel files where
 * full columns (up to row 1,048,576 or col 16,384) have formatting applied without data.
 */
export const clampWorksheetRange = (
  ws: XLSX.WorkSheet | undefined,
  maxCols = 200,
  maxRows = 150000
): void => {
  if (!ws || !ws['!ref']) return;
  try {
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // If range is already modest (< 20,000 rows and < 80 cols), skip scanning for speed
    if (range.e.r < 20000 && range.e.c < 80) {
      return;
    }

    let minR = range.s.r;
    let minC = range.s.c;
    let maxR = 0;
    let maxC = 0;
    let hasCells = false;

    // Scan actual cell addresses present in the worksheet object
    const keys = Object.keys(ws);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.charCodeAt(0) === 33) continue; // skip keys starting with '!' (!ref, !cols, !merges)
      
      const val = ws[key];
      if (val && val.v !== undefined && val.v !== null && String(val.v).trim() !== '') {
        const cell = XLSX.utils.decode_cell(key);
        if (!hasCells) {
          minR = cell.r;
          minC = cell.c;
          maxR = cell.r;
          maxC = cell.c;
          hasCells = true;
        } else {
          if (cell.r < minR) minR = cell.r;
          if (cell.c < minC) minC = cell.c;
          if (cell.r > maxR) maxR = cell.r;
          if (cell.c > maxC) maxC = cell.c;
        }
      }
    }

    if (hasCells) {
      range.s.r = Math.max(0, minR);
      range.s.c = Math.max(0, minC);
      range.e.r = Math.min(maxR, maxRows);
      range.e.c = Math.min(maxC, maxCols);
    } else {
      // Empty sheet with bloated range
      range.s.r = 0;
      range.s.c = 0;
      range.e.r = 0;
      range.e.c = 0;
    }

    ws['!ref'] = XLSX.utils.encode_range(range);
  } catch (err) {
    console.warn('Notice in clampWorksheetRange:', err);
  }
};

/**
 * Safely parses worksheet rows into an array of arrays with bounded memory usage.
 */
export const safeSheetToAoA = (
  ws: XLSX.WorkSheet | undefined,
  opts?: { defval?: string; blankrows?: boolean; maxRows?: number }
): any[][] => {
  if (!ws) return [];
  clampWorksheetRange(ws);

  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: opts?.defval ?? '',
    blankrows: opts?.blankrows ?? false,
  });

  if (!rawRows || !Array.isArray(rawRows)) return [];

  // Filter out any lingering phantom rows that contain only empty strings/nulls
  const validRows: any[][] = [];
  const limit = opts?.maxRows ? Math.min(rawRows.length, opts.maxRows) : rawRows.length;

  for (let i = 0; i < limit; i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row)) continue;
    
    // Check if row has at least one non-empty value
    let hasValue = false;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        hasValue = true;
        break;
      }
    }

    if (hasValue) {
      validRows.push(row);
    }
  }

  return validRows;
};

/**
 * Lightweight AoA to CSV generator that bypasses SheetJS cell tree allocations.
 */
export const safeAoaToCsv = (rows: any[][], maxRows = 60000): string => {
  if (!rows || rows.length === 0) return '';
  const slice = rows.length > maxRows ? rows.slice(0, maxRows) : rows;

  return slice.map(row => {
    if (!row || !Array.isArray(row)) return '';
    return row.map(cell => {
      if (cell === null || cell === undefined) return '';
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  }).join('\r\n');
};

/**
 * Safely writes an XLSX workbook to a Uint8Array, with fallbacks to avoid RangeError: Invalid array length.
 */
export const safeWriteXlsx = (
  wb: XLSX.WorkBook,
  preferredType: 'xlsx' = 'xlsx'
): Uint8Array => {
  // Attempt 1: Standard compressed write
  try {
    const buf = XLSX.write(wb, { bookType: preferredType, type: 'array', compression: true });
    return new Uint8Array(buf);
  } catch (err1) {
    console.warn('safeWriteXlsx: compressed write failed, trying uncompressed write:', err1);
  }

  // Attempt 2: Uncompressed write (lower CPU/temp buffer overhead)
  try {
    const buf = XLSX.write(wb, { bookType: preferredType, type: 'array', compression: false });
    return new Uint8Array(buf);
  } catch (err2) {
    console.warn('safeWriteXlsx: uncompressed write failed, trying single-sheet fallback:', err2);
  }

  // Attempt 3: If multi-sheet workbook exceeded V8 buffer limits, write just the primary sheet
  try {
    const firstSheetName = wb.SheetNames[0] || 'Sheet1';
    const singleWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(singleWb, wb.Sheets[firstSheetName], firstSheetName);
    const buf = XLSX.write(singleWb, { bookType: preferredType, type: 'array', compression: false });
    return new Uint8Array(buf);
  } catch (err3: any) {
    console.error('safeWriteXlsx fatal write error:', err3);
    throw new Error(err3?.message || 'Failed to serialize Excel workbook due to memory constraints.');
  }
};
