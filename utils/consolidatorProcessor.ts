import * as XLSX from 'xlsx';
import './cptableSetup.ts';
import { clampWorksheetRange, safeWriteXlsx } from './excelSafety.ts';

export type DateFilterMode = 'today' | 'single' | 'range';

export interface ConsolidatorProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'filtering' | 'deduplicating' | 'generating' | 'done';
}

export interface FileContribution {
  fileName: string;
  rawRowCount: number;
  afterUserStatusCount: number;
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
  rawRowCount: number;
  afterUserStatusCount: number;
  removedBlankUserStatusCount: number;
  afterDeduplicationCount: number;
  removedDuplicatesCount: number;
  rowCount: number;
  removedOutsideDateCount: number;
  columnCount: number;
  headers: string[];
  headerSourceFileName: string;
  userStatusColumnName: string;
  releaseDateColumnName: string;
  dateFilterDescription: string;
  detectedDates: string[];
  previewRows: any[][];
  fileContributions: FileContribution[];
  warnings?: string[];
}

export interface ConsolidatorOptions {
  dateFilterMode?: DateFilterMode;
  selectedDate?: string; // YYYY-MM-DD
  startDate?: string;    // YYYY-MM-DD
  endDate?: string;      // YYYY-MM-DD
  onProgress?: (progress: ConsolidatorProgressUpdate) => void;
  signal?: AbortSignal;
}

interface ExcelCellValue {
  t: 'n';
  v: number;
  z?: string;
  w?: string;
}

const isExcelDateCellObj = (val: any): val is ExcelCellValue => {
  return Boolean(val && typeof val === 'object' && !(val instanceof Date) && val.t === 'n' && typeof val.v === 'number');
};

/**
 * Returns local calendar date formatted as YYYY-MM-DD.
 */
export const getLocalTodayYmd = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const formatYmd = (y: number, m: number, d: number): string | null => {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
};

const expandTwoDigitYear = (yy: number): number => {
  return yy >= 70 ? 1900 + yy : 2000 + yy;
};

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Detects whether slash-delimited dates in a column lean DMY vs MDY
 * by checking unambiguous rows (where one component > 12) or format string.
 */
const inferSlashDateOrder = (samples: any[]): 'MDY' | 'DMY' => {
  for (const val of samples) {
    if (isExcelDateCellObj(val) && val.z) {
      const zLower = val.z.toLowerCase();
      const dPos = zLower.indexOf('d');
      const mPos = zLower.indexOf('m');
      if (dPos !== -1 && mPos !== -1) {
        return dPos < mPos ? 'DMY' : 'MDY';
      }
    }
    const str = formatCellDisplay(val).trim();
    if (!str) continue;
    const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s|T|$)/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      if (p1 > 12 && p2 <= 12) return 'DMY';
      if (p2 > 12 && p1 <= 12) return 'MDY';
    }
  }
  return 'MDY';
};

/**
 * Parses an Excel cell (serial number, cell object, Date, or formatted string) into YYYY-MM-DD.
 * Uses XLSX.SSF.parse_date_code for Excel serials to guarantee 100% timezone immunity
 * (avoiding SheetJS cellDates:true historical LMT offset bugs in IST and other timezones).
 */
export const parseCellToYmd = (val: any, slashOrder: 'MDY' | 'DMY' = 'MDY'): string | null => {
  if (val === undefined || val === null || val === '') return null;

  // 1. Excel cell object with serial number
  if (isExcelDateCellObj(val)) {
    const parsed = XLSX.SSF.parse_date_code(val.v);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return formatYmd(parsed.y, parsed.m, parsed.d);
    }
    if (val.w) {
      return parseCellToYmd(val.w, slashOrder);
    }
    return null;
  }

  // 2. Native JS Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatYmd(val.getFullYear(), val.getMonth() + 1, val.getDate());
  }

  // 3. Raw Excel serial number (e.g. 46342 or 46342.5) vs numeric YYYYMMDD (e.g. 20261116)
  if (typeof val === 'number' && Number.isFinite(val)) {
    if (val >= 19000101 && val <= 21991231 && Number.isInteger(val)) {
      const s = String(val);
      return formatYmd(
        parseInt(s.slice(0, 4), 10),
        parseInt(s.slice(4, 6), 10),
        parseInt(s.slice(6, 8), 10)
      );
    }
    if (val >= 1 && val < 2958466) {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return formatYmd(parsed.y, parsed.m, parsed.d);
      }
    }
    return null;
  }

  // 4. String formats
  const str = String(val).trim();
  if (!str) return null;

  // Numeric string Excel serial (e.g. "46342") or YYYYMMDD ("20261116")
  if (/^\d{8}$/.test(str)) {
    const y = parseInt(str.slice(0, 4), 10);
    const m = parseInt(str.slice(4, 6), 10);
    const d = parseInt(str.slice(6, 8), 10);
    const ymd = formatYmd(y, m, d);
    if (ymd) return ymd;
  }
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num >= 20000 && num < 100000) {
      const parsed = XLSX.SSF.parse_date_code(num);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return formatYmd(parsed.y, parsed.m, parsed.d);
      }
    }
  }

  // ISO-like YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD (with optional time)
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT]|$)/);
  if (isoMatch) {
    return formatYmd(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10),
      parseInt(isoMatch[3], 10)
    );
  }

  // Dot-delimited DD.MM.YYYY or DD.MM.YY (SAP standard format)
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s|T|$)/);
  if (dotMatch) {
    const d = parseInt(dotMatch[1], 10);
    const m = parseInt(dotMatch[2], 10);
    const rawY = parseInt(dotMatch[3], 10);
    const y = dotMatch[3].length === 2 ? expandTwoDigitYear(rawY) : rawY;
    return formatYmd(y, m, d) || formatYmd(y, d, m);
  }

  // Named month: DD-MMM-YYYY or DD MMM YYYY (e.g., 16-Nov-2026)
  const dMonY = str.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]+(\d{2,4})(?:\s|$)/);
  if (dMonY) {
    const d = parseInt(dMonY[1], 10);
    const m = MONTH_MAP[dMonY[2].toLowerCase()];
    const rawY = parseInt(dMonY[3], 10);
    const y = dMonY[3].length === 2 ? expandTwoDigitYear(rawY) : rawY;
    if (m) return formatYmd(y, m, d);
  }

  // Named month: MMM DD, YYYY (e.g., Nov 16, 2026)
  const monDY = str.match(/^([A-Za-z]{3,9})[-\s/]+(\d{1,2})[,\s-]+(\d{2,4})(?:\s|$)/);
  if (monDY) {
    const m = MONTH_MAP[monDY[1].toLowerCase()];
    const d = parseInt(monDY[2], 10);
    const rawY = parseInt(monDY[3], 10);
    const y = monDY[3].length === 2 ? expandTwoDigitYear(rawY) : rawY;
    if (m) return formatYmd(y, m, d);
  }

  // Slash or hyphen: MM/DD/YYYY vs DD/MM/YYYY
  const sepMatch = str.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s|T|$)/);
  if (sepMatch) {
    const p1 = parseInt(sepMatch[1], 10);
    const sep = sepMatch[2];
    const p2 = parseInt(sepMatch[3], 10);
    const rawY = parseInt(sepMatch[4], 10);
    const y = sepMatch[4].length === 2 ? expandTwoDigitYear(rawY) : rawY;

    if (p1 > 12) return formatYmd(y, p2, p1);
    if (p2 > 12) return formatYmd(y, p1, p2);

    // Ambiguous (both <= 12): respect inferred column order, or default DMY for '-' / MDY for '/'
    const order = slashOrder === 'DMY' || sep === '-' ? 'DMY' : 'MDY';
    return order === 'DMY'
      ? (formatYmd(y, p2, p1) || formatYmd(y, p1, p2))
      : (formatYmd(y, p1, p2) || formatYmd(y, p2, p1));
  }

  // Last-resort Date.parse fallback for other localized date strings
  const nativeParsed = new Date(str);
  if (!isNaN(nativeParsed.getTime())) {
    return formatYmd(nativeParsed.getFullYear(), nativeParsed.getMonth() + 1, nativeParsed.getDate());
  }

  return null;
};

/**
 * Formats any cell value (primitive, Date, or ExcelCellValue) into a clean display string
 * for preview, CSV export, and key comparisons.
 */
const formatCellDisplay = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (isExcelDateCellObj(val)) {
    if (val.w && String(val.w).trim() !== '') return String(val.w);
    if (val.z) {
      try {
        return XLSX.SSF.format(val.z, val.v);
      } catch {
        // fallback below
      }
    }
    const parsed = XLSX.SSF.parse_date_code(val.v);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
    return String(val.v);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatYmd(val.getFullYear(), val.getMonth() + 1, val.getDate()) || val.toISOString().split('T')[0];
  }
  return String(val);
};

const clampExcelCell = (val: any): any => {
  if (val === undefined || val === null) return '';
  if (isExcelDateCellObj(val)) {
    return { t: 'n', v: val.v, z: val.z || 'yyyy-mm-dd' };
  }
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    return String(val.v ?? val.text ?? val.w ?? '');
  }
  if (typeof val === 'string' && val.length > 32750) {
    return val.slice(0, 32750) + '... [truncated]';
  }
  return val;
};

const escapeCsvCell = (val: any): string => {
  const str = formatCellDisplay(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

const normHeader = (h: any): string => {
  return String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Extracts rows from a SheetJS worksheet while preserving date cell metadata ({t:'n', v, z, w})
 * and ignoring timezone-sensitive cellDates conversions.
 */
const extractRowsPreservingFormats = (worksheet: XLSX.WorkSheet): any[][] => {
  clampWorksheetRange(worksheet);
  const ref = worksheet['!ref'];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const rows: any[][] = [];
  // Always anchor columns at Excel Column A (index 0) so Col A, B, C, Y (24), Z (25) never shift
  const maxColIndex = Math.min(199, range.e.c);
  const totalCols = maxColIndex + 1;
  const denseData = (worksheet as any)['!data'];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: any[] = new Array(totalCols).fill('');
    let hasValue = false;

    for (let c = 0; c <= maxColIndex; c++) {
      const cell = denseData
        ? denseData[r]?.[c]
        : worksheet[XLSX.utils.encode_cell({ r, c })];

      if (!cell || cell.v === undefined || cell.v === null) continue;

      if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && XLSX.SSF.is_date(cell.z)) {
        row[c] = {
          t: 'n',
          v: cell.v,
          z: cell.z,
          w: cell.w,
        } as ExcelCellValue;
        hasValue = true;
      } else {
        const v = cell.v;
        if (String(v).trim() !== '') {
          hasValue = true;
        }
        row[c] = clampExcelCell(v);
      }
    }

    if (hasValue) {
      rows.push(row);
    }
  }

  return rows;
};

/**
 * Resolves Column Z (USERSTATUS, 0-index 25) and Column Y (Releasedate, 0-index 24).
 */
const resolveRequiredColumns = (
  headers: string[]
): { userStatusIdx: number; releaseDateIdx: number } => {
  const normHeaders = headers.map(normHeader);

  // USERSTATUS (Column Z = index 25)
  let userStatusIdx = -1;
  if (normHeaders.length > 25 && (normHeaders[25] === 'userstatus' || normHeaders[25].includes('userstatus'))) {
    userStatusIdx = 25;
  } else {
    const byName = normHeaders.findIndex(h => h === 'userstatus' || h === 'usrstatus');
    if (byName !== -1) {
      userStatusIdx = byName;
    } else if (normHeaders.length > 25) {
      userStatusIdx = 25;
    }
  }

  // Releasedate (Column Y = index 24)
  let releaseDateIdx = -1;
  if (normHeaders.length > 24 && (normHeaders[24] === 'releasedate' || normHeaders[24].includes('releasedate'))) {
    releaseDateIdx = 24;
  } else {
    const byName = normHeaders.findIndex(h => h === 'releasedate' || h === 'reldate');
    if (byName !== -1) {
      releaseDateIdx = byName;
    } else if (normHeaders.length > 24) {
      releaseDateIdx = 24;
    }
  }

  return { userStatusIdx, releaseDateIdx };
};

/**
 * Zyme Consolidator Engine (New Pipeline):
 * 1. Consolidates all uploaded files using File 1's header (strict validation: popup error if any file fails).
 * 2. Step 1: Filter USERSTATUS (Column Z) -> Remove blank rows & keep non-blank rows.
 * 3. Step 2: Deduplicate -> Remove duplicates across Columns A, B, and C.
 * 4. Step 3: Filter Releasedate (Column Y) -> Match Today (default), Single Date, or From–To Date Range.
 */
export const consolidateFiles = async (
  files: File[],
  options?: ConsolidatorOptions
): Promise<ConsolidationResult> => {
  if (!files || files.length === 0) {
    throw new Error('No files selected for consolidation.');
  }

  const {
    dateFilterMode = 'today',
    selectedDate,
    startDate,
    endDate,
    onProgress,
    signal,
  } = options || {};

  // Validate date parameters upfront
  const todayYmd = getLocalTodayYmd();
  let filterStartYmd = todayYmd;
  let filterEndYmd = todayYmd;
  let dateFilterDescription = `Today (${todayYmd})`;

  if (dateFilterMode === 'single') {
    if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      throw new ConsolidationError('Please select a valid target date for Releasedate (Column Y).', [
        { fileName: 'Date Filter Configuration', fileSize: 0, reason: 'No valid single date selected.' },
      ]);
    }
    filterStartYmd = selectedDate;
    filterEndYmd = selectedDate;
    dateFilterDescription = `Selected Date (${selectedDate})`;
  } else if (dateFilterMode === 'range') {
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new ConsolidationError('Please select both From Date and To Date for the Releasedate range.', [
        { fileName: 'Date Range Configuration', fileSize: 0, reason: 'Start date or end date is missing.' },
      ]);
    }
    if (startDate > endDate) {
      throw new ConsolidationError(`Invalid date range: From Date (${startDate}) cannot be after To Date (${endDate}).`, [
        { fileName: 'Date Range Configuration', fileSize: 0, reason: `${startDate} is after ${endDate}.` },
      ]);
    }
    filterStartYmd = startDate;
    filterEndYmd = endDate;
    dateFilterDescription = `Date Range (${startDate} to ${endDate})`;
  }

  const totalFiles = files.length;
  const warnings: string[] = [];
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
      throw new Error('Consolidation was cancelled by the user.');
    }

    const file = files[fileIdx];

    if (onProgress) {
      const readPercent = Math.min(45, Math.round(((fileIdx + 1) / totalFiles) * 45));
      onProgress({
        currentFile: fileIdx + 1,
        totalFiles,
        fileName: file.name,
        totalRows: 0,
        percent: readPercent,
        stage: 'reading',
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    if (file.size === 0) {
      failedFiles.push({
        fileName: file.name,
        fileSize: file.size,
        reason: 'File is completely empty (0 bytes).',
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
          cellDates: false,
          cellNF: true,
          cellText: true,
          cellHTML: false,
          cellFormula: false,
        });
      } catch (_binErr) {
        try {
          const text = await file.text();
          tempWb = XLSX.read(text, { type: 'string', cellDates: false, cellNF: true });
        } catch (textErr: any) {
          failedFiles.push({
            fileName: file.name,
            fileSize: file.size,
            reason: `Unsupported format or corrupted spreadsheet: ${textErr?.message || 'Read error'}`,
          });
          continue;
        }
      }

      if (!tempWb || !tempWb.SheetNames || !tempWb.SheetNames.length) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: 'Workbook contains no readable sheets or tabs.',
        });
        continue;
      }

      const sheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[sheetName];
      if (!worksheet) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: `Sheet "${sheetName}" is empty or could not be loaded.`,
        });
        continue;
      }

      const nonEmptyRows = extractRowsPreservingFormats(worksheet);

      if (nonEmptyRows.length === 0) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: 'File contains 0 data rows.',
        });
        continue;
      }

      if (nonEmptyRows.length === 1) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: 'File contains only a header row with 0 data rows underneath.',
        });
        continue;
      }

      const rawHeaderRow = nonEmptyRows[0];
      const headers = rawHeaderRow.map((c, i) => {
        const val = formatCellDisplay(c).trim();
        return val ? val : `Column_${i + 1}`;
      });

      // Validate that Columns A, B, C and Column Y (Releasedate) / Column Z (USERSTATUS) exist
      if (headers.length < 3) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: `File only has ${headers.length} column(s); Columns A, B, C are required.`,
        });
        continue;
      }

      const { userStatusIdx, releaseDateIdx } = resolveRequiredColumns(headers);
      if (userStatusIdx === -1 || releaseDateIdx === -1) {
        const missingParts: string[] = [];
        if (releaseDateIdx === -1) missingParts.push('Releasedate (Column Y)');
        if (userStatusIdx === -1) missingParts.push('USERSTATUS (Column Z)');
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: `Missing required column(s): ${missingParts.join(' & ')}. Detected ${headers.length} columns.`,
        });
        continue;
      }

      parsedFiles.push({
        file,
        rows: nonEmptyRows,
        headers,
      });
    } catch (err: any) {
      console.error(`Error reading file ${file.name}:`, err);
      failedFiles.push({
        fileName: file.name,
        fileSize: file.size,
        reason: err.message || 'Failed to parse file.',
      });
    }
  }

  // Strict check: ALL files must be consolidated
  if (failedFiles.length > 0) {
    const errorMsg =
      failedFiles.length === 1
        ? `Zyme Consolidator error: "${failedFiles[0].fileName}" could not be consolidated (${failedFiles[0].reason}).`
        : `Zyme Consolidator error: ${failedFiles.length} of ${totalFiles} files failed validation.`;
    throw new ConsolidationError(errorMsg, failedFiles);
  }

  if (parsedFiles.length === 0) {
    throw new ConsolidationError('None of the selected files could be parsed or all were empty.', failedFiles);
  }

  // Phase 2: Master Header from File 1 (preserving exact A, B, C ... Y, Z column layout)
  const firstParsedFile = parsedFiles[0];
  const primaryHeaderSourceFileName = firstParsedFile.file.name;
  const masterHeaders = [...firstParsedFile.headers];
  const { userStatusIdx, releaseDateIdx } = resolveRequiredColumns(masterHeaders);

  const userStatusColumnName = masterHeaders[userStatusIdx] || 'USERSTATUS (Col Z)';
  const releaseDateColumnName = masterHeaders[releaseDateIdx] || 'Releasedate (Col Y)';

  // Phase 3: Align all files under File 1's header & apply Step 1 (Filter USERSTATUS Col Z non-blank)
  interface TaggedRow {
    fileIdx: number;
    cells: any[];
  }

  let totalRawRowCount = 0;
  let removedBlankUserStatusCount = 0;
  const afterUserStatusRows: TaggedRow[] = [];

  const fileRawCounts = new Array<number>(parsedFiles.length).fill(0);
  const fileAfterStatusCounts = new Array<number>(parsedFiles.length).fill(0);
  const fileFinalCounts = new Array<number>(parsedFiles.length).fill(0);

  for (let pIdx = 0; pIdx < parsedFiles.length; pIdx++) {
    if (signal?.aborted) {
      throw new Error('Consolidation was cancelled by the user.');
    }

    const pf = parsedFiles[pIdx];
    const { file, rows, headers } = pf;

    if (onProgress) {
      onProgress({
        currentFile: pIdx + 1,
        totalFiles: parsedFiles.length,
        fileName: `Filtering USERSTATUS in ${file.name}`,
        totalRows: totalRawRowCount,
        percent: Math.min(65, 45 + Math.round(((pIdx + 1) / parsedFiles.length) * 20)),
        stage: 'filtering',
      });
    }

    // Build non-colliding column index map from file's headers to masterHeaders
    const colIndexMap: number[] = new Array(headers.length).fill(-1);
    const usedMasterCols = new Set<number>();

    // First pass: exact header match (preserving order for repeated header names)
    headers.forEach((h, srcIdx) => {
      const normH = h.trim().toLowerCase();
      for (let mIdx = 0; mIdx < masterHeaders.length; mIdx++) {
        if (!usedMasterCols.has(mIdx) && masterHeaders[mIdx].trim().toLowerCase() === normH) {
          colIndexMap[srcIdx] = mIdx;
          usedMasterCols.add(mIdx);
          break;
        }
      }
    });

    // Second pass: positional fallback for any unmatched columns
    headers.forEach((_h, srcIdx) => {
      if (colIndexMap[srcIdx] === -1 && srcIdx < masterHeaders.length && !usedMasterCols.has(srcIdx)) {
        colIndexMap[srcIdx] = srcIdx;
        usedMasterCols.add(srcIdx);
      }
    });

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Skip repeated duplicate header rows
      const isRepeatedHeader = row.every((val, colIdx) => {
        const strVal = formatCellDisplay(val).trim();
        if (!strVal) return true;
        const selfMatch = headers[colIdx] && strVal.toLowerCase() === headers[colIdx].toLowerCase();
        const masterMatch = masterHeaders[colIdx] && strVal.toLowerCase() === masterHeaders[colIdx].toLowerCase();
        return selfMatch || masterMatch;
      });
      if (isRepeatedHeader) continue;

      // Skip pure empty rows
      const hasData = row.some((c) => c !== undefined && c !== null && formatCellDisplay(c).trim() !== '');
      if (!hasData) continue;

      const unifiedRow = new Array(masterHeaders.length).fill('');
      for (let srcColIdx = 0; srcColIdx < row.length; srcColIdx++) {
        const targetColIdx = colIndexMap[srcColIdx];
        if (targetColIdx !== undefined && targetColIdx >= 0 && targetColIdx < masterHeaders.length) {
          unifiedRow[targetColIdx] = row[srcColIdx];
        }
      }

      totalRawRowCount++;
      fileRawCounts[pIdx]++;

      // STEP 1: Filter USERSTATUS (Column Z) - remove blank & keep others
      const userStatusVal = formatCellDisplay(unifiedRow[userStatusIdx]).trim();
      if (!userStatusVal) {
        removedBlankUserStatusCount++;
        continue;
      }

      fileAfterStatusCounts[pIdx]++;
      afterUserStatusRows.push({
        fileIdx: pIdx,
        cells: unifiedRow,
      });

      if (r % 15000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  // Phase 4: STEP 2 - Remove duplicates from Column A, B, C
  if (onProgress) {
    onProgress({
      currentFile: parsedFiles.length,
      totalFiles: parsedFiles.length,
      fileName: 'Removing duplicates across Columns A, B, C...',
      totalRows: afterUserStatusRows.length,
      percent: 75,
      stage: 'deduplicating',
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  const seenABCKeys = new Set<string>();
  const afterDedupeRows: TaggedRow[] = [];
  let removedDuplicatesCount = 0;

  for (let i = 0; i < afterUserStatusRows.length; i++) {
    if (signal?.aborted) {
      throw new Error('Consolidation was cancelled by the user.');
    }

    const item = afterUserStatusRows[i];
    const colA = formatCellDisplay(item.cells[0]).trim().toLowerCase();
    const colB = formatCellDisplay(item.cells[1]).trim().toLowerCase();
    const colC = formatCellDisplay(item.cells[2]).trim().toLowerCase();

    const compositeKey = `${colA}__##__${colB}__##__${colC}`;

    if (seenABCKeys.has(compositeKey)) {
      removedDuplicatesCount++;
      continue;
    }

    seenABCKeys.add(compositeKey);
    afterDedupeRows.push(item);
  }

  // Phase 5: STEP 3 - Filter Releasedate (Column Y) against selected date / range
  if (onProgress) {
    onProgress({
      currentFile: parsedFiles.length,
      totalFiles: parsedFiles.length,
      fileName: `Filtering Releasedate (${dateFilterDescription})...`,
      totalRows: afterDedupeRows.length,
      percent: 84,
      stage: 'filtering',
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Infer slash date order (DMY vs MDY) across all Releasedate cells
  const releaseDateSamples = afterDedupeRows.slice(0, 500).map((item) => item.cells[releaseDateIdx]);
  const slashOrder = inferSlashDateOrder(releaseDateSamples);

  const detectedDatesSet = new Set<string>();
  const finalKeptRows: any[][] = [];
  let removedOutsideDateCount = 0;

  for (let i = 0; i < afterDedupeRows.length; i++) {
    const item = afterDedupeRows[i];
    const cellVal = item.cells[releaseDateIdx];
    const rowYmd = parseCellToYmd(cellVal, slashOrder);

    if (rowYmd) {
      detectedDatesSet.add(rowYmd);
    }

    if (rowYmd !== null && rowYmd >= filterStartYmd && rowYmd <= filterEndYmd) {
      // Ensure numeric date cells in Releasedate column preserve readable Excel formatting
      const normalizedCells = [...item.cells];
      const relCell = normalizedCells[releaseDateIdx];
      if (typeof relCell === 'number' && relCell >= 20000 && relCell < 100000) {
        normalizedCells[releaseDateIdx] = {
          t: 'n',
          v: relCell,
          z: 'yyyy-mm-dd',
          w: rowYmd,
        } as ExcelCellValue;
      }
      finalKeptRows.push(normalizedCells);
      fileFinalCounts[item.fileIdx]++;
    } else {
      removedOutsideDateCount++;
    }
  }

  const detectedDates = Array.from(detectedDatesSet).sort();

  if (finalKeptRows.length === 0) {
    warnings.push(
      detectedDates.length > 0
        ? `No rows matched ${dateFilterDescription}. Dates present in Releasedate (${releaseDateColumnName}): ${detectedDates.join(', ')}.`
        : `No rows matched ${dateFilterDescription} (no valid dates found in ${releaseDateColumnName} after filtering).`
    );
  }

  const fileContributions: FileContribution[] = parsedFiles.map((pf, idx) => ({
    fileName: pf.file.name,
    rawRowCount: fileRawCounts[idx],
    afterUserStatusCount: fileAfterStatusCounts[idx],
    rowCount: fileFinalCounts[idx],
    columnCount: pf.headers.length,
    fileSize: pf.file.size,
  }));

  // Phase 6: Generate consolidated Excel & CSV outputs
  if (onProgress) {
    onProgress({
      currentFile: parsedFiles.length,
      totalFiles: parsedFiles.length,
      fileName: 'Generating Excel workbook...',
      totalRows: finalKeptRows.length,
      percent: 92,
      stage: 'generating',
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 15));

  const consolidatedAoA: any[][] = [masterHeaders, ...finalKeptRows];

  // Build CSV chunks cleanly using display strings
  const csvChunks: string[] = [];
  let currentCsvLines: string[] = [masterHeaders.map(escapeCsvCell).join(',')];
  for (let i = 0; i < finalKeptRows.length; i++) {
    currentCsvLines.push(finalKeptRows[i].map(escapeCsvCell).join(','));
    if (currentCsvLines.length >= 2500) {
      csvChunks.push(currentCsvLines.join('\r\n') + '\r\n');
      currentCsvLines = [];
    }
  }
  if (currentCsvLines.length > 0) {
    csvChunks.push(currentCsvLines.join('\r\n') + '\r\n');
  }
  const csvBlob = new Blob(csvChunks, { type: 'text/csv;charset=utf-8;' });

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Consolidated Data
  const ws1 = XLSX.utils.aoa_to_sheet(consolidatedAoA);
  const colWidths = masterHeaders.map((h, colIdx) => {
    let maxLen = Math.max(10, String(h).length);
    const sampleLimit = Math.min(consolidatedAoA.length, 100);
    for (let r = 1; r < sampleLimit; r++) {
      const display = formatCellDisplay(consolidatedAoA[r]?.[colIdx]);
      if (display) {
        maxLen = Math.max(maxLen, Math.min(50, display.length));
      }
    }
    return { wch: maxLen + 2 };
  });
  ws1['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(workbook, ws1, 'Consolidated Data');

  // Sheet 2: Consolidation Summary
  const summaryHeaders = ['#', 'File Name', 'Raw Data Rows', 'Non-Blank USERSTATUS', 'Final Kept Rows', 'File Size (KB)'];
  const summaryRows = fileContributions.map((fc, idx) => [
    idx + 1,
    fc.fileName,
    fc.rawRowCount,
    fc.afterUserStatusCount,
    fc.rowCount,
    (fc.fileSize / 1024).toFixed(1),
  ]);

  const overviewRows = [
    ['METRIC', 'VALUE'],
    ['Total Files Consolidated', fileContributions.length],
    ['Master Header Source', primaryHeaderSourceFileName],
    ['Total Raw Data Rows Read', totalRawRowCount],
    [`Step 1: Removed Blank ${userStatusColumnName} (Col Z)`, removedBlankUserStatusCount],
    [`Step 1: Rows After ${userStatusColumnName} Filter`, afterUserStatusRows.length],
    ['Step 2: Removed Duplicates (Columns A, B, C)', removedDuplicatesCount],
    ['Step 2: Rows After Deduplication', afterDedupeRows.length],
    [`Step 3: Filter Rule (${releaseDateColumnName} Col Y)`, dateFilterDescription],
    ['Step 3: Removed Outside Date Filter', removedOutsideDateCount],
    ['Final Consolidated Rows Output', finalKeptRows.length],
    ['Consolidation Timestamp', new Date().toLocaleString()],
    ['', ''],
    ['FILE BREAKDOWN', ''],
  ];

  const ws2Data = [...overviewRows, summaryHeaders, ...summaryRows];
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  ws2['!cols'] = [{ wch: 42 }, { wch: 36 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, ws2, 'Consolidation Summary');

  const outBytes = safeWriteXlsx(workbook);

  // Format preview rows as display strings (first 25 data rows)
  const previewRows: any[][] = [
    masterHeaders,
    ...finalKeptRows.slice(0, 25).map((row) => row.map(formatCellDisplay)),
  ];

  if (onProgress) {
    onProgress({
      currentFile: parsedFiles.length,
      totalFiles: parsedFiles.length,
      fileName: 'Consolidation Complete',
      totalRows: finalKeptRows.length,
      percent: 100,
      stage: 'done',
    });
  }

  return {
    data: outBytes,
    csvBlob,
    fileCount: fileContributions.length,
    rawRowCount: totalRawRowCount,
    afterUserStatusCount: afterUserStatusRows.length,
    removedBlankUserStatusCount,
    afterDeduplicationCount: afterDedupeRows.length,
    removedDuplicatesCount,
    rowCount: finalKeptRows.length,
    removedOutsideDateCount,
    columnCount: masterHeaders.length,
    headers: masterHeaders,
    headerSourceFileName: primaryHeaderSourceFileName,
    userStatusColumnName,
    releaseDateColumnName,
    dateFilterDescription,
    detectedDates,
    previewRows,
    fileContributions,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};
