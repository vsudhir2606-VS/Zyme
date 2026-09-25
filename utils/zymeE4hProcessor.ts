import * as XLSX from 'xlsx';
import './cptableSetup.ts';

export interface TargetColumnDef {
  key: string;
  label: string;
  colLetter: string;
  defaultHeader: string;
}

export const TARGET_ZYME_E4H_COLUMNS: TargetColumnDef[] = [
  { key: 'status', label: 'Status', colLetter: 'A', defaultHeader: 'status' },
  { key: 'posnr', label: 'Posnr', colLetter: 'B', defaultHeader: 'Posnr' },
  { key: 'sequenceNo', label: 'Sequence No', colLetter: 'C', defaultHeader: 'sequence no' },
  { key: 'partnerId', label: 'Partner ID', colLetter: 'D', defaultHeader: 'partner ID' },
  { key: 'country', label: 'Country', colLetter: 'E', defaultHeader: 'Country' },
  { key: 'name', label: 'Name', colLetter: 'F', defaultHeader: 'name' },
  { key: 'street', label: 'Street', colLetter: 'G', defaultHeader: 'street' },
  { key: 'city', label: 'City', colLetter: 'H', defaultHeader: 'city' },
  { key: 'postalCode', label: 'Postal Code', colLetter: 'I', defaultHeader: 'Postal Code' },
  { key: 'rplName', label: 'RPLname', colLetter: 'J', defaultHeader: 'RPLname' },
  { key: 'typeOfList', label: 'Type of List', colLetter: 'K', defaultHeader: 'Type of List' },
  { key: 'splId', label: 'SPL Id', colLetter: 'L', defaultHeader: 'SPL Id' },
  { key: 'rplScreeningStatus', label: 'RPL Screening Status', colLetter: 'M', defaultHeader: 'RPL Screening Status' },
  { key: 'rplStreet1', label: 'RplStreet1', colLetter: 'N', defaultHeader: 'RplStreet1' },
  { key: 'rplStreet2', label: 'RplStreet1 (2)', colLetter: 'O', defaultHeader: 'RplStreet1' },
  { key: 'state', label: 'State', colLetter: 'P', defaultHeader: 'State' },
];

export const TARGET_ZYME_E4H_SHEET2_COLUMNS: TargetColumnDef[] = [
  { key: 'status', label: 'Status', colLetter: 'A', defaultHeader: 'status' },
  { key: 'posnr', label: 'Posnr', colLetter: 'B', defaultHeader: 'Posnr' },
  { key: 'sequenceNo', label: 'Sequence No', colLetter: 'C', defaultHeader: 'sequence no' },
  { key: 'partnerId', label: 'Partner ID', colLetter: 'D', defaultHeader: 'partner ID' },
  { key: 'country', label: 'Country', colLetter: 'E', defaultHeader: 'Country' },
  { key: 'name', label: 'Name', colLetter: 'F', defaultHeader: 'name' },
  { key: 'match', label: 'Match', colLetter: 'G', defaultHeader: 'match' },
  { key: 'rplName', label: 'RPLname', colLetter: 'H', defaultHeader: 'RPLname' },
  { key: 'street', label: 'Street', colLetter: 'I', defaultHeader: 'street' },
  { key: 'city', label: 'City', colLetter: 'J', defaultHeader: 'city' },
  { key: 'postalCode', label: 'Postal Code', colLetter: 'K', defaultHeader: 'Postal Code' },
  { key: 'typeOfList', label: 'Type of List', colLetter: 'L', defaultHeader: 'Type of List' },
  { key: 'splId', label: 'SPL Id', colLetter: 'M', defaultHeader: 'SPL Id' },
  { key: 'rplScreeningStatus', label: 'RPL Screening Status', colLetter: 'N', defaultHeader: 'RPL Screening Status' },
  { key: 'rplStreet1', label: 'RplStreet1', colLetter: 'O', defaultHeader: 'RplStreet1' },
  { key: 'rplStreet2', label: 'RplStreet1 (2)', colLetter: 'P', defaultHeader: 'RplStreet1' },
  { key: 'state', label: 'State', colLetter: 'Q', defaultHeader: 'State' },
];

export type TargetColumnKey = 
  | 'status'
  | 'posnr'
  | 'sequenceNo'
  | 'partnerId'
  | 'country'
  | 'name'
  | 'match'
  | 'street'
  | 'city'
  | 'postalCode'
  | 'rplName'
  | 'typeOfList'
  | 'splId'
  | 'rplScreeningStatus'
  | 'rplStreet1'
  | 'rplStreet2'
  | 'state';

export type ZymeE4hColumnMapping = Record<TargetColumnKey, number>;

export interface TargetColumnAudit {
  key: TargetColumnKey;
  label: string;
  colLetter: string;
  outputHeader: string;
  sourceColIndex: number;
  matchedHeaderName: string;
  isFoundInSource: boolean;
}

export interface ZymeE4hRowAudit {
  rowIndex: number;
  posnr: string;
  name: string;
  match?: string;
  rplName: string;
  typeOfList: string;
  sequenceNo: string;
  status: string;
  isDuplicate: boolean;
  nameBlanked: boolean;
  originalName: string;
}

export interface ZymeE4hResult {
  fileName: string;
  sheetName: string;
  totalOriginalRows: number;
  duplicatesRemoved: number;
  uniqueRowsKept: number;
  nameRetainedCount: number;
  nameBlankedCount: number;
  statusKeywordsFlaggedCount: number;
  highRiskFlaggedCount: number;
  aprvFlaggedCount: number;
  exactMatchCount: number;
  keywordMatchCount: number;
  headers: string[];
  sheet2Headers: string[];
  columnAudits: TargetColumnAudit[];
  unmappedSourceHeaders: { colIndex: number; headerName: string }[];
  processedRows: any[][]; // Sheet 1 rows including headers at [0]
  sheet2ProcessedRows: any[][]; // Sheet 2 rows including headers at [0]
  duplicateAudit: ZymeE4hRowAudit[];
  previewRows: any[][]; // first 100 rows for display (Sheet 1)
  sheet2PreviewRows: any[][]; // first 100 rows for display (Sheet 2)
  excelBuffer: Uint8Array;
  csvContent: string;
  sheet2CsvContent: string;
}

export const DEFAULT_APRV_CODES = ['RU', 'UA', 'NI', 'VE', 'BY', 'CU', 'IR', 'KP', 'SY'];
export const DEFAULT_RISK_KEYWORDS = [
  'SANCTION', 'EMBARGO', 'DENIED',
  'Lockheed', 'Raytheon', 'Northrop', 'Bae', 'RTX', 'United Technologies', 'UTC', 'Rockwell',
  'Kharon', 'Alliant', 'AeroVironment', 'ViaSat', 'Data Link Solution', 'Projectina AG',
  'General Dynamic', 'LUKOIL', 'Citgo', 'Huawei', 'Nayara', 'Wintershall', 'Huntington', 'HII'
];

export interface ZymeE4hOptions {
  customMapping?: Partial<ZymeE4hColumnMapping>;
  selectedSheet?: string;
  caseSensitiveDuplicates?: boolean;
  includeRemainingColumns?: boolean;
  statusKeywords?: string[];
  highRiskKeywords?: string[];
  aprvCodes?: string[];
}

/**
 * Normalizes string for header matching: removes special chars and lowers.
 */
const norm = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val).toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Detects all 16 target columns from a list of source header strings.
 */
export const detectZymeE4hColumns = (headers: any[]): ZymeE4hColumnMapping => {
  const mapping: ZymeE4hColumnMapping = {
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
  };

  const normHeaders = headers.map(h => norm(h));
  const usedIndices = new Set<number>();

  const matchColumn = (synonyms: string[], excludeSubstring: string[] = []): number => {
    // 1. Exact normalized match
    for (let i = 0; i < normHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const nh = normHeaders[i];
      if (excludeSubstring.some(ex => nh.includes(ex))) continue;
      if (synonyms.some(syn => nh === syn)) {
        usedIndices.add(i);
        return i;
      }
    }
    // 2. Starts-with or includes match
    for (let i = 0; i < normHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const nh = normHeaders[i];
      if (excludeSubstring.some(ex => nh.includes(ex))) continue;
      if (synonyms.some(syn => nh.includes(syn))) {
        usedIndices.add(i);
        return i;
      }
    }
    return -1;
  };

  // Specific detectors to prevent cross-matching:

  // 1. RPL Screening Status (must be matched before generic 'status')
  mapping.rplScreeningStatus = matchColumn(
    ['rplscreeningstatus', 'rplscreenstatus', 'screeningstatus', 'rplstatus', 'rplstat'],
    []
  );

  // 2. RPL Name (must be matched before generic 'name')
  mapping.rplName = matchColumn(
    ['rplname', 'rplentity', 'rplcustomer', 'rplpartner', 'rpllistname', 'rplorg'],
    []
  );

  // 3. RPL Street 1 & 2 (must be matched before generic 'street')
  mapping.rplStreet1 = matchColumn(
    ['rplstreet1', 'rplstreet', 'rpladdress1', 'rpladdress'],
    ['street2', 'address2']
  );
  mapping.rplStreet2 = matchColumn(
    ['rplstreet2', 'rplstreet12', 'rpladdress2', 'rplstreet'],
    []
  );

  // 4. Type of List
  mapping.typeOfList = matchColumn(
    ['typeoflist', 'listtype', 'typelist', 'listcategory', 'listgroup', 'typeoftlist'],
    []
  );

  // 5. Posnr
  mapping.posnr = matchColumn(
    ['posnr', 'item', 'position', 'posno', 'posnumber', 'linenumber', 'lineitem', 'pos'],
    []
  );

  // 6. Sequence No
  mapping.sequenceNo = matchColumn(
    ['sequenceno', 'sequencenumber', 'seqno', 'seqnum', 'seqnumber', 'sno', 'seq', 'sequence'],
    []
  );

  // 7. Partner ID
  mapping.partnerId = matchColumn(
    ['partnerid', 'partner', 'partnerno', 'partnernumber', 'bp', 'businesspartner', 'custid', 'customerid', 'vendorid', 'partnerro'],
    ['name']
  );

  // 8. Country
  mapping.country = matchColumn(
    ['country', 'land', 'countrycode', 'ctry', 'cntry', 'land1', 'countryname'],
    []
  );

  // 9. Generic Name (exclude anything with 'rpl')
  mapping.name = matchColumn(
    ['name', 'name1', 'customername', 'partnername', 'entityname', 'companyname', 'clientname'],
    ['rpl']
  );

  // 10. Generic Street (exclude anything with 'rpl')
  mapping.street = matchColumn(
    ['street', 'street1', 'address', 'stras', 'streetaddress'],
    ['rpl']
  );

  // 11. City
  mapping.city = matchColumn(
    ['city', 'ort01', 'town', 'municipality', 'cityname'],
    []
  );

  // 12. Postal Code
  mapping.postalCode = matchColumn(
    ['postalcode', 'postcode', 'postcode', 'zip', 'zipcode', 'pstlz', 'postal'],
    []
  );

  // 13. SPL Id
  mapping.splId = matchColumn(
    ['splid', 'splnumber', 'splno', 'sanctionedpartylistid', 'listid', 'spl'],
    []
  );

  // 14. State
  mapping.state = matchColumn(
    ['state', 'region', 'province', 'bland', 'regio', 'st'],
    []
  );

  // 15. Generic Status (fallback to any column with status/stat if not used)
  mapping.status = matchColumn(
    ['status', 'stat', 'overallstatus', 'itemstatus', 'docstatus', 'screeningstatus'],
    []
  );

  return mapping;
};

/**
 * Scans rows to find the best header row.
 */
export const findHeaderRow = (rows: any[][]): { headerRowIndex: number; mapping: ZymeE4hColumnMapping } => {
  let bestRowIndex = 0;
  let bestScore = -1;
  let bestMapping: ZymeE4hColumnMapping = {
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
  };

  const maxScan = Math.min(rows.length, 30);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const currentMapping = detectZymeE4hColumns(row);
    let score = 0;
    // Core 4 deduplication + Sequence columns get high weight
    if (currentMapping.posnr !== -1) score += 3;
    if (currentMapping.name !== -1) score += 3;
    if (currentMapping.rplName !== -1) score += 3;
    if (currentMapping.typeOfList !== -1) score += 3;
    if (currentMapping.sequenceNo !== -1) score += 3;
    // Target sorted columns
    if (currentMapping.status !== -1) score += 2;
    if (currentMapping.partnerId !== -1) score += 2;
    if (currentMapping.country !== -1) score += 2;
    if (currentMapping.city !== -1) score += 2;
    if (currentMapping.street !== -1) score += 2;
    if (currentMapping.postalCode !== -1) score += 2;
    if (currentMapping.splId !== -1) score += 2;
    if (currentMapping.rplScreeningStatus !== -1) score += 2;
    if (currentMapping.rplStreet1 !== -1) score += 2;
    if (currentMapping.state !== -1) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = r;
      bestMapping = currentMapping;
    }
  }

  return { headerRowIndex: bestRowIndex, mapping: bestMapping };
};

/**
 * Checks if a Sequence No value equals 1.
 * Supports numbers, strings like "1", "1.0", " 1 ".
 */
export const isSequenceNumberOne = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') {
    return val === 1;
  }
  const str = String(val).trim();
  if (str === '1' || str === '1.0' || str === '01') return true;
  const num = Number(str);
  return !isNaN(num) && num === 1;
};

interface KeptRowRecord {
  sheetRowIndex: number;
  sourceRow: any[];
  posnrVal: string;
  nameVal: string;
  rplNameVal: string;
  typeOfListVal: string;
  countryVal: string;
  seqNoVal: string;
  isSeqOne: boolean;
  finalNameValue: string;
  nameWasBlanked: boolean;
  statusValue: string;
  matchValue: string;
}

const GENERIC_CORPORATE_STOPWORDS = new Set([
  'the', 'and', 'of', 'for', 'in', 'on', 'at', 'to', 'by', 'with', 'a', 'an', '&',
  'inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited', 'llc', 'co', 'company',
  'sa', 'ag', 'gmbh', 'pvt', 'pty', 'plc', 'bv', 'srl', 'spa', 'group', 'holdings'
]);

/**
 * Compares customer name & RPL data:
 * - If 100% matching (identical after normalizing spacing & punctuation), returns "Exact match".
 * - Otherwise finds common keywords between customer name and RPL data.
 * - If no common keyword, returns "" (blank).
 */
export const findCommonKeywords = (customerName: string, rplName: string): string => {
  const cName = (customerName || '').trim();
  const rpl = (rplName || '').trim();

  if (!cName || !rpl) return '';

  // 1. Check for 100% Exact Match
  const normC = cName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normR = rpl.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normC && normC === normR) {
    return 'Exact match';
  }

  // 2. Tokenize words by whitespace & punctuation
  const tokenize = (str: string) => {
    return str
      .split(/[\s,.;:!?/\\|()[\]{}"'+=_~`@#$%^&*<>]+/)
      .map(w => ({
        original: w,
        clean: w.toLowerCase().replace(/[^a-z0-9]/g, '')
      }))
      .filter(t => t.clean.length > 0);
  };

  const cTokens = tokenize(cName);
  const rplTokens = tokenize(rpl);

  if (cTokens.length === 0 || rplTokens.length === 0) return '';

  const rCleanList = rplTokens.map(t => t.clean);
  const commonCleanWords: string[] = [];
  const commonDisplayWords: string[] = [];
  const seenClean = new Set<string>();

  for (const token of cTokens) {
    if (token.clean.length < 2) continue; // Skip single characters

    // Match exact token or root/stem variation (e.g., technology vs technologies, dynamic vs dynamics)
    const match = rCleanList.find(r => 
      r === token.clean || 
      (token.clean.length >= 4 && r.length >= 4 && (
        token.clean.startsWith(r) || 
        r.startsWith(token.clean) || 
        (token.clean.slice(0, 5) === r.slice(0, 5) && Math.abs(token.clean.length - r.length) <= 3)
      ))
    );

    if (match && !seenClean.has(token.clean)) {
      seenClean.add(token.clean);
      commonCleanWords.push(token.clean);
      commonDisplayWords.push(token.original);
    }
  }

  if (commonDisplayWords.length === 0) return '';

  // Check that at least one meaningful (non-stopword) keyword matched
  const hasMeaningful = commonCleanWords.some(w => !GENERIC_CORPORATE_STOPWORDS.has(w));
  if (!hasMeaningful) return '';

  return commonDisplayWords.join(' ');
};

/**
 * Parses an uploaded Excel/CSV file and applies the Zyme E4H New workflow:
 * 1. Remove duplicates based on [Posnr, Name, RPL name, type of list].
 * 2. In Sequence No column: if number == 1, Name shows data; if other numbers, Name is blank.
 * 3. Status column logic:
 *    - The status column must be blank by default.
 *    - If the name has risk keywords, it reflects as "High risk" in the status column.
 *    - If the country has APRV (matches APRV codes or literally contains APRV), it reflects as "APRV" in the status column.
 *    - If there are keywords like ZEMB or ZKWD in the 'type of list' column in any sequence belonging
 *      to that item, it reflects in the first sequence of the status column (e.g. "ZEMB", "ZKWD").
 *    - Only the first sequence (Sequence No = 1) reflects these findings; all other sequences remain blank.
 * 4. Sort columns into the exact requested order (Column A as status, to Column P as State).
 */
export const processZymeE4hFile = async (
  file: File,
  options?: ZymeE4hOptions
): Promise<ZymeE4hResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
    raw: true,
  });

  const sheetName = options?.selectedSheet || workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('No valid sheet found in the uploaded workbook.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The selected sheet is empty.');
  }

  // 1. Locate Header Row & Column Mapping
  const { headerRowIndex, mapping: detectedMapping } = findHeaderRow(rawRows);
  
  const mapping: ZymeE4hColumnMapping = {
    status: options?.customMapping?.status ?? detectedMapping.status,
    posnr: options?.customMapping?.posnr ?? detectedMapping.posnr,
    sequenceNo: options?.customMapping?.sequenceNo ?? detectedMapping.sequenceNo,
    partnerId: options?.customMapping?.partnerId ?? detectedMapping.partnerId,
    country: options?.customMapping?.country ?? detectedMapping.country,
    name: options?.customMapping?.name ?? detectedMapping.name,
    match: options?.customMapping?.match ?? -1,
    street: options?.customMapping?.street ?? detectedMapping.street,
    city: options?.customMapping?.city ?? detectedMapping.city,
    postalCode: options?.customMapping?.postalCode ?? detectedMapping.postalCode,
    rplName: options?.customMapping?.rplName ?? detectedMapping.rplName,
    typeOfList: options?.customMapping?.typeOfList ?? detectedMapping.typeOfList,
    splId: options?.customMapping?.splId ?? detectedMapping.splId,
    rplScreeningStatus: options?.customMapping?.rplScreeningStatus ?? detectedMapping.rplScreeningStatus,
    rplStreet1: options?.customMapping?.rplStreet1 ?? detectedMapping.rplStreet1,
    rplStreet2: options?.customMapping?.rplStreet2 ?? detectedMapping.rplStreet2,
    state: options?.customMapping?.state ?? detectedMapping.state,
  };

  const headerRow = rawRows[headerRowIndex] || [];
  const rawHeaders: string[] = headerRow.map((cell, idx) => {
    const val = cell !== null && cell !== undefined ? String(cell).trim() : '';
    return val || `Column ${idx + 1}`;
  });

  // Collect which source column indices were mapped to any of the 16 target columns
  const mappedSourceColIndices = new Set<number>();
  Object.values(mapping).forEach(idx => {
    if (idx >= 0) mappedSourceColIndices.add(idx);
  });

  // Identify any unmapped source columns
  const unmappedSourceHeaders: { colIndex: number; headerName: string }[] = [];
  rawHeaders.forEach((h, i) => {
    if (!mappedSourceColIndices.has(i)) {
      unmappedSourceHeaders.push({ colIndex: i, headerName: h });
    }
  });

  // Build target column audits
  const columnAudits: TargetColumnAudit[] = TARGET_ZYME_E4H_COLUMNS.map((target) => {
    const sourceIdx = mapping[target.key as TargetColumnKey];
    const isFound = sourceIdx >= 0 && sourceIdx < rawHeaders.length;
    return {
      key: target.key as TargetColumnKey,
      label: target.label,
      colLetter: target.colLetter,
      outputHeader: target.defaultHeader,
      sourceColIndex: sourceIdx,
      matchedHeaderName: isFound ? rawHeaders[sourceIdx] : 'Generated Column (Blank by Default)',
      isFoundInSource: isFound,
    };
  });

  // Build the final output header row
  // 16 Target sorted headers (Column A through P)
  const sortedHeaders: string[] = TARGET_ZYME_E4H_COLUMNS.map(t => t.defaultHeader);

  // Optionally include remaining source columns after Column P
  const includeRemaining = options?.includeRemainingColumns !== false;
  if (includeRemaining) {
    unmappedSourceHeaders.forEach(unmapped => {
      sortedHeaders.push(unmapped.headerName);
    });
  }

  // 2. Process Data Rows
  const dataRows = rawRows.slice(headerRowIndex + 1);
  const totalOriginalRows = dataRows.length;

  const seenDuplicateKeys = new Set<string>();
  const duplicateAudit: ZymeE4hRowAudit[] = [];
  const keptRowRecords: KeptRowRecord[] = [];

  let duplicatesRemoved = 0;
  let uniqueRowsKept = 0;
  let nameRetainedCount = 0;
  let nameBlankedCount = 0;

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const sourceRow = dataRows[rIdx];
    if (!sourceRow || sourceRow.every(c => c === null || c === undefined || c === '')) {
      // skip pure empty rows
      continue;
    }

    // Extract values for the 4 duplicate-key columns: Posnr, Name, RPL name, type of list
    const posnrVal = mapping.posnr >= 0 ? String(sourceRow[mapping.posnr] ?? '').trim() : '';
    const nameVal = mapping.name >= 0 ? String(sourceRow[mapping.name] ?? '').trim() : '';
    const rplNameVal = mapping.rplName >= 0 ? String(sourceRow[mapping.rplName] ?? '').trim() : '';
    const typeOfListVal = mapping.typeOfList >= 0 ? String(sourceRow[mapping.typeOfList] ?? '').trim() : '';
    const countryVal = mapping.country >= 0 ? String(sourceRow[mapping.country] ?? '').trim() : '';
    const seqNoVal = mapping.sequenceNo >= 0 ? String(sourceRow[mapping.sequenceNo] ?? '').trim() : '';

    // Step A: Duplicate check based on [Posnr, Name, RPL name, type of list]
    const keyCompPosnr = options?.caseSensitiveDuplicates ? posnrVal : posnrVal.toLowerCase();
    const keyCompName = options?.caseSensitiveDuplicates ? nameVal : nameVal.toLowerCase();
    const keyCompRpl = options?.caseSensitiveDuplicates ? rplNameVal : rplNameVal.toLowerCase();
    const keyCompType = options?.caseSensitiveDuplicates ? typeOfListVal : typeOfListVal.toLowerCase();

    const duplicateCompositeKey = `${keyCompPosnr}__##__${keyCompName}__##__${keyCompRpl}__##__${keyCompType}`;

    if (seenDuplicateKeys.has(duplicateCompositeKey)) {
      duplicatesRemoved++;
      duplicateAudit.push({
        rowIndex: headerRowIndex + 1 + rIdx + 1, // 1-indexed sheet row
        posnr: posnrVal,
        name: nameVal,
        rplName: rplNameVal,
        typeOfList: typeOfListVal,
        sequenceNo: seqNoVal,
        status: '',
        isDuplicate: true,
        nameBlanked: false,
        originalName: nameVal,
      });
      continue; // Remove duplicate row
    }

    // Mark as seen
    seenDuplicateKeys.add(duplicateCompositeKey);
    uniqueRowsKept++;

    // Step B: Check Sequence No logic on Name column:
    // "where if the number is 1 then the name column should show data , if other numbers , it should be blank"
    let finalNameValue = nameVal;
    let nameWasBlanked = false;
    let isSeqOne = false;

    if (mapping.sequenceNo >= 0) {
      const rawSeqVal = sourceRow[mapping.sequenceNo];
      isSeqOne = isSequenceNumberOne(rawSeqVal);

      if (isSeqOne) {
        finalNameValue = mapping.name >= 0 ? (sourceRow[mapping.name] ?? '') : nameVal;
        nameRetainedCount++;
      } else {
        finalNameValue = '';
        nameWasBlanked = true;
        nameBlankedCount++;
      }
    } else {
      isSeqOne = true;
      nameRetainedCount++;
    }

    keptRowRecords.push({
      sheetRowIndex: headerRowIndex + 1 + rIdx + 1,
      sourceRow,
      posnrVal,
      nameVal,
      rplNameVal,
      typeOfListVal,
      countryVal,
      seqNoVal,
      isSeqOne,
      finalNameValue,
      nameWasBlanked,
      statusValue: '', // computed in step C below
      matchValue: '',  // computed in step C below
    });
  }

  // Step C: Sequence Grouping & Status Column Rule:
  // - "the status column must be blank"
  // - "if the name has risk keywords then it should show as High risk"
  // - "if the country has APRV it should show as APRV in status"
  // - "if there is keywords like ZEMB or ZKWD in type of list column, then where ever that sequence belongs to
  //    for example the keyword is in 3rd seq , then it should relect in first sequence of status column"
  
  // Group kept rows into sequence clusters
  const sequenceGroups: KeptRowRecord[][] = [];
  let currentGroup: KeptRowRecord[] = [];
  let currentGroupPosnr: string | null = null;

  for (const record of keptRowRecords) {
    const isOne = record.isSeqOne;
    const posnrChanged = currentGroupPosnr !== null && record.posnrVal !== '' && record.posnrVal !== currentGroupPosnr;

    if ((isOne || posnrChanged) && currentGroup.length > 0) {
      sequenceGroups.push(currentGroup);
      currentGroup = [];
    }

    currentGroup.push(record);
    if (record.posnrVal !== '') {
      currentGroupPosnr = record.posnrVal;
    }
  }
  if (currentGroup.length > 0) {
    sequenceGroups.push(currentGroup);
  }

  // Determine active risk keywords and APRV codes
  const effectiveRiskKeywords = (options?.highRiskKeywords && options.highRiskKeywords.length > 0)
    ? options.highRiskKeywords
    : DEFAULT_RISK_KEYWORDS;

  const effectiveAprvCodes = (options?.aprvCodes && options.aprvCodes.length > 0)
    ? options.aprvCodes
    : DEFAULT_APRV_CODES;

  let statusKeywordsFlaggedCount = 0;
  let highRiskFlaggedCount = 0;
  let aprvFlaggedCount = 0;
  let exactMatchCount = 0;
  let keywordMatchCount = 0;

  for (const group of sequenceGroups) {
    const statusTags: string[] = [];

    // 1. High risk check in Name
    // "if the name has risk keywords then it should show as High risk"
    const hasRisk = group.some(record => {
      const nameToCheck = (record.nameVal || '').trim().toLowerCase();
      if (!nameToCheck) return false;
      return effectiveRiskKeywords.some(kw => {
        const kwTrim = (kw || '').trim().toLowerCase();
        return kwTrim.length > 0 && nameToCheck.includes(kwTrim);
      });
    });

    if (hasRisk) {
      statusTags.push('High risk');
      highRiskFlaggedCount++;
    }

    // 2. APRV check in Country
    // "if the country has APRV it should show as APRV in status"
    const hasAprv = group.some(record => {
      const rawCountry = record.countryVal ? record.countryVal.trim().toUpperCase() : '';
      if (!rawCountry) return false;
      // Literal APRV match
      if (rawCountry === 'APRV' || rawCountry.includes('APRV')) return true;
      // APRV country codes match (e.g. 'RU', 'UA', etc.)
      return effectiveAprvCodes.some(code => {
        const cTrim = (code || '').trim().toUpperCase();
        return cTrim.length > 0 && (rawCountry === cTrim || rawCountry.startsWith(cTrim + ' ') || rawCountry.endsWith(' ' + cTrim));
      });
    });

    if (hasAprv) {
      statusTags.push('APRV');
      aprvFlaggedCount++;
    }

    // 3. ZEMB / ZKWD in Type of List
    // "if there is keywords like ZEMB or ZKWD in type of list column, then where ever that sequence belongs to
    // for example the keyword is in 3rd seq , then it should relect in first sequence of status column"
    for (const record of group) {
      const t = String(record.typeOfListVal || '').trim().toUpperCase();
      if (t.includes('ZEMB') && !statusTags.includes('ZEMB')) {
        statusTags.push('ZEMB');
      }
      if (t.includes('ZKWD') && !statusTags.includes('ZKWD')) {
        statusTags.push('ZKWD');
      }
      if (options?.statusKeywords) {
        for (const kw of options.statusKeywords) {
          const kwUpper = kw.trim().toUpperCase();
          if (kwUpper && t.includes(kwUpper) && !statusTags.includes(kwUpper)) {
            statusTags.push(kwUpper);
          }
        }
      }
    }

    const groupStatus = statusTags.join(', ');
    if (groupStatus) {
      statusKeywordsFlaggedCount++;
    }

    // Assign status:
    // First sequence reflects the keyword(s).
    // All other sequences must have status column as blank.
    let assignedFirstSeq = false;
    for (const record of group) {
      if (record.isSeqOne) {
        record.statusValue = groupStatus;
        assignedFirstSeq = true;
      } else {
        record.statusValue = '';
      }
    }

    // Fallback: If no record had isSeqOne == true in this cluster, assign to the first record of the group
    if (!assignedFirstSeq && group.length > 0) {
      group[0].statusValue = groupStatus;
    }

    // 4. Calculate Match column (for Sheet 2):
    // "which compares customer name & rpl data & find the common keyword & display it , if it matching 100% , its should show as Exact match"
    // Get the customer name for the entire item cluster
    const groupCustomerName = group.find(r => (r.nameVal || '').trim())?.nameVal || '';

    for (const record of group) {
      const customerName = (record.nameVal || '').trim() || groupCustomerName;
      const matchResult = findCommonKeywords(customerName, record.rplNameVal);
      record.matchValue = matchResult;

      if (matchResult === 'Exact match') {
        exactMatchCount++;
      } else if (matchResult) {
        keywordMatchCount++;
      }
    }
  }

  // Step D: Build final sorted rows for Sheet 1 and Sheet 2
  const processedRows: any[][] = [sortedHeaders]; // Sheet 1 rows

  // Sheet 2 Headers: Status, Posnr, Sequence No, Partner ID, Country, Name, Match, RPLname, Street, ...
  const sheet2SortedHeaders: string[] = TARGET_ZYME_E4H_SHEET2_COLUMNS.map(t => t.defaultHeader);
  if (includeRemaining) {
    unmappedSourceHeaders.forEach(unmapped => {
      sheet2SortedHeaders.push(unmapped.headerName);
    });
  }
  const sheet2ProcessedRows: any[][] = [sheet2SortedHeaders]; // Sheet 2 rows

  for (const record of keptRowRecords) {
    const sourceRow = record.sourceRow;
    
    // --- BUILD SHEET 1 ROW ---
    const sortedRow: any[] = [];
    // Target Column A: Status (Calculated via keyword sequence rule)
    sortedRow.push(record.statusValue);
    // Target Column B: Posnr
    sortedRow.push(mapping.posnr >= 0 ? (sourceRow[mapping.posnr] ?? '') : '');
    // Target Column C: Sequence No
    sortedRow.push(mapping.sequenceNo >= 0 ? (sourceRow[mapping.sequenceNo] ?? '') : '');
    // Target Column D: Partner ID
    sortedRow.push(mapping.partnerId >= 0 ? (sourceRow[mapping.partnerId] ?? '') : '');
    // Target Column E: Country
    sortedRow.push(mapping.country >= 0 ? (sourceRow[mapping.country] ?? '') : '');
    // Target Column F: Name (with Sequence No conditional blanking applied)
    sortedRow.push(record.finalNameValue);
    // Target Column G: Street
    sortedRow.push(mapping.street >= 0 ? (sourceRow[mapping.street] ?? '') : '');
    // Target Column H: City
    sortedRow.push(mapping.city >= 0 ? (sourceRow[mapping.city] ?? '') : '');
    // Target Column I: Postal Code
    sortedRow.push(mapping.postalCode >= 0 ? (sourceRow[mapping.postalCode] ?? '') : '');
    // Target Column J: RPLname
    sortedRow.push(mapping.rplName >= 0 ? (sourceRow[mapping.rplName] ?? '') : '');
    // Target Column K: Type of List
    sortedRow.push(mapping.typeOfList >= 0 ? (sourceRow[mapping.typeOfList] ?? '') : '');
    // Target Column L: SPL Id
    sortedRow.push(mapping.splId >= 0 ? (sourceRow[mapping.splId] ?? '') : '');
    // Target Column M: RPL Screening Status
    sortedRow.push(mapping.rplScreeningStatus >= 0 ? (sourceRow[mapping.rplScreeningStatus] ?? '') : '');
    // Target Column N: RplStreet1
    sortedRow.push(mapping.rplStreet1 >= 0 ? (sourceRow[mapping.rplStreet1] ?? '') : '');
    // Target Column O: RplStreet1 (2nd street column)
    sortedRow.push(mapping.rplStreet2 >= 0 ? (sourceRow[mapping.rplStreet2] ?? '') : '');
    // Target Column P: State
    sortedRow.push(mapping.state >= 0 ? (sourceRow[mapping.state] ?? '') : '');

    // Append any unmapped remaining source columns if enabled
    if (includeRemaining) {
      unmappedSourceHeaders.forEach(unmapped => {
        sortedRow.push(sourceRow[unmapped.colIndex] ?? '');
      });
    }
    processedRows.push(sortedRow);

    // --- BUILD SHEET 2 ROW ---
    // "sheet 2 must have status ,name & rpl data same as in first sheet format , but i need a column in between name & rpl called match"
    const sheet2Row: any[] = [];
    // Col A: status (same as in first sheet format)
    sheet2Row.push(record.statusValue);
    // Col B: Posnr
    sheet2Row.push(mapping.posnr >= 0 ? (sourceRow[mapping.posnr] ?? '') : '');
    // Col C: Sequence No
    sheet2Row.push(mapping.sequenceNo >= 0 ? (sourceRow[mapping.sequenceNo] ?? '') : '');
    // Col D: Partner ID
    sheet2Row.push(mapping.partnerId >= 0 ? (sourceRow[mapping.partnerId] ?? '') : '');
    // Col E: Country
    sheet2Row.push(mapping.country >= 0 ? (sourceRow[mapping.country] ?? '') : '');
    // Col F: Name (same as in first sheet format)
    sheet2Row.push(record.finalNameValue);
    // Col G: match (compares customer name & rpl data, finds common keyword or Exact match)
    sheet2Row.push(record.matchValue);
    // Col H: RPLname (rpl data same as in first sheet format)
    sheet2Row.push(mapping.rplName >= 0 ? (sourceRow[mapping.rplName] ?? '') : '');
    // Col I: Street
    sheet2Row.push(mapping.street >= 0 ? (sourceRow[mapping.street] ?? '') : '');
    // Col J: City
    sheet2Row.push(mapping.city >= 0 ? (sourceRow[mapping.city] ?? '') : '');
    // Col K: Postal Code
    sheet2Row.push(mapping.postalCode >= 0 ? (sourceRow[mapping.postalCode] ?? '') : '');
    // Col L: Type of List
    sheet2Row.push(mapping.typeOfList >= 0 ? (sourceRow[mapping.typeOfList] ?? '') : '');
    // Col M: SPL Id
    sheet2Row.push(mapping.splId >= 0 ? (sourceRow[mapping.splId] ?? '') : '');
    // Col N: RPL Screening Status
    sheet2Row.push(mapping.rplScreeningStatus >= 0 ? (sourceRow[mapping.rplScreeningStatus] ?? '') : '');
    // Col O: RplStreet1
    sheet2Row.push(mapping.rplStreet1 >= 0 ? (sourceRow[mapping.rplStreet1] ?? '') : '');
    // Col P: RplStreet1 (2nd street column)
    sheet2Row.push(mapping.rplStreet2 >= 0 ? (sourceRow[mapping.rplStreet2] ?? '') : '');
    // Col Q: State
    sheet2Row.push(mapping.state >= 0 ? (sourceRow[mapping.state] ?? '') : '');

    if (includeRemaining) {
      unmappedSourceHeaders.forEach(unmapped => {
        sheet2Row.push(sourceRow[unmapped.colIndex] ?? '');
      });
    }
    sheet2ProcessedRows.push(sheet2Row);

    duplicateAudit.push({
      rowIndex: record.sheetRowIndex,
      posnr: record.posnrVal,
      name: record.finalNameValue,
      match: record.matchValue,
      rplName: record.rplNameVal,
      typeOfList: record.typeOfListVal,
      sequenceNo: record.seqNoVal,
      status: record.statusValue,
      isDuplicate: false,
      nameBlanked: record.nameWasBlanked,
      originalName: record.nameVal,
    });
  }

  // 3. Build Clean Excel Output Workbook with Sheet 1 & Sheet 2
  const outWb = XLSX.utils.book_new();

  // Sheet 1
  const outWs = XLSX.utils.aoa_to_sheet(processedRows);
  const colWidths = sortedHeaders.map((hdr, colI) => {
    let maxLen = hdr.length;
    const sampleRows = Math.min(processedRows.length, 150);
    for (let r = 1; r < sampleRows; r++) {
      const cellVal = processedRows[r]?.[colI];
      if (cellVal !== null && cellVal !== undefined) {
        const len = String(cellVal).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 11), 40) };
  });
  outWs['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(outWb, outWs, 'Sheet 1');

  // Sheet 2: With match column in between name & rpl
  const sheet2Ws = XLSX.utils.aoa_to_sheet(sheet2ProcessedRows);
  const sheet2ColWidths = sheet2SortedHeaders.map((hdr, colI) => {
    let maxLen = hdr.length;
    const sampleRows = Math.min(sheet2ProcessedRows.length, 150);
    for (let r = 1; r < sampleRows; r++) {
      const cellVal = sheet2ProcessedRows[r]?.[colI];
      if (cellVal !== null && cellVal !== undefined) {
        const len = String(cellVal).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 11), 40) };
  });
  sheet2Ws['!cols'] = sheet2ColWidths;
  XLSX.utils.book_append_sheet(outWb, sheet2Ws, 'Sheet 2');

  const excelBuf = XLSX.write(outWb, { bookType: 'xlsx', type: 'array' });
  const excelUint8 = new Uint8Array(excelBuf);

  // 4. Build CSV representations
  const csvContent = XLSX.utils.sheet_to_csv(outWs);
  const sheet2CsvContent = XLSX.utils.sheet_to_csv(sheet2Ws);

  return {
    fileName: file.name,
    sheetName,
    totalOriginalRows,
    duplicatesRemoved,
    uniqueRowsKept,
    nameRetainedCount,
    nameBlankedCount,
    statusKeywordsFlaggedCount,
    highRiskFlaggedCount,
    aprvFlaggedCount,
    exactMatchCount,
    keywordMatchCount,
    headers: sortedHeaders,
    sheet2Headers: sheet2SortedHeaders,
    columnAudits,
    unmappedSourceHeaders,
    processedRows,
    sheet2ProcessedRows,
    duplicateAudit,
    previewRows: processedRows.slice(0, 101), // Header + 100 rows
    sheet2PreviewRows: sheet2ProcessedRows.slice(0, 101), // Header + 100 rows
    excelBuffer: excelUint8,
    csvContent,
    sheet2CsvContent,
  };
};
