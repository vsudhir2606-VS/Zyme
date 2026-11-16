import {
  buildFastXlsxBlob,
  streamSpreadsheetRows,
  yieldToUi,
} from './fastSpreadsheetStream.ts';

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
  excelBlob: Blob;
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

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const formatYmd = (y: number, m: number, d: number): string | null => {
  if ((y | 0) !== y || (m | 0) !== m || (d | 0) !== d) return null;
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1) return null;
  let maxDay = DAYS_IN_MONTH[m];
  if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) {
    maxDay = 29;
  }
  if (d > maxDay) return null;
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

const RE_8DIGIT = /^\d{8}$/;
const RE_5DIGIT_SERIAL = /^\d{5}(\.\d+)?$/;
const RE_ISO_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT]|$)/;
const RE_DOT_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s|T|$)/;
const RE_D_MON_Y = /^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]+(\d{2,4})(?:\s|$)/;
const RE_MON_D_Y = /^([A-Za-z]{3,9})[-\s/]+(\d{1,2})[,\s-]+(\d{2,4})(?:\s|$)/;
const RE_SEP_DATE = /^(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s|T|$)/;

const inspectCellSlashOrder = (val: any): 'MDY' | 'DMY' | null => {
  if (val === undefined || val === null || val === '') return null;
  if (isExcelDateCellObj(val) && val.z) {
    const zLower = val.z.toLowerCase();
    const dPos = zLower.indexOf('d');
    const mPos = zLower.indexOf('m');
    if (dPos !== -1 && mPos !== -1) {
      return dPos < mPos ? 'DMY' : 'MDY';
    }
  }
  const str = fastCellDisplay(val).trim();
  if (!str) return null;
  const match = RE_SEP_DATE.exec(str);
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[3], 10);
    if (p1 > 12 && p2 <= 12) return 'DMY';
    if (p2 > 12 && p1 <= 12) return 'MDY';
  }
  return null;
};

const isAmbiguousSlashString = (val: any): boolean => {
  if (typeof val !== 'string') return false;
  const str = val.trim();
  const match = RE_SEP_DATE.exec(str);
  if (!match) return false;
  if (match[2] !== '/') return false;
  const p1 = parseInt(match[1], 10);
  const p2 = parseInt(match[3], 10);
  return p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 12 && p1 !== p2;
};

const excelSerialToYmd = (serial: number): string | null => {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2958466) return null;
  const wholeDays = Math.floor(serial + 1e-9);
  if (wholeDays === 60) return '1900-02-29';
  const epochOffset = wholeDays < 60 ? 25568 : 25569; // 1900-01-01..1900-02-28 vs >=1900-03-01 (Excel epoch 1899-12-30 UTC)
  const utcMs = (wholeDays - epochOffset) * 86400000;
  const dt = new Date(utcMs);
  if (isNaN(dt.getTime())) return null;
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/**
 * Parses an Excel cell (serial number, cell object, Date, or formatted string) into YYYY-MM-DD.
 * Uses pure UTC Excel epoch arithmetic for Excel serials to guarantee 100% timezone & ESM immunity.
 */
export const parseCellToYmd = (val: any, slashOrder: 'MDY' | 'DMY' = 'MDY'): string | null => {
  if (val === undefined || val === null || val === '') return null;

  // 1. Excel cell object with serial number
  if (isExcelDateCellObj(val)) {
    const serialYmd = excelSerialToYmd(val.v);
    if (serialYmd) return serialYmd;
    if (val.w) {
      return parseCellToYmd(val.w, slashOrder);
    }
    return null;
  }

  // 2. Native JS Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatYmd(val.getFullYear(), val.getMonth() + 1, val.getDate());
  }

  // 3. Raw Excel serial number or numeric YYYYMMDD
  if (typeof val === 'number' && Number.isFinite(val)) {
    if (val >= 19000101 && val <= 21991231 && Number.isInteger(val)) {
      const s = String(val);
      return formatYmd(
        parseInt(s.slice(0, 4), 10),
        parseInt(s.slice(4, 6), 10),
        parseInt(s.slice(6, 8), 10)
      );
    }
    return excelSerialToYmd(val);
  }

  // 4. String formats
  const str = String(val).trim();
  if (!str) return null;

  if (RE_8DIGIT.test(str)) {
    const y = parseInt(str.slice(0, 4), 10);
    const m = parseInt(str.slice(4, 6), 10);
    const d = parseInt(str.slice(6, 8), 10);
    const ymd = formatYmd(y, m, d);
    if (ymd) return ymd;
  }

  if (RE_5DIGIT_SERIAL.test(str)) {
    const num = parseFloat(str);
    if (num >= 20000 && num < 100000) {
      const serialYmd = excelSerialToYmd(num);
      if (serialYmd) return serialYmd;
    }
  }

  const isoMatch = RE_ISO_DATE.exec(str);
  if (isoMatch) {
    return formatYmd(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10),
      parseInt(isoMatch[3], 10)
    );
  }

  const dotMatch = RE_DOT_DATE.exec(str);
  if (dotMatch) {
    const d = parseInt(dotMatch[1], 10);
    const m = parseInt(dotMatch[2], 10);
    const rawY = parseInt(dotMatch[3], 10);
    const y = dotMatch[3].length === 2 ? expandTwoDigitYear(rawY) : rawY;
    return formatYmd(y, m, d) || formatYmd(y, d, m);
  }

  const dMonY = RE_D_MON_Y.exec(str);
  if (dMonY) {
    const d = parseInt(dMonY[1], 10);
    const m = MONTH_MAP[dMonY[2].toLowerCase()];
    const rawY = parseInt(dMonY[3], 10);
    const y = dMonY[3].length === 2 ? expandTwoDigitYear(rawY) : rawY;
    if (m) return formatYmd(y, m, d);
  }

  const monDY = RE_MON_D_Y.exec(str);
  if (monDY) {
    const m = MONTH_MAP[monDY[1].toLowerCase()];
    const d = parseInt(monDY[2], 10);
    const rawY = parseInt(monDY[3], 10);
    const y = monDY[3].length === 2 ? expandTwoDigitYear(rawY) : rawY;
    if (m) return formatYmd(y, m, d);
  }

  const sepMatch = RE_SEP_DATE.exec(str);
  if (sepMatch) {
    const p1 = parseInt(sepMatch[1], 10);
    const sep = sepMatch[2];
    const p2 = parseInt(sepMatch[3], 10);
    const rawY = parseInt(sepMatch[4], 10);
    const y = sepMatch[4].length === 2 ? expandTwoDigitYear(rawY) : rawY;

    if (p1 > 12) return formatYmd(y, p2, p1);
    if (p2 > 12) return formatYmd(y, p1, p2);

    const order = slashOrder === 'DMY' || sep === '-' ? 'DMY' : 'MDY';
    return order === 'DMY'
      ? (formatYmd(y, p2, p1) || formatYmd(y, p1, p2))
      : (formatYmd(y, p1, p2) || formatYmd(y, p2, p1));
  }

  const nativeParsed = new Date(str);
  if (!isNaN(nativeParsed.getTime())) {
    return formatYmd(nativeParsed.getFullYear(), nativeParsed.getMonth() + 1, nativeParsed.getDate());
  }

  return null;
};

const fastCellDisplay = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  const t = typeof val;
  if (t === 'string') return val;
  if (t === 'number' || t === 'boolean') return String(val);
  if (isExcelDateCellObj(val)) {
    if (val.w && val.w.trim() !== '') return val.w;
    const serialYmd = excelSerialToYmd(val.v);
    if (serialYmd) return serialYmd;
    return String(val.v);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatYmd(val.getFullYear(), val.getMonth() + 1, val.getDate()) || val.toISOString().split('T')[0];
  }
  return String(val);
};

const escapeCsvCell = (val: any): string => {
  const str = fastCellDisplay(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

const normHeader = (h: any): string => {
  return String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const resolveRequiredColumns = (
  headers: string[]
): { userStatusIdx: number; releaseDateIdx: number } => {
  const normHeaders = headers.map(normHeader);

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

const buildColumnMapToMaster = (
  fileHeaders: string[],
  masterHeaders: string[]
): { srcForMasterCol: number[]; isIdentity: boolean } => {
  const colIndexMap: number[] = new Array(fileHeaders.length).fill(-1);
  const usedMasterCols = new Set<number>();

  // First pass: exact header match (preserving order for repeated header names)
  for (let srcIdx = 0; srcIdx < fileHeaders.length; srcIdx++) {
    const normH = fileHeaders[srcIdx].trim().toLowerCase();
    for (let mIdx = 0; mIdx < masterHeaders.length; mIdx++) {
      if (!usedMasterCols.has(mIdx) && masterHeaders[mIdx].trim().toLowerCase() === normH) {
        colIndexMap[srcIdx] = mIdx;
        usedMasterCols.add(mIdx);
        break;
      }
    }
  }

  // Second pass: positional fallback for any unmatched columns
  for (let srcIdx = 0; srcIdx < fileHeaders.length; srcIdx++) {
    if (colIndexMap[srcIdx] === -1 && srcIdx < masterHeaders.length && !usedMasterCols.has(srcIdx)) {
      colIndexMap[srcIdx] = srcIdx;
      usedMasterCols.add(srcIdx);
    }
  }

  const srcForMasterCol = new Array<number>(masterHeaders.length).fill(-1);
  for (let srcIdx = 0; srcIdx < colIndexMap.length; srcIdx++) {
    const target = colIndexMap[srcIdx];
    if (target >= 0 && target < masterHeaders.length && srcForMasterCol[target] === -1) {
      srcForMasterCol[target] = srcIdx;
    }
  }

  let isIdentity = fileHeaders.length >= masterHeaders.length;
  if (isIdentity) {
    for (let m = 0; m < masterHeaders.length; m++) {
      if (srcForMasterCol[m] !== m) {
        isIdentity = false;
        break;
      }
    }
  }

  return { srcForMasterCol, isIdentity };
};

const isRepeatedHeaderRow = (
  row: any[],
  fileHeadersLower: string[],
  masterHeadersLower: string[]
): boolean => {
  for (let c = 0; c < row.length; c++) {
    const strVal = fastCellDisplay(row[c]).trim().toLowerCase();
    if (!strVal) continue;
    const selfMatch = c < fileHeadersLower.length && strVal === fileHeadersLower[c];
    const masterMatch = c < masterHeadersLower.length && strVal === masterHeadersLower[c];
    if (!selfMatch && !masterMatch) return false;
  }
  return true;
};

/**
 * Zyme Consolidator Engine (High-Speed Streaming Pipeline):
 * Capable of processing 1,000,000+ rows across large XLSX/CSV files in a single streaming pass.
 * 1. Consolidates all uploaded files using File 1's header (strict validation).
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

  interface ValidatedFileMeta {
    file: File;
    headers: string[];
    headersLower: string[];
    headerRowIndex: number;
    slashOrder: 'MDY' | 'DMY' | null;
    userStatusIdx: number;
    releaseDateIdx: number;
  }

  const validatedMetas: ValidatedFileMeta[] = [];

  // Phase 1: Ultra-fast preflight check (streams only first ~500 rows per file to validate columns & date order)
  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    if (signal?.aborted) {
      throw new Error('Consolidation was cancelled by the user.');
    }

    const file = files[fileIdx];
    if (onProgress) {
      onProgress({
        currentFile: fileIdx + 1,
        totalFiles,
        fileName: `Validating ${file.name}...`,
        totalRows: 0,
        percent: Math.min(12, Math.round(((fileIdx + 1) / totalFiles) * 12)),
        stage: 'reading',
      });
    }
    await yieldToUi();

    if (file.size === 0) {
      failedFiles.push({
        fileName: file.name,
        fileSize: file.size,
        reason: 'File is completely empty (0 bytes).',
      });
      continue;
    }

    try {
      let headers: string[] | null = null;
      let headerRowIndex = -1;
      let dataRowCount = 0;
      let localReleaseIdx = -1;
      let detectedSlashOrder: 'MDY' | 'DMY' | null = null;

      await streamSpreadsheetRows(
        file,
        (row, rowIdx) => {
          if (headers === null) {
            headers = row.map((c, i) => {
              const val = fastCellDisplay(c).trim();
              return val ? val : `Column_${i + 1}`;
            });
            headerRowIndex = rowIdx;
            const resolved = resolveRequiredColumns(headers);
            localReleaseIdx = resolved.releaseDateIdx;
            return;
          }

          dataRowCount++;
          if (localReleaseIdx >= 0 && localReleaseIdx < row.length && detectedSlashOrder === null) {
            const hint = inspectCellSlashOrder(row[localReleaseIdx]);
            if (hint) detectedSlashOrder = hint;
          }

          // Stop early once we have at least 1 data row AND slash order (or sampled 400 rows)
          if (dataRowCount >= 400 || (dataRowCount >= 1 && detectedSlashOrder !== null)) {
            return false;
          }
        },
        { maxRows: 410, signal }
      );

      if (!headers || headers.length === 0) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: 'File contains 0 data rows.',
        });
        continue;
      }

      if (dataRowCount === 0) {
        failedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          reason: 'File contains only a header row with 0 data rows underneath.',
        });
        continue;
      }

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

      validatedMetas.push({
        file,
        headers,
        headersLower: headers.map((h) => h.trim().toLowerCase()),
        headerRowIndex,
        slashOrder: detectedSlashOrder,
        userStatusIdx,
        releaseDateIdx,
      });
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) throw err;
      console.error(`Error reading file ${file.name}:`, err);
      failedFiles.push({
        fileName: file.name,
        fileSize: file.size,
        reason: err?.message || 'Failed to parse file.',
      });
    }
  }

  if (failedFiles.length > 0) {
    const errorMsg =
      failedFiles.length === 1
        ? `Zyme Consolidator error: "${failedFiles[0].fileName}" could not be consolidated (${failedFiles[0].reason}).`
        : `Zyme Consolidator error: ${failedFiles.length} of ${totalFiles} files failed validation.`;
    throw new ConsolidationError(errorMsg, failedFiles);
  }

  if (validatedMetas.length === 0) {
    throw new ConsolidationError('None of the selected files could be parsed or all were empty.', failedFiles);
  }

  // Phase 2: Master Header from File 1
  const primaryHeaderSourceFileName = validatedMetas[0].file.name;
  const masterHeaders = [...validatedMetas[0].headers];
  const masterHeadersLower = [...validatedMetas[0].headersLower];
  const masterColCount = masterHeaders.length;
  const { userStatusIdx, releaseDateIdx } = resolveRequiredColumns(masterHeaders);

  const userStatusColumnName = masterHeaders[userStatusIdx] || 'USERSTATUS (Col Z)';
  const releaseDateColumnName = masterHeaders[releaseDateIdx] || 'Releasedate (Col Y)';

  // Global Funnel Counters & State
  let totalRawRowCount = 0;
  let removedBlankUserStatusCount = 0;
  let afterUserStatusCount = 0;
  let removedDuplicatesCount = 0;
  let afterDeduplicationCount = 0;
  let removedOutsideDateCount = 0;

  const seenABCKeys = new Set<string>();
  const detectedDatesSet = new Set<string>();
  const finalKeptRows: any[][] = [];

  const fileRawCounts = new Array<number>(validatedMetas.length).fill(0);
  const fileAfterStatusCounts = new Array<number>(validatedMetas.length).fill(0);
  const fileFinalCounts = new Array<number>(validatedMetas.length).fill(0);

  // Phase 3: Single-Pass Streaming Consolidation across all files
  for (let fIdx = 0; fIdx < validatedMetas.length; fIdx++) {
    if (signal?.aborted) {
      throw new Error('Consolidation was cancelled by the user.');
    }

    const meta = validatedMetas[fIdx];
    const { srcForMasterCol, isIdentity } = buildColumnMapToMaster(meta.headers, masterHeaders);

    const srcColA = srcForMasterCol[0];
    const srcColB = srcForMasterCol[1];
    const srcColC = srcForMasterCol[2];
    const srcUserStatus = srcForMasterCol[userStatusIdx] !== -1 ? srcForMasterCol[userStatusIdx] : meta.userStatusIdx;
    const srcReleaseDate = srcForMasterCol[releaseDateIdx] !== -1 ? srcForMasterCol[releaseDateIdx] : meta.releaseDateIdx;

    // Track per-file slash order; if null after preflight, temporarily hold ONLY ambiguous slash rows until resolved
    let activeSlashOrder: 'MDY' | 'DMY' | null = meta.slashOrder;
    const dateCache = new Map<string | number, string | null>();
    let pendingAmbiguousRows: { releaseCell: any; alignedCells: any[] }[] = [];

    const alignRow = (row: any[]): any[] => {
      const unified = new Array(masterColCount);
      if (isIdentity) {
        for (let m = 0; m < masterColCount; m++) {
          const v = row[m];
          unified[m] = v === undefined || v === null ? '' : v;
        }
      } else {
        for (let m = 0; m < masterColCount; m++) {
          const s = srcForMasterCol[m];
          const v = s >= 0 && s < row.length ? row[s] : '';
          unified[m] = v === undefined || v === null ? '' : v;
        }
      }
      return unified;
    };

    const resolveDateCached = (cell: any, order: 'MDY' | 'DMY'): string | null => {
      if (cell === undefined || cell === null || cell === '') return null;
      if (typeof cell === 'string' || typeof cell === 'number') {
        const cached = dateCache.get(cell);
        if (cached !== undefined) return cached;
        const parsed = parseCellToYmd(cell, order);
        if (dateCache.size < 8192) {
          dateCache.set(cell, parsed);
        }
        return parsed;
      }
      if (isExcelDateCellObj(cell)) {
        const cached = dateCache.get(cell.v);
        if (cached !== undefined) return cached;
        const parsed = parseCellToYmd(cell, order);
        if (dateCache.size < 8192) {
          dateCache.set(cell.v, parsed);
        }
        return parsed;
      }
      return parseCellToYmd(cell, order);
    };

    const finalizeDateCheck = (alignedCells: any[], releaseCell: any, order: 'MDY' | 'DMY') => {
      const rowYmd = resolveDateCached(releaseCell, order);
      if (rowYmd) {
        detectedDatesSet.add(rowYmd);
      }

      if (rowYmd !== null && rowYmd >= filterStartYmd && rowYmd <= filterEndYmd) {
        if (typeof releaseCell === 'number' && releaseCell >= 20000 && releaseCell < 100000) {
          alignedCells[releaseDateIdx] = {
            t: 'n',
            v: releaseCell,
            z: 'yyyy-mm-dd',
            w: rowYmd,
          } as ExcelCellValue;
        }
        finalKeptRows.push(alignedCells);
        fileFinalCounts[fIdx]++;
      } else {
        removedOutsideDateCount++;
      }
    };

    const flushPendingAmbiguous = (order: 'MDY' | 'DMY') => {
      if (pendingAmbiguousRows.length === 0) return;
      dateCache.clear();
      for (let i = 0; i < pendingAmbiguousRows.length; i++) {
        const item = pendingAmbiguousRows[i];
        finalizeDateCheck(item.alignedCells, item.releaseCell, order);
      }
      pendingAmbiguousRows = [];
    };

    let lastProgressReportRow = 0;
    const basePct = 12 + Math.round((fIdx / validatedMetas.length) * 70);
    const filePctSpan = Math.max(1, Math.round(70 / validatedMetas.length));

    await streamSpreadsheetRows(
      meta.file,
      (row, rowIdx) => {
        if (rowIdx <= meta.headerRowIndex) return;

        // Skip repeated header rows inside body
        if (rowIdx > meta.headerRowIndex && isRepeatedHeaderRow(row, meta.headersLower, masterHeadersLower)) {
          return;
        }

        // Fast non-empty check
        let hasData = false;
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (v !== '' && v !== undefined && v !== null) {
            if (typeof v !== 'string' || v.trim() !== '') {
              hasData = true;
              break;
            }
          }
        }
        if (!hasData) return;

        totalRawRowCount++;
        fileRawCounts[fIdx]++;

        const rawReleaseCell =
          srcReleaseDate >= 0 && srcReleaseDate < row.length ? row[srcReleaseDate] : '';

        // Continuously watch for unambiguous slash date hints if still unknown
        if (activeSlashOrder === null && rawReleaseCell !== '') {
          const hint = inspectCellSlashOrder(rawReleaseCell);
          if (hint) {
            activeSlashOrder = hint;
            flushPendingAmbiguous(hint);
          }
        }

        // STEP 1: Filter USERSTATUS (Column Z) - remove blank & keep others
        const rawUserStatus =
          srcUserStatus >= 0 && srcUserStatus < row.length ? row[srcUserStatus] : '';
        if (
          rawUserStatus === '' ||
          rawUserStatus === undefined ||
          rawUserStatus === null ||
          fastCellDisplay(rawUserStatus).trim() === ''
        ) {
          removedBlankUserStatusCount++;
          return;
        }

        afterUserStatusCount++;
        fileAfterStatusCounts[fIdx]++;

        // STEP 2: Remove duplicates across Column A, B, C
        const valA = srcColA >= 0 && srcColA < row.length ? fastCellDisplay(row[srcColA]).trim().toLowerCase() : '';
        const valB = srcColB >= 0 && srcColB < row.length ? fastCellDisplay(row[srcColB]).trim().toLowerCase() : '';
        const valC = srcColC >= 0 && srcColC < row.length ? fastCellDisplay(row[srcColC]).trim().toLowerCase() : '';
        const compositeKey = `${valA}\x00${valB}\x00${valC}`;

        if (seenABCKeys.has(compositeKey)) {
          removedDuplicatesCount++;
          return;
        }
        seenABCKeys.add(compositeKey);
        afterDeduplicationCount++;

        // STEP 3: Filter Releasedate (Column Y)
        if (activeSlashOrder !== null) {
          const rowYmd = resolveDateCached(rawReleaseCell, activeSlashOrder);
          if (rowYmd) {
            detectedDatesSet.add(rowYmd);
          }

          if (rowYmd !== null && rowYmd >= filterStartYmd && rowYmd <= filterEndYmd) {
            const aligned = alignRow(row);
            if (typeof rawReleaseCell === 'number' && rawReleaseCell >= 20000 && rawReleaseCell < 100000) {
              aligned[releaseDateIdx] = {
                t: 'n',
                v: rawReleaseCell,
                z: 'yyyy-mm-dd',
                w: rowYmd,
              } as ExcelCellValue;
            }
            finalKeptRows.push(aligned);
            fileFinalCounts[fIdx]++;
          } else {
            removedOutsideDateCount++;
          }
        } else if (isAmbiguousSlashString(rawReleaseCell)) {
          if (pendingAmbiguousRows.length < 40000) {
            pendingAmbiguousRows.push({
              alignedCells: alignRow(row),
              releaseCell: rawReleaseCell,
            });
          } else {
            // Bounded cap reached without disambiguation: lock to MDY & flush
            activeSlashOrder = 'MDY';
            flushPendingAmbiguous('MDY');
            finalizeDateCheck(alignRow(row), rawReleaseCell, 'MDY');
          }
        } else {
          // Date is unambiguous (serial, ISO YYYY-MM-DD, DD-MMM-YYYY, DD.MM.YYYY, etc.)
          const rowYmd = resolveDateCached(rawReleaseCell, 'MDY');
          if (rowYmd) {
            detectedDatesSet.add(rowYmd);
          }

          if (rowYmd !== null && rowYmd >= filterStartYmd && rowYmd <= filterEndYmd) {
            const aligned = alignRow(row);
            if (typeof rawReleaseCell === 'number' && rawReleaseCell >= 20000 && rawReleaseCell < 100000) {
              aligned[releaseDateIdx] = {
                t: 'n',
                v: rawReleaseCell,
                z: 'yyyy-mm-dd',
                w: rowYmd,
              } as ExcelCellValue;
            }
            finalKeptRows.push(aligned);
            fileFinalCounts[fIdx]++;
          } else {
            removedOutsideDateCount++;
          }
        }

        if (totalRawRowCount - lastProgressReportRow >= 20000) {
          lastProgressReportRow = totalRawRowCount;
          if (onProgress) {
            onProgress({
              currentFile: fIdx + 1,
              totalFiles: validatedMetas.length,
              fileName: `Streaming ${meta.file.name} (${finalKeptRows.length.toLocaleString()} kept)...`,
              totalRows: totalRawRowCount,
              percent: Math.min(82, basePct + Math.round(filePctSpan * 0.5)),
              stage: 'filtering',
            });
          }
        }
      },
      {
        signal,
        onChunkProgress: (readBytes, totalBytes) => {
          if (onProgress && totalBytes > 0) {
            const frac = Math.min(1, readBytes / totalBytes);
            onProgress({
              currentFile: fIdx + 1,
              totalFiles: validatedMetas.length,
              fileName: `Processing ${meta.file.name}...`,
              totalRows: totalRawRowCount,
              percent: Math.min(82, basePct + Math.round(filePctSpan * frac)),
              stage: 'filtering',
            });
          }
        },
      }
    );

    if (pendingAmbiguousRows.length > 0) {
      flushPendingAmbiguous(activeSlashOrder || 'MDY');
    }

    if (onProgress) {
      onProgress({
        currentFile: fIdx + 1,
        totalFiles: validatedMetas.length,
        fileName: `Completed ${meta.file.name}`,
        totalRows: totalRawRowCount,
        percent: Math.min(84, basePct + filePctSpan),
        stage: 'deduplicating',
      });
    }
    await yieldToUi();
  }

  // Release seenABCKeys immediately to free memory before output generation
  seenABCKeys.clear();

  const detectedDates = Array.from(detectedDatesSet).sort();

  if (finalKeptRows.length === 0) {
    warnings.push(
      detectedDates.length > 0
        ? `No rows matched ${dateFilterDescription}. Dates present in Releasedate (${releaseDateColumnName}): ${detectedDates.slice(0, 12).join(', ')}${detectedDates.length > 12 ? ` (+${detectedDates.length - 12} more)` : ''}.`
        : `No rows matched ${dateFilterDescription} (no valid dates found in ${releaseDateColumnName} after filtering).`
    );
  }

  const fileContributions: FileContribution[] = validatedMetas.map((meta, idx) => ({
    fileName: meta.file.name,
    rawRowCount: fileRawCounts[idx],
    afterUserStatusCount: fileAfterStatusCounts[idx],
    rowCount: fileFinalCounts[idx],
    columnCount: meta.headers.length,
    fileSize: meta.file.size,
  }));

  // Phase 4: Generate consolidated CSV & XLSX outputs rapidly
  if (onProgress) {
    onProgress({
      currentFile: validatedMetas.length,
      totalFiles: validatedMetas.length,
      fileName: `Generating Excel & CSV (${finalKeptRows.length.toLocaleString()} kept rows)...`,
      totalRows: finalKeptRows.length,
      percent: 88,
      stage: 'generating',
    });
  }
  await yieldToUi();

  // CSV chunk builder
  const csvChunks: string[] = [];
  let currentCsvLines: string[] = [masterHeaders.map(escapeCsvCell).join(',')];
  for (let i = 0; i < finalKeptRows.length; i++) {
    currentCsvLines.push(finalKeptRows[i].map(escapeCsvCell).join(','));
    if (currentCsvLines.length >= 4000) {
      csvChunks.push(currentCsvLines.join('\r\n') + '\r\n');
      currentCsvLines = [];
      if (i % 40000 === 0) {
        await yieldToUi();
      }
    }
  }
  if (currentCsvLines.length > 0) {
    csvChunks.push(currentCsvLines.join('\r\n') + '\r\n');
  }
  const csvBlob = new Blob(csvChunks, { type: 'text/csv;charset=utf-8;' });

  // Column width calculation from header + first 100 kept rows
  const colWidths = masterHeaders.map((h, colIdx) => {
    let maxLen = Math.max(10, String(h).length);
    const sampleLimit = Math.min(finalKeptRows.length, 100);
    for (let r = 0; r < sampleLimit; r++) {
      const display = fastCellDisplay(finalKeptRows[r]?.[colIdx]);
      if (display) {
        maxLen = Math.max(maxLen, Math.min(50, display.length));
      }
    }
    return maxLen + 2;
  });

  // Summary Sheet Rows
  const summaryHeaders = ['#', 'File Name', 'Raw Data Rows', 'Non-Blank USERSTATUS', 'Final Kept Rows', 'File Size (KB)'];
  const summaryFileRows = fileContributions.map((fc, idx) => [
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
    [`Step 1: Rows After ${userStatusColumnName} Filter`, afterUserStatusCount],
    ['Step 2: Removed Duplicates (Columns A, B, C)', removedDuplicatesCount],
    ['Step 2: Rows After Deduplication', afterDeduplicationCount],
    [`Step 3: Filter Rule (${releaseDateColumnName} Col Y)`, dateFilterDescription],
    ['Step 3: Removed Outside Date Filter', removedOutsideDateCount],
    ['Final Consolidated Rows Output', finalKeptRows.length],
    ['Consolidation Timestamp', new Date().toLocaleString()],
    ['', ''],
    ['FILE BREAKDOWN', ''],
    summaryHeaders,
    ...summaryFileRows,
  ];

  if (onProgress) {
    onProgress({
      currentFile: validatedMetas.length,
      totalFiles: validatedMetas.length,
      fileName: 'Compressing Excel (.xlsx) workbook...',
      totalRows: finalKeptRows.length,
      percent: 94,
      stage: 'generating',
    });
  }

  const excelBlob = await buildFastXlsxBlob(
    {
      name: 'Consolidated Data',
      headers: masterHeaders,
      rows: finalKeptRows,
      colWidths,
    },
    {
      name: 'Consolidation Summary',
      rows: overviewRows,
      colWidths: [42, 36, 16, 22, 18, 16],
    },
    signal
  );

  // Format preview rows as display strings (first 25 data rows)
  const previewRows: any[][] = [
    masterHeaders,
    ...finalKeptRows.slice(0, 25).map((row) => row.map(fastCellDisplay)),
  ];

  if (onProgress) {
    onProgress({
      currentFile: validatedMetas.length,
      totalFiles: validatedMetas.length,
      fileName: 'Consolidation Complete',
      totalRows: finalKeptRows.length,
      percent: 100,
      stage: 'done',
    });
  }

  return {
    excelBlob,
    csvBlob,
    fileCount: fileContributions.length,
    rawRowCount: totalRawRowCount,
    afterUserStatusCount,
    removedBlankUserStatusCount,
    afterDeduplicationCount,
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
