import * as XLSX from 'xlsx';

export interface ProcessConfig {
  highRiskKeywords: string[];
  aprvCodes: string[];
  referenceData?: Record<string, string[]>;
}

/**
 * Removes common corporate keywords and suffixes (like GMBH, CO, LTD, INC, LLC, AG, etc.)
 * to allow fairer comparison.
 */
const removeCommonKeywords = (s: string): string => {
  if (!s) return "";
  const commonKeywords = new Set([
    "gmbh", "co", "ltd", "inc", "corp", "corporation", "limited", "llc", "plc", 
    "ag", "sa", "sarl", "ab", "as", "kg", "bv", "nv", "pty", "srl", "and", "und", "et", "amp"
  ]);

  // Split by non-word characters and filter out the common keywords
  const words = s.toLowerCase().split(/\W+/);
  const filteredWords = words.filter(word => word && !commonKeywords.has(word));
  
  // Fallback to original lowercase string if everything got filtered out
  if (filteredWords.length === 0) {
    return s.toLowerCase();
  }
  return filteredWords.join(" ");
};

/**
 * Calculates a simple similarity score between two strings (0 to 100).
 * Uses a basic Levenshtein-based similarity.
 */
const calculateSimilarity = (s1: string, s2: string): number => {
  if (!s1 || !s2) return 0;
  
  const kw1 = removeCommonKeywords(s1);
  const kw2 = removeCommonKeywords(s2);

  if (kw1 === kw2) return 100;

  const editDistance = (a: string, b: string): number => {
    const matrix = Array.from({ length: a.length + 1 }, () => 
      Array.from({ length: b.length + 1 }, () => 0)
    );

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[a.length][b.length];
  };

  const distance = editDistance(kw1, kw2);
  const maxLength = Math.max(kw1.length, kw2.length);
  return Math.round(((maxLength - distance) / maxLength) * 100);
};

/**
 * Calculates similarity of strings using letters only (ignores special characters, numbers, and spaces).
 * e.g., "a-b-c" matches "abc" with 100%.
 */
const calculateLetterOnlySimilarity = (s1: string, s2: string): number => {
  if (!s1 || !s2) return 0;

  const kw1 = removeCommonKeywords(s1);
  const kw2 = removeCommonKeywords(s2);

  const clean1 = kw1.replace(/[^a-z]/g, "");
  const clean2 = kw2.replace(/[^a-z]/g, "");

  if (!clean1 || !clean2) return 0;
  if (clean1 === clean2) return 100;

  const editDistance = (a: string, b: string): number => {
    const matrix = Array.from({ length: a.length + 1 }, () => 
      Array.from({ length: b.length + 1 }, () => 0)
    );

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[a.length][b.length];
  };

  const distance = editDistance(clean1, clean2);
  const maxLength = Math.max(clean1.length, clean2.length);
  return Math.round(((maxLength - distance) / maxLength) * 100);
};

/**
 * Finds unique words that match in both strings.
 */
const getMatchingWords = (s1: string, s2: string): string => {
  if (!s1 || !s2) return "";
  const words1 = new Set(s1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(s2.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  
  const matches = [...words1].filter(w => words2.has(w));
  return matches.join(", ");
};

const normalizeKey = (val: string): string => {
  return (val || "")
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\s]+/g, " ") // Standardize multiple/non-breaking spaces
    .replace(/[^\w\s]/gi, "")    // Strip punctuation or non-alphanumeric chars
    .trim();
};

/**
 * Safely extracts a cell value as a trimmed string.
 */
const getCellValue = (row: any[], index: number): string => {
  if (!row || index < 0 || index >= row.length) return '';
  const val = row[index];
  if (val === undefined || val === null) return '';
  return String(val).trim();
};

/**
 * Extracts multiple values from a string based on key=value| pattern.
 * Supports keys like 'matchname', 'denialtype', and 'splid'.
 */
const extractValues = (text: string, key: string): string[] => {
  // Pattern matches key=something| where something doesn't contain |
  // Uses 'gi' for case-insensitive and global matching
  const regex = new RegExp(`${key}=([^|]+)\\|`, 'gi');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.push(match[1].trim());
    }
  }
  return matches;
};

/**
 * Processes various Excel formats (.xlsx, .xls, .xlsm, .xlsb, .csv) 
 * and returns a modern .xlsx buffer.
 */
export const processExcelFile = async (file: File, config: ProcessConfig): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file data");

        // Use Uint8Array for maximum format compatibility (XLSX, XLS, CSV, etc.)
        const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), { 
          type: 'array',
          cellDates: true, 
          cellNF: true,    
          cellText: true,  
          raw: false       
        });
        
        if (!workbook.SheetNames.length) {
          throw new Error("The file contains no readable sheets.");
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays (header: 1 means array of arrays)
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1, 
          defval: "", 
          blankrows: false 
        });

        if (jsonData.length === 0) {
          throw new Error("The selected file is empty.");
        }

        // Define the output header structure
        const newHeader = [
          "Status",           // A: Calculated status
          "File name",        // B: From Input Column C (index 2)
          "Ref No",           // C: From Input Column D (index 3)
          "Customer Name",    // D: From Input Column I (index 8)
          "Address 1",        // E: From Input Column J (index 9)
          "Address 2",        // F: From Input Column K (index 10)
          "City",             // G: From Input Column L (index 11)
          "CTR",              // H: From Input Column O (index 14)
          "RPL 1",            // I: Extracted Match Name 1
          "RPL 2",            // J: Match Name 2
          "RPL 3",            // K: Match Name 3
          "RPL 4",            // L: Match Name 4
          "RPL 5",            // M: Match Name 5
          "Denial Type 1",    // N: Extracted Denial Type 1
          "Denial Type 2",    // O: Denial Type 2
          "Denial Type 3",    // P: Denial Type 3
          "Denial Type 4",    // Q: Denial Type 4
          "Denial Type 5",    // R: Denial Type 5
          "Splid 1",          // S: Extracted Splid 1
          "Splid 2",          // T: Extracted Splid 2
          "Splid 3",          // U: Extracted Splid 3
          "Splid 4",          // V: Extracted Splid 4
          "Splid 5",          // W: Extracted Splid 5
        ];

        // Pre-analyze unique reference matching columns to specify header size dynamically
        const rowDataSheetValues: string[][] = [];
        let maxUniqueValuesCount = 1;

         // Build a robust normalized lookup cache to guarantee 100% accurate matches for punctuation, spacing variations
        const normalizedRefCache: Record<string, string[]> = {};
        if (config.referenceData) {
          const refKeys = Object.keys(config.referenceData);
          for (let k = 0; k < refKeys.length; k++) {
            const originalKey = refKeys[k];
            // Ensure values are copied, clamped to 32750 chars, and sorted descending by length (longest/most-words comment first)
            const originalVals = [...(config.referenceData[originalKey] || [])]
              .map(val => (typeof val === 'string' && val.length > 32750) ? (val.slice(0, 32750) + "... [truncated]") : val)
              .sort((a, b) => b.length - a.length);
            
            // Map the exact lowercase key
            normalizedRefCache[originalKey.toLowerCase().trim()] = originalVals;
            
            // Also map the normalized key
            const normKey = normalizeKey(originalKey);
            if (normKey) {
              if (!normalizedRefCache[normKey]) {
                normalizedRefCache[normKey] = originalVals;
              }
            }
          }
        }

        for (let i = 0; i < jsonData.length; i++) {
          const rawRow = jsonData[i];
          if (!rawRow || rawRow.length === 0) {
            rowDataSheetValues.push([]);
            continue;
          }
          let matched: string[] = [];
          if (config.referenceData) {
            const rawI = getCellValue(rawRow, 8); // Column I of raw file (Customer Name)
            const rawJ = getCellValue(rawRow, 9); // Column J of raw file
            
            const keyI_exact = rawI.toLowerCase().trim();
            const keyI_norm = normalizeKey(rawI);
            
            const keyJ_exact = rawJ.toLowerCase().trim();
            const keyJ_norm = normalizeKey(rawJ);
            
            // Try lookups in order of priority:
            // 1. Exact Column I (Standard Customer column)
            // 2. Normalized Column I
            // 3. Exact Column J (Alternative Customer column)
            // 4. Normalized Column J
            const rawMatched = (keyI_exact && normalizedRefCache[keyI_exact]) || 
                               (keyI_norm && normalizedRefCache[keyI_norm]) || 
                               (keyJ_exact && normalizedRefCache[keyJ_exact]) || 
                               (keyJ_norm && normalizedRefCache[keyJ_norm]) || 
                               [];
            matched = [...rawMatched].sort((a, b) => b.length - a.length);
          }
          rowDataSheetValues.push(matched);
          if (matched.length > maxUniqueValuesCount) {
            maxUniqueValuesCount = matched.length;
          }
        }

        // Append Column V and beyond to Header (index 21 onwards)
        newHeader.push("Unique Match AF Values 1");
        for (let idx = 2; idx <= maxUniqueValuesCount; idx++) {
          newHeader.push(`Unique Match AF Values ${idx}`);
        }

        const processedRows: any[][] = [newHeader];

        // Process every row starting from index 0
        for (let i = 0; i < jsonData.length; i++) {
          const rawRow = jsonData[i];
          if (!rawRow || rawRow.length === 0) continue;

          // Mapping logic (Raw Column -> Index): C=2, D=3, I=8, J=9, K=10, L=11, O=14, W=22, AA=26
          const rawC = getCellValue(rawRow, 2);  // Column C
          const rawD = getCellValue(rawRow, 3);  // Column D
          const rawI = getCellValue(rawRow, 8);  // Column I (Customer Name)
          const rawJ = getCellValue(rawRow, 9);  // Column J (Address 1)
          const rawK = getCellValue(rawRow, 10); // Column K (Address 2)
          const rawL = getCellValue(rawRow, 11); // Column L (City)
          const rawO = getCellValue(rawRow, 14); // Column O (CTR)
          const rawW = getCellValue(rawRow, 22); // Column W (Search Data)
          const rawAA = getCellValue(rawRow, 26); // Column AA (Search Data)

          // Status Determination Logic
          let status = "SPL";
          const combinedSearchText = (rawW + " " + rawAA).toUpperCase();
          const hasZKWD = combinedSearchText.includes("ZKWD");
          const hasZEMB = combinedSearchText.includes("ZEMB");
          
          // "No add" condition: Address 1 (J), Address 2 (K), City (L), and CTR (O) are ALL blank
          const isNoAdd = rawJ === "" && rawK === "" && rawL === "" && rawO === "";
          
          // Case-insensitive partial match for High Risk Keywords in Customer Name
          const isHighRisk = config.highRiskKeywords.some(kw => 
            kw && rawI.toLowerCase().includes(kw.toLowerCase())
          );
          
          // Exact match for APRV codes in CTR column (Column O)
          const isAPRV = config.aprvCodes.some(code => 
            code && rawO.toUpperCase() === code.toUpperCase()
          );

          // Priority sorting logic
          if (isHighRisk) {
            status = "High Risk";
          } else if (isAPRV) {
            status = "APRV";
          } else if (hasZKWD || hasZEMB) {
             if (hasZKWD && hasZEMB) status = "ZKWD & ZEMB";
             else if (hasZKWD) status = "ZKWD";
             else status = "ZEMB";
          } else if (isNoAdd) {
            status = "No add";
          } else {
            status = "SPL";
          }

          // Extraction of Match Names, Denial Types, and Splids
          // Combine W and AA with terminators to ensure clean extraction
          const rawCombined = `${rawW}|${rawAA}|`;
          const matchNames = extractValues(rawCombined, "matchname");
          const denialTypes = extractValues(rawCombined, "denialtype");
          const splids = extractValues(rawCombined, "splid");

          const newRow = [
            status,                // A
            rawC,                  // B
            rawD,                  // C
            rawI,                  // D
            rawJ,                  // E (Address 1)
            rawK,                  // F (Address 2)
            rawL,                  // G (City)
            rawO,                  // H (CTR)
            matchNames[0] || "",   // I
            matchNames[1] || "",   // J
            matchNames[2] || "",   // K
            matchNames[3] || "",   // L
            matchNames[4] || "",   // M
            denialTypes[0] || "",  // N
            denialTypes[1] || "",  // O
            denialTypes[2] || "",  // P
            denialTypes[3] || "",  // Q
            denialTypes[4] || "",  // R
            splids[0] || "",       // S
            splids[1] || "",       // T
            splids[2] || "",       // U
            splids[3] || "",       // V
            splids[4] || "",       // W
          ];

          // Append values of Column AF mapping starting from V (index 21)
          const matchedValsForThisRow = rowDataSheetValues[i] || [];
          for (let valIdx = 0; valIdx < maxUniqueValuesCount; valIdx++) {
            if (matchedValsForThisRow.length === 0) {
              newRow.push(valIdx === 0 ? "N/A" : "");
            } else {
              newRow.push(matchedValsForThisRow[valIdx] || "");
            }
          }

          processedRows.push(newRow);
        }

        // Export as modern .xlsx regardless of input format (CSV -> XLSX conversion)
        const newWb = XLSX.utils.book_new();
        const clampedProcessedRows = processedRows.map(row => 
          row.map(val => (typeof val === 'string' && val.length > 32750) ? (val.slice(0, 32750) + "... [truncated]") : val)
        );
        const mainWs = XLSX.utils.aoa_to_sheet(clampedProcessedRows);
        XLSX.utils.book_append_sheet(newWb, mainWs, "Processed Report");

        // Generate additional sheets for RPL Fuzzy Lookups
        for (let rplIdx = 1; rplIdx <= 5; rplIdx++) {
          const rplHeader = ["Customer Name", `RPL ${rplIdx}`, "Fuzzy Match %", "Letter-Only Match %", "Matching Words"];
          const dataRows: any[][] = [];

          // Skip header row in processedRows
          for (let i = 1; i < processedRows.length; i++) {
            const row = processedRows[i];
            const customerName = row[3]; // Column D
            const rplValue = row[7 + rplIdx]; // RPL 1 is at index 8 (7+1), RPL 2 at index 9 (7+2), etc.

            if (customerName && rplValue) {
              const similarity = calculateSimilarity(customerName, rplValue);
              const letterSimilarity = calculateLetterOnlySimilarity(customerName, rplValue);
              const matchingWords = getMatchingWords(customerName, rplValue);
              dataRows.push([customerName, rplValue, similarity, letterSimilarity, matchingWords]);
            }
          }

          if (dataRows.length > 0) {
            // Sort by Letter-Only Match % descending, then by Fuzzy Match % descending
            dataRows.sort((a, b) => {
              if (b[3] !== a[3]) {
                return b[3] - a[3];
              }
              return b[2] - a[2];
            });

            // Format similarity as percentage string for display and clamp to 32750 chars
            const formattedRows = dataRows.map(row => [
              row[0],
              row[1],
              `${row[2]}%`,
              `${row[3]}%`,
              row[4]
            ]).map(row => 
              row.map(val => (typeof val === 'string' && val.length > 32750) ? (val.slice(0, 32750) + "... [truncated]") : val)
            );

            const rplWs = XLSX.utils.aoa_to_sheet([rplHeader, ...formattedRows]);
            XLSX.utils.book_append_sheet(newWb, rplWs, `RPL ${rplIdx} Lookup`);
          }
        }

        const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
        resolve(new Uint8Array(wbout));

      } catch (err) {
        console.error("Excel Processing Error:", err);
        reject(err instanceof Error ? err : new Error("Failed to process file. Ensure it is a valid Excel or CSV document."));
      }
    };

    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsArrayBuffer(file);
  });
};