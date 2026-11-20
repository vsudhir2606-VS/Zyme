import * as XLSX from 'xlsx';
import { saveRplMatchConfigToDB, getRplMatchConfigFromDB } from './db.ts';
import {
  streamSpreadsheetRows,
  sniffFileFormat,
  buildFastXlsxBlob,
  triggerBlobDownload,
} from './fastSpreadsheetStream.ts';

export interface RplMatchConfig {
  listEntries: string[];
  fileName: string | null;
  updatedAt: string | null;
  ignoredWords: string[];
  ignoreCaseCity: boolean;
}

export type RplMatchTier = 'exact' | 'potential' | 'none';

export interface RplListMatchResult {
  status: RplMatchTier;
  score: number; // 0 - 100
  matchedEntry: string;
  matchedKeywords: string[];
}

export const DEFAULT_IGNORED_GENERIC_WORDS: string[] = [
  'Technology',
  'Technologies',
  'Tech',
  'LLC',
  'Inc',
  'PVT',
  'Private',
  'Development',
  'Developments',
  'Ltd',
  'Limited',
  'Corp',
  'Corporation',
  'Co',
  'Company',
  'Group',
  'Solutions',
  'Services',
  'Systems',
  'International',
  'Global',
  'Industries',
  'Enterprise',
  'Enterprises',
  'Trading',
  'Holdings',
  'GmbH',
  'Pte',
  'LLP',
  'PLC',
  'SA',
  'BV',
  'AG',
  'The',
  'And',
  'Of',
  'For',
];

export const DEFAULT_IGNORED_CITY_WORDS: string[] = [
  'New York',
  'London',
  'Tokyo',
  'Beijing',
  'Shanghai',
  'Shenzhen',
  'Guangzhou',
  'Hong Kong',
  'Singapore',
  'Dubai',
  'Abu Dhabi',
  'Moscow',
  'St Petersburg',
  'Mumbai',
  'Delhi',
  'New Delhi',
  'Bangalore',
  'Bengaluru',
  'Chennai',
  'Hyderabad',
  'Pune',
  'Kolkata',
  'Noida',
  'Gurgaon',
  'Ahmedabad',
  'Paris',
  'Berlin',
  'Munich',
  'Frankfurt',
  'Hamburg',
  'Madrid',
  'Barcelona',
  'Rome',
  'Milan',
  'Amsterdam',
  'Rotterdam',
  'Brussels',
  'Zurich',
  'Geneva',
  'Vienna',
  'Warsaw',
  'Prague',
  'Istanbul',
  'Ankara',
  'Seoul',
  'Busan',
  'Taipei',
  'Bangkok',
  'Jakarta',
  'Manila',
  'Hanoi',
  'Ho Chi Minh',
  'Kuala Lumpur',
  'Sydney',
  'Melbourne',
  'Brisbane',
  'Toronto',
  'Vancouver',
  'Montreal',
  'Ottawa',
  'Chicago',
  'Houston',
  'Dallas',
  'Austin',
  'Seattle',
  'Boston',
  'San Francisco',
  'Los Angeles',
  'Miami',
  'Atlanta',
  'Denver',
  'Phoenix',
  'Washington',
  'San Jose',
  'San Diego',
  'Philadelphia',
  'Detroit',
  'Tehran',
  'Damascus',
  'Minsk',
  'Kyiv',
  'Kiev',
  'Caracas',
  'Havana',
  'Pyongyang',
  'Riyadh',
  'Jeddah',
  'Doha',
  'Cairo',
  'Johannesburg',
  'Cape Town',
  'Sao Paulo',
  'Rio de Janeiro',
  'Mexico City',
  'Buenos Aires',
  'Bogota',
  'Lima',
  'Santiago',
  'Lagos',
  'Nairobi',
  'Karachi',
  'Lahore',
  'Dhaka',
  'Colombo',
  'Osaka',
  'Nagoya',
  'Chengdu',
  'Wuhan',
  'Hangzhou',
  'Nanjing',
  'Tianjin',
  'Suzhou',
  'Xian',
  'Chongqing',
  'Dublin',
  'Stockholm',
  'Oslo',
  'Copenhagen',
  'Helsinki',
  'Lisbon',
  'Athens',
  'Budapest',
  'Bucharest',
];

export const DEFAULT_IGNORED_WORDS: string[] = [
  ...DEFAULT_IGNORED_GENERIC_WORDS,
  ...DEFAULT_IGNORED_CITY_WORDS,
];

const STORAGE_KEY = 'zyme_rpl_match_config_v1';

let memoryCache: RplMatchConfig | null = null;

export function getDefaultRplMatchConfig(): RplMatchConfig {
  return {
    listEntries: [],
    fileName: null,
    updatedAt: null,
    ignoredWords: [...DEFAULT_IGNORED_WORDS],
    ignoreCaseCity: true,
  };
}

function sanitizeConfig(raw: any): RplMatchConfig {
  const defaults = getDefaultRplMatchConfig();
  if (!raw || typeof raw !== 'object') return defaults;

  const listEntries = Array.isArray(raw.listEntries)
    ? raw.listEntries.map((v: any) => String(v ?? '').trim()).filter(Boolean)
    : [];

  const ignoredWords = Array.isArray(raw.ignoredWords)
    ? raw.ignoredWords.map((v: any) => String(v ?? '').trim()).filter(Boolean)
    : defaults.ignoredWords;

  return {
    listEntries,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    ignoredWords,
    ignoreCaseCity: typeof raw.ignoreCaseCity === 'boolean' ? raw.ignoreCaseCity : true,
  };
}

export function getRplMatchConfig(): RplMatchConfig {
  if (memoryCache) return memoryCache;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeConfig(JSON.parse(raw));
        memoryCache = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read RPL match config from localStorage:', err);
  }
  memoryCache = getDefaultRplMatchConfig();
  return memoryCache;
}

export async function saveRplMatchConfig(config: RplMatchConfig): Promise<RplMatchConfig> {
  const clean = sanitizeConfig(config);
  memoryCache = clean;

  // Persist to localStorage (graceful fallback if Excel list exceeds quota)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
  } catch {
    try {
      if (typeof localStorage !== 'undefined') {
        // Save settings/ignored words even if huge list exceeded localStorage 5MB limit
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...clean,
            listEntries: clean.listEntries.slice(0, 2000),
          })
        );
      }
    } catch {
      // ignore quota error — IndexedDB and server hold the complete list
    }
  }

  // Persist to IndexedDB
  saveRplMatchConfigToDB(clean).catch(() => {});

  // Notify listeners immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zyme:rpl-match-config-updated', { detail: clean }));
  }

  // Persist to backend filesystem
  try {
    if (typeof fetch !== 'undefined') {
      await fetch('/api/save-rpl-match-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: clean }),
      });
    }
  } catch (err) {
    console.warn('Could not persist RPL match config to server:', err);
  }

  return clean;
}

export async function syncRplMatchConfigWithServer(): Promise<RplMatchConfig> {
  let current = getRplMatchConfig();

  // Check IndexedDB first (holds full list even if localStorage was capped)
  try {
    const idb = await getRplMatchConfigFromDB();
    if (idb && typeof idb === 'object') {
      const sanitizedIdb = sanitizeConfig(idb);
      if (sanitizedIdb.listEntries.length >= current.listEntries.length) {
        current = sanitizedIdb;
        memoryCache = current;
      }
    }
  } catch {
    // ignore IDB error
  }

  try {
    if (typeof fetch !== 'undefined') {
      const res = await fetch('/api/get-rpl-match-config');
      if (res.ok) {
        const data = await res.json();
        if (data && data.config) {
          const serverConfig = sanitizeConfig(data.config);
          // Prefer whichever has newer updatedAt or non-empty list when local is empty
          const serverHasData = serverConfig.listEntries.length > 0 || serverConfig.updatedAt !== null;
          const localHasData = current.listEntries.length > 0 || current.updatedAt !== null;

          if (serverHasData && (!localHasData || (serverConfig.updatedAt || '') >= (current.updatedAt || ''))) {
            current = serverConfig;
            memoryCache = current;
            saveRplMatchConfigToDB(current).catch(() => {});
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            } catch {
              // ignore quota error
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('zyme:rpl-match-config-updated', { detail: current }));
            }
          } else if (localHasData && !serverHasData) {
            // Sync local config up to server
            fetch('/api/save-rpl-match-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ config: current }),
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error syncing RPL match config with server:', err);
  }

  return current;
}

const HEADER_LIKE_WORDS = new Set([
  'name',
  'rpl',
  'rplname',
  'rpl name',
  'entity',
  'entity name',
  'company',
  'company name',
  'customer',
  'customer name',
  'sanctioned name',
  'sanction name',
  'denied party',
  'party name',
  'list name',
  'match name',
  'matching name',
  'alias',
  'organization',
  'organisation',
]);

export async function importRplMatchListFromExcel(
  file: File
): Promise<{ count: number; entries: string[]; fileName: string; detectedColumn: string }> {
  const format = await sniffFileFormat(file);
  let rows: any[][] = [];

  if (format === 'xlsx' || format === 'csv') {
    await streamSpreadsheetRows(
      file,
      (row) => {
        rows.push(row);
      },
      { maxCols: 50 }
    );
  } else {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array', cellHTML: false, cellFormula: false });
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    if (!ws) throw new Error('Spreadsheet appears to be empty.');
    rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  }

  if (!rows || rows.length === 0) {
    throw new Error('The uploaded file contains no rows.');
  }

  // Find first non-empty row
  let firstRowIdx = 0;
  while (
    firstRowIdx < Math.min(rows.length, 15) &&
    (!rows[firstRowIdx] || rows[firstRowIdx].every((c) => String(c ?? '').trim() === ''))
  ) {
    firstRowIdx++;
  }

  const firstRow = rows[firstRowIdx] || [];
  let targetColIdx = -1;
  let detectedColumn = 'Column A';
  let hasHeaderRow = false;

  // Priority 1: header matching RPL name / Entity name / Name
  for (let c = 0; c < firstRow.length; c++) {
    const hRaw = String(firstRow[c] ?? '').trim();
    const hClean = hRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      hClean === 'rplname' ||
      hClean === 'rpl' ||
      hClean === 'sanctionedname' ||
      hClean === 'entityname' ||
      hClean === 'deniedparty' ||
      hClean === 'matchname'
    ) {
      targetColIdx = c;
      detectedColumn = hRaw;
      hasHeaderRow = true;
      break;
    }
  }

  // Priority 2: any header with 'name' or 'entity' or 'company' (excluding street/city/status/id)
  if (targetColIdx === -1) {
    for (let c = 0; c < firstRow.length; c++) {
      const hRaw = String(firstRow[c] ?? '').trim();
      const hClean = hRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        (hClean.includes('name') || hClean.includes('entity') || hClean.includes('company') || hClean.includes('party')) &&
        !hClean.includes('file') &&
        !hClean.includes('sheet') &&
        !hClean.includes('street') &&
        !hClean.includes('city')
      ) {
        targetColIdx = c;
        detectedColumn = hRaw;
        hasHeaderRow = true;
        break;
      }
    }
  }

  // Priority 3: first column with non-empty text
  if (targetColIdx === -1) {
    for (let c = 0; c < Math.max(firstRow.length, 1); c++) {
      const val = String(firstRow[c] ?? '').trim();
      if (val) {
        targetColIdx = c;
        if (HEADER_LIKE_WORDS.has(val.toLowerCase())) {
          detectedColumn = val;
          hasHeaderRow = true;
        } else {
          detectedColumn = `Column ${String.fromCharCode(65 + (c % 26))}`;
          hasHeaderRow = false;
        }
        break;
      }
    }
  }

  if (targetColIdx === -1) targetColIdx = 0;

  const seen = new Set<string>();
  const entries: string[] = [];
  const startRow = hasHeaderRow ? firstRowIdx + 1 : firstRowIdx;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || targetColIdx >= row.length) continue;
    const val = String(row[targetColIdx] ?? '').trim();
    if (!val) continue;
    const key = val.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) {
      seen.add(key);
      entries.push(val);
    }
  }

  if (entries.length === 0) {
    throw new Error('No valid names were found in the uploaded Excel file.');
  }

  return {
    count: entries.length,
    entries,
    fileName: file.name,
    detectedColumn,
  };
}

export async function exportRplMatchListToExcel(entries: string[], fileName?: string | null): Promise<boolean> {
  if (!entries || entries.length === 0) return false;
  const blob = await buildFastXlsxBlob({
    name: 'RPL_Match_List',
    headers: ['RPL Name'],
    rows: entries.map((e) => [e]),
    colWidths: [48],
  });
  const base = (fileName || 'RPL_Match_List').replace(/\.[^/.]+$/, '');
  triggerBlobDownload(blob, `${base}_Export.xlsx`);
  return true;
}

// ============================================================
// HIGH-SPEED NORMALIZATION & MATCHING ENGINE (51% + EXACT)
// ============================================================

const normalizeTextBasic = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Keep memory tiny with single rolling array
  const prev = new Int32Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    let diag = prev[0];
    prev[0] = i;
    const chA = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const temp = prev[j];
      const cost = chA === b.charCodeAt(j - 1) ? 0 : 1;
      let val = prev[j] + 1; // deletion
      const ins = prev[j - 1] + 1; // insertion
      const sub = diag + cost; // substitution
      if (ins < val) val = ins;
      if (sub < val) val = sub;
      prev[j] = val;
      diag = temp;
    }
  }
  return prev[lb];
};

const charSimilarityPct = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  // Fast length-ratio lower bound prune: if length difference alone forces <= 51%, skip DP
  if (Math.min(a.length, b.length) / maxLen <= 0.51) return 0;
  const dist = levenshteinDistance(a, b);
  return ((maxLen - dist) / maxLen) * 100;
};

interface PreparedIgnoredFilter {
  singleWords: Set<string>;
  multiWordPhrases: string[][];
}

const buildIgnoredFilter = (ignoredWords: string[]): PreparedIgnoredFilter => {
  const singleWords = new Set<string>();
  const multiWordPhrases: string[][] = [];

  for (let i = 0; i < ignoredWords.length; i++) {
    const norm = normalizeTextBasic(ignoredWords[i]);
    if (!norm) continue;
    const parts = norm.split(' ').filter(Boolean);
    if (parts.length === 1) {
      singleWords.add(parts[0]);
    } else if (parts.length > 1) {
      multiWordPhrases.push(parts);
    }
  }

  // Sort multi-word phrases longest-first so longer city names strip cleanly first
  multiWordPhrases.sort((a, b) => b.length - a.length);
  return { singleWords, multiWordPhrases };
};

const extractMeaningfulTokens = (
  text: string,
  filter: PreparedIgnoredFilter,
  extraCity?: string
): string[] => {
  const norm = normalizeTextBasic(text);
  if (!norm) return [];

  let tokens = norm.split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  // Strip multi-word ignored phrases (e.g. "new york", "hong kong", "san francisco")
  if (filter.multiWordPhrases.length > 0 && tokens.length >= 2) {
    for (let p = 0; p < filter.multiWordPhrases.length; p++) {
      const phrase = filter.multiWordPhrases[p];
      const pLen = phrase.length;
      if (tokens.length < pLen) continue;
      const next: string[] = [];
      let i = 0;
      while (i < tokens.length) {
        if (i + pLen <= tokens.length) {
          let matchAll = true;
          for (let k = 0; k < pLen; k++) {
            if (tokens[i + k] !== phrase[k]) {
              matchAll = false;
              break;
            }
          }
          if (matchAll) {
            i += pLen;
            continue;
          }
        }
        next.push(tokens[i]);
        i++;
      }
      tokens = next;
    }
  }

  // Optional dynamic case-city tokens to strip
  let extraCityTokens: Set<string> | null = null;
  if (extraCity) {
    const cNorm = normalizeTextBasic(extraCity);
    if (cNorm) {
      const cParts = cNorm.split(' ').filter((w) => w.length >= 2);
      if (cParts.length > 0) {
        extraCityTokens = new Set(cParts);
      }
    }
  }

  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.length < 2) continue;
    if (filter.singleWords.has(t)) continue;
    if (extraCityTokens && extraCityTokens.has(t)) continue;
    out.push(t);
  }
  return out;
};

interface IndexedExcelEntry {
  original: string;
  rawNorm: string;
  cleanStr: string;
  tokens: string[];
  uniqueTokens: string[];
  tokenSet: Set<string>;
}

export interface RplMatchEngine {
  hasExcelList: boolean;
  entryCount: number;
  matchRplAgainstList: (rplName: string, extraCity?: string) => RplListMatchResult;
  findCustomerRplMatch: (
    customerName: string,
    rplName: string,
    extraCity?: string
  ) => { isExact: boolean; keywords: string[] };
  filterExistingMatchKeywords: (rawMatchStr: string, extraCity?: string) => string[];
}

export function createRplMatchEngine(
  listEntries: string[],
  ignoredWords: string[]
): RplMatchEngine {
  const filter = buildIgnoredFilter(ignoredWords);
  const entries: IndexedExcelEntry[] = [];
  const exactRawMap = new Map<string, IndexedExcelEntry>();
  const exactCleanMap = new Map<string, IndexedExcelEntry>();
  const tokenIndex = new Map<string, number[]>();
  const shortTokenIndex = new Map<string, number[]>(); // Entries with <= 2 unique tokens (for 1-hit >51% Dice cases)
  const prefixIndex = new Map<string, number[]>();

  for (let i = 0; i < listEntries.length; i++) {
    const original = (listEntries[i] || '').trim();
    if (!original) continue;
    const rawNorm = normalizeTextBasic(original);
    if (!rawNorm) continue;

    const tokens = extractMeaningfulTokens(original, filter);
    const cleanStr = tokens.join(' ');
    const tokenSet = new Set(tokens);
    const uniqueTokens = Array.from(tokenSet);

    const idx = entries.length;
    const item: IndexedExcelEntry = {
      original,
      rawNorm,
      cleanStr,
      tokens,
      uniqueTokens,
      tokenSet,
    };
    entries.push(item);

    if (!exactRawMap.has(rawNorm)) {
      exactRawMap.set(rawNorm, item);
    }
    if (cleanStr && !exactCleanMap.has(cleanStr)) {
      exactCleanMap.set(cleanStr, item);
    }

    // Build inverted token index + short-entry index + 3-char prefix index
    for (let t = 0; t < uniqueTokens.length; t++) {
      const tok = uniqueTokens[t];
      let bucket = tokenIndex.get(tok);
      if (!bucket) {
        bucket = [];
        tokenIndex.set(tok, bucket);
      }
      bucket.push(idx);

      if (uniqueTokens.length <= 2) {
        let sBucket = shortTokenIndex.get(tok);
        if (!sBucket) {
          sBucket = [];
          shortTokenIndex.set(tok, sBucket);
        }
        sBucket.push(idx);
      }

      if (tok.length >= 3) {
        const pref = tok.slice(0, 3);
        let pBucket = prefixIndex.get(pref);
        if (!pBucket) {
          pBucket = [];
          prefixIndex.set(pref, pBucket);
        }
        pBucket.push(idx);
      }
    }
  }

  // Memoize unique (rplName + extraCity) lookups so 50,000 rows run instantaneously
  const rplResultCache = new Map<string, RplListMatchResult>();

  const matchRplAgainstList = (rplName: string, extraCity?: string): RplListMatchResult => {
    if (entries.length === 0 || !rplName || !rplName.trim()) {
      return { status: 'none', score: 0, matchedEntry: '', matchedKeywords: [] };
    }

    const cacheKey = extraCity ? `${rplName}\u0000${extraCity}` : rplName;
    const cached = rplResultCache.get(cacheKey);
    if (cached) return cached;

    const rawNorm = normalizeTextBasic(rplName);
    if (!rawNorm) {
      const empty: RplListMatchResult = { status: 'none', score: 0, matchedEntry: '', matchedKeywords: [] };
      rplResultCache.set(cacheKey, empty);
      return empty;
    }

    const tokens = extractMeaningfulTokens(rplName, filter, extraCity);
    const cleanStr = tokens.join(' ');

    // 1. Exact Match (raw normalized match OR exact match after stripping ignored words/cities)
    const rawExact = exactRawMap.get(rawNorm);
    if (rawExact) {
      const res: RplListMatchResult = {
        status: 'exact',
        score: 100,
        matchedEntry: rawExact.original,
        matchedKeywords: tokens.length > 0 ? Array.from(new Set(tokens)).map((t) => t.toUpperCase()) : [rawExact.original],
      };
      rplResultCache.set(cacheKey, res);
      return res;
    }

    if (cleanStr) {
      const cleanExact = exactCleanMap.get(cleanStr);
      if (cleanExact) {
        const res: RplListMatchResult = {
          status: 'exact',
          score: 100,
          matchedEntry: cleanExact.original,
          matchedKeywords: Array.from(new Set(tokens)).map((t) => t.toUpperCase()),
        };
        rplResultCache.set(cacheKey, res);
        return res;
      }
    }

    // If all words in the RPL name were ignored words (e.g. "Technology LLC" or just a city name), do NOT match!
    if (tokens.length === 0) {
      const noneRes: RplListMatchResult = { status: 'none', score: 0, matchedEntry: '', matchedKeywords: [] };
      rplResultCache.set(cacheKey, noneRes);
      return noneRes;
    }

    // 2. Gather candidate indices from inverted index with mathematical >51% pruning
    const candidateSet = new Set<number>();
    const uniqueRplTokens = Array.from(new Set(tokens));
    const K = uniqueRplTokens.length;
    const LARGE_BUCKET_LIMIT = 250;
    const largeBuckets: number[][] = [];

    for (let i = 0; i < K; i++) {
      const tok = uniqueRplTokens[i];
      const exactBucket = tokenIndex.get(tok);
      if (exactBucket) {
        if (exactBucket.length <= LARGE_BUCKET_LIMIT) {
          for (let b = 0; b < exactBucket.length; b++) {
            candidateSet.add(exactBucket[b]);
          }
        } else {
          // For ubiquitous tokens, always check short entries (<= 2 words) that can reach >51% on 1 hit
          const sBucket = shortTokenIndex.get(tok);
          if (sBucket && sBucket.length <= 500) {
            for (let b = 0; b < sBucket.length; b++) {
              candidateSet.add(sBucket[b]);
            }
          }
          largeBuckets.push(exactBucket);
        }
      }
      // Also inspect 3-char prefix matches when bucket isn't excessively huge (handles typos / spelling variants)
      if (tok.length >= 3) {
        const prefBucket = prefixIndex.get(tok.slice(0, 3));
        if (prefBucket && prefBucket.length <= 300) {
          for (let b = 0; b < prefBucket.length; b++) {
            candidateSet.add(prefBucket[b]);
          }
        }
      }
    }

    // If multiple ubiquitous tokens were present and no rare token narrowed candidates, intersect the two smallest large buckets
    if (largeBuckets.length >= 2 && candidateSet.size === 0) {
      largeBuckets.sort((a, b) => a.length - b.length);
      const firstSet = new Set(largeBuckets[0]);
      const second = largeBuckets[1];
      for (let b = 0; b < second.length; b++) {
        if (firstSet.has(second[b])) {
          candidateSet.add(second[b]);
        }
      }
    }

    let bestScore = 0;
    let bestEntry: IndexedExcelEntry | null = null;
    let bestKeywords: string[] = [];
    const allowFuzzyTokenLoop = candidateSet.size <= 350;

    for (const candIdx of candidateSet) {
      const cand = entries[candIdx];
      const candUniqueTokens = cand.uniqueTokens;
      const C = candUniqueTokens.length;
      if (C === 0) continue;

      const minThreshold = bestScore > 51 ? bestScore : 51;

      // Fast mathematical upper bound: max possible Dice if every shared-min token matches
      const maxDicePossible = (200 * (K < C ? K : C)) / (K + C);
      const minStrLen = cleanStr.length < cand.cleanStr.length ? cleanStr.length : cand.cleanStr.length;
      const maxStrLen = cleanStr.length > cand.cleanStr.length ? cleanStr.length : cand.cleanStr.length;
      const maxStrPossible = maxStrLen > 0 ? (minStrLen * 100) / maxStrLen : 0;

      if (Math.round(maxDicePossible) <= minThreshold && Math.round(maxStrPossible) <= minThreshold) {
        continue;
      }

      const matchedList: string[] = [];
      let usedMask = 0;

      for (let i = 0; i < K; i++) {
        const rt = uniqueRplTokens[i];
        if (cand.tokenSet.has(rt)) {
          matchedList.push(rt.toUpperCase());
          continue;
        }
        // Fuzzy token match for slight spelling variations (tokens >= 4 chars, >= 82% char similarity)
        if (allowFuzzyTokenLoop && rt.length >= 4) {
          for (let j = 0; j < C; j++) {
            if (j < 30 && (usedMask & (1 << j))) continue;
            const ct = candUniqueTokens[j];
            if (ct.length >= 4 && rt[0] === ct[0] && !cand.tokenSet.has(rt) && charSimilarityPct(rt, ct) >= 82) {
              matchedList.push(rt.toUpperCase());
              if (j < 30) usedMask |= 1 << j;
              break;
            }
          }
        }
      }

      // Dice token similarity %:
      // e.g. 2 of 3 words = 67% (>51% -> Potential Match)
      //      1 of 2 words = 50% (<=51% -> No Match)
      //      1 of 1 word + 1 extra word (2 vs 1) = 67% (>51% -> Potential Match)
      const tokenScorePct =
        matchedList.length > 0
          ? (2 * matchedList.length * 100) / (K + C)
          : 0;

      // Also check direct string similarity on cleaned name ONLY if length ratio can beat minThreshold
      let stringScorePct = 0;
      if (
        Math.round(maxStrPossible) > minThreshold &&
        Math.round(maxStrPossible) > Math.round(tokenScorePct) &&
        cleanStr.length >= 4 &&
        cand.cleanStr.length >= 4 &&
        (matchedList.length > 0 || cleanStr.slice(0, 3) === cand.cleanStr.slice(0, 3))
      ) {
        stringScorePct = charSimilarityPct(cleanStr, cand.cleanStr);
      }

      const rawCombined = tokenScorePct > stringScorePct ? tokenScorePct : stringScorePct;
      const score = Math.round(rawCombined);

      if (score > bestScore) {
        bestScore = score;
        bestEntry = cand;
        bestKeywords =
          matchedList.length > 0
            ? matchedList
            : uniqueRplTokens.map((t) => t.toUpperCase());
        if (bestScore >= 100) break;
      }
    }

    let result: RplListMatchResult;
    if (bestEntry && bestScore >= 100) {
      result = {
        status: 'exact',
        score: 100,
        matchedEntry: bestEntry.original,
        matchedKeywords: bestKeywords,
      };
    } else if (bestEntry && bestScore > 51) {
      result = {
        status: 'potential',
        score: Math.min(99, bestScore),
        matchedEntry: bestEntry.original,
        matchedKeywords: bestKeywords,
      };
    } else {
      result = { status: 'none', score: bestScore, matchedEntry: '', matchedKeywords: [] };
    }

    rplResultCache.set(cacheKey, result);
    return result;
  };

  const findCustomerRplMatch = (
    customerName: string,
    rplName: string,
    extraCity?: string
  ): { isExact: boolean; keywords: string[] } => {
    const cRaw = normalizeTextBasic(customerName);
    const rRaw = normalizeTextBasic(rplName);
    if (!cRaw || !rRaw) return { isExact: false, keywords: [] };

    const cTokens = extractMeaningfulTokens(customerName, filter, extraCity);
    const rTokens = extractMeaningfulTokens(rplName, filter, extraCity);

    const cClean = cTokens.join(' ');
    const rClean = rTokens.join(' ');

    if (cRaw === rRaw || (cClean && rClean && cClean === rClean)) {
      return {
        isExact: true,
        keywords: cTokens.length > 0 ? Array.from(new Set(cTokens)).map((t) => t.toUpperCase()) : ['EXACT MATCH'],
      };
    }

    if (cTokens.length === 0 || rTokens.length === 0) {
      return { isExact: false, keywords: [] };
    }

    const rSet = new Set(rTokens);
    const matched: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < cTokens.length; i++) {
      const ct = cTokens[i];
      if (seen.has(ct)) continue;
      if (rSet.has(ct)) {
        seen.add(ct);
        matched.push(ct.toUpperCase());
      } else if (ct.length >= 4) {
        // Stem / prefix match (e.g. dynamic vs dynamics)
        for (const rt of rSet) {
          if (rt.length >= 4 && (rt.startsWith(ct) || ct.startsWith(rt)) && Math.abs(rt.length - ct.length) <= 3) {
            seen.add(ct);
            matched.push(ct.toUpperCase());
            break;
          }
        }
      }
    }

    return { isExact: false, keywords: matched };
  };

  const filterExistingMatchKeywords = (rawMatchStr: string, extraCity?: string): string[] => {
    const trimmed = (rawMatchStr || '').trim();
    if (!trimmed) return [];
    if (trimmed.toLowerCase() === 'exact match') {
      return ['Exact match'];
    }
    const parts = trimmed.split(/[,;|/]+/).map((p) => p.trim()).filter(Boolean);
    const kept: string[] = [];
    const seen = new Set<string>();

    for (const part of parts) {
      const meaningful = extractMeaningfulTokens(part, filter, extraCity);
      for (const tok of meaningful) {
        if (!seen.has(tok)) {
          seen.add(tok);
          kept.push(tok.toUpperCase());
        }
      }
    }
    return kept;
  };

  return {
    hasExcelList: entries.length > 0,
    entryCount: entries.length,
    matchRplAgainstList,
    findCustomerRplMatch,
    filterExistingMatchKeywords,
  };
}
