import * as XLSX from 'xlsx';
import './cptableSetup.ts';

export const GTS_HEADERS = [
  "Created By",
  "Partner",
  "LS Group",
  "Screening Date",
  "Name",
  "Name 2",
  "Name 3",
  "Name 4",
  "City",
  "Country",
  "BP Categ.",
  "Com. Ex.",
  "Document Number",
  "Item",
  "Partner Ro"
] as const;

export type GtsHeaderName = typeof GTS_HEADERS[number];

export interface GtsProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'mapping' | 'sorting' | 'generating' | 'done';
}

export interface GtsFileAudit {
  fileName: string;
  rowCount: number;
  matchedHeaders: string[];
  missingHeaders: string[];
}

export interface GtsConsolidationResult {
  data: Uint8Array;
  csvBlob: Blob;
  fileCount: number;
  rowCount: number;
  fileAudits: GtsFileAudit[];
  previewRows: any[][];
  warnings?: string[];
  isCsvOnly?: boolean;
}

export interface GtsConsolidatorOptions {
  includeFileName?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  targetHeaders?: string[];
  onProgress?: (progress: GtsProgressUpdate) => void;
  signal?: AbortSignal;
}

const normalize = (str: any): string => {
  if (str === null || str === undefined) return "";
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
};

// Aliases and synonyms for SAP GTS and international variations
const GTS_HEADER_MATCHERS: { target: GtsHeaderName; aliases: string[] }[] = [
  // Check specific numbered names before generic "Name"
  {
    target: "Name 4",
    aliases: ["name 4", "name4", "name_4", "partner name 4", "customer name 4"]
  },
  {
    target: "Name 3",
    aliases: ["name 3", "name3", "name_3", "partner name 3", "customer name 3"]
  },
  {
    target: "Name 2",
    aliases: ["name 2", "name2", "name_2", "partner name 2", "customer name 2"]
  },
  {
    target: "Name",
    aliases: ["name", "name 1", "name1", "partner name", "customer name", "company name", "full name", "client name"]
  },
  {
    target: "Created By",
    aliases: ["created by", "createdby", "created_by", "created", "creator", "erfasst von", "user", "created user", "entered by"]
  },
  {
    target: "Partner",
    aliases: ["partner", "partner no", "partner number", "partner no.", "partner id", "business partner", "businesspartner", "bp", "geschaeftspartner", "partner #", "bp no"]
  },
  {
    target: "LS Group",
    aliases: ["ls group", "lsgroup", "ls_group", "legal regulation", "spl group", "sanctioned party list", "list group", "regulation", "spl", "sanction list"]
  },
  {
    target: "Screening Date",
    aliases: ["screening date", "screeningdate", "screening_date", "screen date", "date of screening", "check date", "pruefdatum", "date", "spl date"]
  },
  {
    target: "City",
    aliases: ["city", "ort", "town", "municipality", "city/town", "place"]
  },
  {
    target: "Country",
    aliases: ["country", "country key", "country code", "ctry", "land", "staat", "country/region", "destination country"]
  },
  {
    target: "BP Categ.",
    aliases: ["bp categ.", "bp categ", "bpcateg", "bp category", "business partner category", "partner category", "category", "bp cat", "bp type", "category of bp"]
  },
  {
    target: "Com. Ex.",
    aliases: ["com. ex.", "com. ex", "com.ex.", "comex", "com ex", "commercial exit", "comment external", "comm ex", "comm. ex.", "external comment", "comment", "ex comment", "comments"]
  },
  {
    target: "Document Number",
    aliases: ["document number", "doc number", "doc. number", "document no", "document no.", "doc no", "doc no.", "document", "belegnummer", "doc id", "document id", "order number", "order no"]
  },
  {
    target: "Item",
    aliases: ["item", "item number", "item no", "item no.", "item #", "pos", "position", "zeilennummer", "item id", "line item"]
  },
  {
    target: "Partner Ro",
    aliases: ["partner ro", "partner ro.", "partnerro", "partner role", "partner role.", "partner function", "role", "partnerrolle", "rolle", "partner func", "bp role"]
  }
];

const clampCell = (val: any): any => {
  if (val === undefined || val === null) return "";
  if (typeof val === 'string' && val.length > 32750) {
    return val.slice(0, 32750) + "... [truncated]";
  }
  return val;
};

const escapeCsvField = (val: any): string => {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

export interface HeaderMatcher {
  target: string;
  aliases: string[];
}

/**
 * Builds dynamic matchers for any custom list of target headers,
 * inheriting standard GTS synonyms if the target header corresponds to or contains a GTS concept.
 */
export const buildDynamicHeaderMatchers = (targetHeaders: string[]): HeaderMatcher[] => {
  const matchers: HeaderMatcher[] = [];

  for (const hdr of targetHeaders) {
    const normHdr = normalize(hdr);
    if (!normHdr) continue;

    const aliases = new Set<string>();
    aliases.add(hdr);
    aliases.add(normHdr);

    // Check if target header matches or relates to any known GTS header
    const knownMatcher = GTS_HEADER_MATCHERS.find(m => {
      const normTarget = normalize(m.target);
      if (normTarget === normHdr) return true;
      if (m.aliases.some(a => normalize(a) === normHdr)) return true;
      if (normHdr.length >= 4 && normTarget.length >= 4) {
        if (normHdr.includes(normTarget) || normTarget.includes(normHdr)) return true;
      }
      return false;
    });

    if (knownMatcher) {
      knownMatcher.aliases.forEach(a => aliases.add(a));
    }

    // Add space-separated variant
    const cleanWord = hdr.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
    if (cleanWord) {
      aliases.add(cleanWord);
      aliases.add(normalize(cleanWord));
    }

    matchers.push({
      target: hdr,
      aliases: Array.from(aliases)
    });
  }

  // Sort matchers: specific numbered variations like "Name 4", "Name 3", "Name 2", "BP Categ." before general ones
  matchers.sort((a, b) => {
    const aHasNum = /[0-9]/.test(a.target);
    const bHasNum = /[0-9]/.test(b.target);
    if (aHasNum && !bHasNum) return -1;
    if (!aHasNum && bHasNum) return 1;
    return b.target.length - a.target.length;
  });

  return matchers;
};

/**
 * Finds the header row in a 2D sheet array by scanning top rows for keywords.
 */
const detectHeaderRow = (
  rows: any[][],
  matchers: HeaderMatcher[]
): { headerRowIndex: number; columnMap: Record<string, number> } => {
  let bestRowIndex = 0;
  let bestMatchCount = -1;
  let bestMap: Record<string, number> = {};

  const maxScanRows = Math.min(35, rows.length);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const currentMap: Record<string, number> = {};
    let matchedCount = 0;

    // Pass 1: exact normalized match
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellVal = row[colIdx];
      if (cellVal === null || cellVal === undefined || cellVal === "") continue;

      const normCell = normalize(cellVal);
      if (!normCell) continue;

      for (const matcher of matchers) {
        if (currentMap[matcher.target] !== undefined) continue;

        const isExactMatch = matcher.aliases.some(alias => normalize(alias) === normCell);

        if (isExactMatch) {
          currentMap[matcher.target] = colIdx;
          matchedCount++;
          break;
        }
      }
    }

    // Pass 2: secondary pass on unmatched columns for longer descriptive headers
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellVal = row[colIdx];
      if (cellVal === null || cellVal === undefined || cellVal === "") continue;
      const normCell = normalize(cellVal);
      if (!normCell) continue;

      // If this column was already assigned in pass 1, skip
      if (Object.values(currentMap).includes(colIdx)) continue;

      for (const matcher of matchers) {
        if (currentMap[matcher.target] !== undefined) continue;

        const isPrefixMatch = matcher.aliases.some(alias => {
          const normAlias = normalize(alias);
          // Only allow prefix if alias is 4+ chars to prevent small acronyms matching longer words
          if (normAlias.length >= 4 && normCell.startsWith(normAlias)) {
            const remainder = normCell.slice(normAlias.length);
            if (!/^[0-9]/.test(remainder)) return true;
          }
          return false;
        });

        if (isPrefixMatch) {
          currentMap[matcher.target] = colIdx;
          matchedCount++;
          break;
        }
      }
    }

    if (matchedCount > bestMatchCount) {
      bestMatchCount = matchedCount;
      bestRowIndex = r;
      bestMap = currentMap;
    }
  }

  // Fallback: if no match found with aliases, try matching raw first row
  if (bestMatchCount <= 0 && rows.length > 0) {
    bestRowIndex = 0;
    const row = rows[0] || [];
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellVal = row[colIdx];
      const normCell = normalize(cellVal);
      for (const matcher of matchers) {
        if (bestMap[matcher.target] === undefined && normCell.includes(normalize(matcher.target))) {
          bestMap[matcher.target] = colIdx;
        }
      }
    }
  }

  return { headerRowIndex: bestRowIndex, columnMap: bestMap };
};

/**
 * Consolidates multiple files into GTS standard format:
 * Columns sorted strictly as:
 * Created By | Partner | LS Group | Screening Date | Name | Name 2 | Name 3 | Name 4 | City | Country | BP Categ. | Com. Ex. | Document Number | Item | Partner Ro
 * 
 * If a file does not have a header, that column is left blank.
 */
export const consolidateGtsFiles = async (
  files: File[],
  options?: GtsConsolidatorOptions
): Promise<GtsConsolidationResult> => {
  if (files.length === 0) {
    throw new Error("No files selected for GTS consolidation.");
  }

  const {
    includeFileName = true,
    sortBy = 'none',
    sortOrder = 'asc',
    targetHeaders: customHeaders,
    onProgress,
    signal
  } = options || {};

  const targetHeaders: string[] = (customHeaders && customHeaders.length > 0)
    ? customHeaders.map(h => String(h).trim()).filter(Boolean)
    : [...GTS_HEADERS];

  const matchers = buildDynamicHeaderMatchers(targetHeaders);

  const totalFiles = files.length;
  const warnings: string[] = [];
  const fileAudits: GtsFileAudit[] = [];

  // Construct master output headers
  const outputHeaders: string[] = includeFileName 
    ? ["File Name", ...targetHeaders] 
    : [...targetHeaders];

  // All extracted rows in GTS column order
  const consolidatedRows: any[][] = [];
  let totalRowCount = 0;

  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    if (signal?.aborted) {
      throw new Error("GTS Consolidation was cancelled by the user.");
    }

    const file = files[fileIdx];

    if (onProgress) {
      const readPercent = Math.min(80, Math.round((fileIdx / totalFiles) * 80));
      onProgress({
        currentFile: fileIdx + 1,
        totalFiles,
        fileName: file.name,
        totalRows: totalRowCount,
        percent: readPercent,
        stage: 'reading'
      });
    }

    // Yield control for browser responsiveness
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
        warnings.push(`File "${file.name}" contains no readable sheets and was skipped.`);
        fileAudits.push({
          fileName: file.name,
          rowCount: 0,
          matchedHeaders: [],
          missingHeaders: [...targetHeaders]
        });
        continue;
      }

      const sheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[sheetName];
      if (!worksheet) {
        warnings.push(`File "${file.name}" sheet "${sheetName}" was empty.`);
        fileAudits.push({
          fileName: file.name,
          rowCount: 0,
          matchedHeaders: [],
          missingHeaders: [...targetHeaders]
        });
        continue;
      }

      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;
      const rawData: any[][] = xlsxUtils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false
      });

      if (!rawData || rawData.length === 0) {
        fileAudits.push({
          fileName: file.name,
          rowCount: 0,
          matchedHeaders: [],
          missingHeaders: [...targetHeaders]
        });
        continue;
      }

      // Detect header row and column mapping with dynamic matchers
      const { headerRowIndex, columnMap } = detectHeaderRow(rawData, matchers);

      const matched: string[] = [];
      const missing: string[] = [];

      targetHeaders.forEach(h => {
        if (columnMap[h] !== undefined && columnMap[h] >= 0) {
          matched.push(h);
        } else {
          missing.push(h);
        }
      });

      let fileExtractedCount = 0;

      // Extract data rows starting right after the detected header row
      for (let r = headerRowIndex + 1; r < rawData.length; r++) {
        const sourceRow = rawData[r];
        if (!sourceRow || !Array.isArray(sourceRow) || sourceRow.length === 0) continue;

        // Verify row is not just empty strings
        const hasContent = sourceRow.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== "");
        if (!hasContent) continue;

        const gtsRow: any[] = [];

        if (includeFileName) {
          gtsRow.push(file.name);
        }

        // Map strictly in configured target header order:
        for (const header of targetHeaders) {
          const colIdx = columnMap[header];
          if (colIdx !== undefined && colIdx >= 0 && colIdx < sourceRow.length) {
            gtsRow.push(clampCell(sourceRow[colIdx]));
          } else {
            // Header not present in this file -> leave blank
            gtsRow.push("");
          }
        }

        consolidatedRows.push(gtsRow);
        fileExtractedCount++;
        totalRowCount++;

        if (totalRowCount % 25000 === 0) {
          if (onProgress) {
            onProgress({
              currentFile: fileIdx + 1,
              totalFiles,
              fileName: file.name,
              totalRows: totalRowCount,
              percent: Math.min(85, Math.round(((fileIdx + (r / rawData.length)) / totalFiles) * 85)),
              stage: 'mapping'
            });
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      fileAudits.push({
        fileName: file.name,
        rowCount: fileExtractedCount,
        matchedHeaders: matched,
        missingHeaders: missing
      });

    } catch (err: any) {
      console.error(`Error processing file ${file.name}:`, err);
      warnings.push(`File "${file.name}" failed to process: ${err.message || 'Error'}`);
      fileAudits.push({
        fileName: file.name,
        rowCount: 0,
        matchedHeaders: [],
        missingHeaders: [...targetHeaders]
      });
    }
  }

  if (signal?.aborted) {
    throw new Error("GTS Consolidation was cancelled by the user.");
  }

  // Row sorting if requested
  if (sortBy && sortBy !== 'none' && consolidatedRows.length > 0) {
    if (onProgress) {
      onProgress({
        currentFile: totalFiles,
        totalFiles,
        fileName: `Sorting by ${sortBy}...`,
        totalRows: totalRowCount,
        percent: 88,
        stage: 'sorting'
      });
    }

    const sortColIndex = outputHeaders.indexOf(sortBy);
    if (sortColIndex !== -1) {
      consolidatedRows.sort((a, b) => {
        const valA = String(a[sortColIndex] ?? "").trim();
        const valB = String(b[sortColIndex] ?? "").trim();
        const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        return sortOrder === 'desc' ? -cmp : cmp;
      });
    }
  }

  if (onProgress) {
    onProgress({
      currentFile: totalFiles,
      totalFiles,
      fileName: 'Generating master report & CSV...',
      totalRows: totalRowCount,
      percent: 92,
      stage: 'generating'
    });
  }

  // Generate universal CSV stream
  const csvChunks: string[] = [outputHeaders.map(escapeCsvField).join(',') + '\r\n'];
  const CSV_FLUSH_INTERVAL = 5000;
  let tempCsvLines: string[] = [];

  for (let r = 0; r < consolidatedRows.length; r++) {
    tempCsvLines.push(consolidatedRows[r].map(escapeCsvField).join(','));
    if (tempCsvLines.length >= CSV_FLUSH_INTERVAL) {
      csvChunks.push(tempCsvLines.join('\r\n') + '\r\n');
      tempCsvLines = [];
    }
  }
  if (tempCsvLines.length > 0) {
    csvChunks.push(tempCsvLines.join('\r\n') + '\r\n');
  }
  const csvBlob = new Blob(csvChunks, { type: 'text/csv;charset=utf-8;' });

  // Generate Excel workbook with chunking for memory safety
  const TARGET_MAX_CELLS_PER_SHEET = 350000;
  const numCols = Math.max(1, outputHeaders.length);
  const maxRowsPerSheet = Math.max(1000, Math.floor(TARGET_MAX_CELLS_PER_SHEET / numCols));

  const workbook = XLSX.utils.book_new();
  let excelBuffer: Uint8Array | null = null;
  let isCsvOnly = false;

  try {
    if (consolidatedRows.length === 0) {
      const emptyWs = (XLSX.utils.aoa_to_sheet as any)([outputHeaders, ["No Data Found"]], { dense: true });
      XLSX.utils.book_append_sheet(workbook, emptyWs, 'GTS Consolidated');
    } else {
      let sheetNum = 1;
      for (let start = 0; start < consolidatedRows.length; start += maxRowsPerSheet) {
        const slice = consolidatedRows.slice(start, start + maxRowsPerSheet);
        const currentSheetRows = [outputHeaders, ...slice];
        const sheetTitle = sheetNum === 1 ? 'GTS Consolidated' : `GTS Consolidated (${sheetNum})`;
        const ws = (XLSX.utils.aoa_to_sheet as any)(currentSheetRows, { dense: true });
        XLSX.utils.book_append_sheet(workbook, ws, sheetTitle);
        sheetNum++;
      }
    }

    // Add Audit / Summary Sheet
    const auditRows: any[][] = [
      ["File Name", "Extracted Rows", "Matched GTS Headers", "Missing Headers"]
    ];
    for (const audit of fileAudits) {
      auditRows.push([
        audit.fileName,
        audit.rowCount,
        audit.matchedHeaders.join(', ') || 'None',
        audit.missingHeaders.join(', ') || 'None'
      ]);
    }
    const auditWs = (XLSX.utils.aoa_to_sheet as any)(auditRows, { dense: true });
    XLSX.utils.book_append_sheet(workbook, auditWs, 'GTS File Audit');

    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
      compression: false,
      bookSST: false
    });

    excelBuffer = new Uint8Array(buffer);
  } catch (xlsxErr: any) {
    console.warn("Excel packaging exceeded memory limits; falling back to universal CSV:", xlsxErr);
    isCsvOnly = true;
    warnings.push("Excel workbook generation exceeded memory limits. Universal CSV export is available with all records intact.");
  }

  if (onProgress) {
    onProgress({
      currentFile: totalFiles,
      totalFiles,
      fileName: 'Done',
      totalRows: totalRowCount,
      percent: 100,
      stage: 'done'
    });
  }

  const previewRows = [
    outputHeaders,
    ...consolidatedRows.slice(0, 15)
  ];

  return {
    data: excelBuffer || new Uint8Array(0),
    csvBlob,
    fileCount: files.length,
    rowCount: totalRowCount,
    fileAudits,
    previewRows,
    warnings: warnings.length > 0 ? warnings : undefined,
    isCsvOnly
  };
};
