import * as XLSX from 'xlsx';

export interface ProcessConfig {
  highRiskKeywords: string[];
  aprvCodes: string[];
}

/**
 * Calculates a simple similarity score between two strings (0 to 100).
 * Uses a basic Levenshtein-based similarity.
 */
const calculateSimilarity = (s1: string, s2: string): number => {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  if (s1 === s2) return 100;

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

  const distance = editDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
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
          "City",             // E: From Input Column L (index 11)
          "CTR",              // F: From Input Column O (index 14)
          "RPL 1",            // G: Extracted Match Name 1
          "RPL 2",            // H: Match Name 2
          "RPL 3",            // I: Match Name 3
          "RPL 4",            // J: Match Name 4
          "RPL 5",            // K: Match Name 5
          "Denial Type 1",    // L: Extracted Denial Type 1
          "Denial Type 2",    // M: Denial Type 2
          "Denial Type 3",    // N: Denial Type 3
          "Denial Type 4",    // O: Denial Type 4
          "Denial Type 5",    // P: Denial Type 5
          "Splid 1",          // Q: Extracted Splid 1
          "Splid 2",          // R: Extracted Splid 2
          "Splid 3",          // S: Extracted Splid 3
          "Splid 4",          // T: Extracted Splid 4
          "Splid 5",          // U: Extracted Splid 5
        ];

        const processedRows: any[][] = [newHeader];

        // Process every row starting from index 0
        for (let i = 0; i < jsonData.length; i++) {
          const rawRow = jsonData[i];
          if (!rawRow || rawRow.length === 0) continue;

          // Mapping logic (Raw Column -> Index): C=2, D=3, I=8, L=11, O=14, W=22, AA=26
          const rawC = getCellValue(rawRow, 2);  // Column C
          const rawD = getCellValue(rawRow, 3);  // Column D
          const rawI = getCellValue(rawRow, 8);  // Column I (Customer Name)
          const rawL = getCellValue(rawRow, 11); // Column L (City)
          const rawO = getCellValue(rawRow, 14); // Column O (CTR)
          const rawW = getCellValue(rawRow, 22); // Column W (Search Data)
          const rawAA = getCellValue(rawRow, 26); // Column AA (Search Data)

          // Status Determination Logic
          let status = "SPL";
          const combinedSearchText = (rawW + " " + rawAA).toUpperCase();
          const hasZKWD = combinedSearchText.includes("ZKWD");
          const hasZEMB = combinedSearchText.includes("ZEMB");
          
          // Updated "No add" condition: Only Columns L (City) and O (CTR) are blank
          const isNoAdd = rawL === "" && rawO === "";
          
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
            rawL,                  // E
            rawO,                  // F
            matchNames[0] || "",   // G
            matchNames[1] || "",   // H
            matchNames[2] || "",   // I
            matchNames[3] || "",   // J
            matchNames[4] || "",   // K
            denialTypes[0] || "",  // L
            denialTypes[1] || "",  // M
            denialTypes[2] || "",  // N
            denialTypes[3] || "",  // O
            denialTypes[4] || "",  // P
            splids[0] || "",       // Q
            splids[1] || "",       // R
            splids[2] || "",       // S
            splids[3] || "",       // T
            splids[4] || "",       // U
          ];

          processedRows.push(newRow);
        }

        // Export as modern .xlsx regardless of input format (CSV -> XLSX conversion)
        const newWb = XLSX.utils.book_new();
        const mainWs = XLSX.utils.aoa_to_sheet(processedRows);
        XLSX.utils.book_append_sheet(newWb, mainWs, "Processed Report");

        // Generate additional sheets for RPL Fuzzy Lookups
        for (let rplIdx = 1; rplIdx <= 5; rplIdx++) {
          const rplHeader = ["Customer Name", `RPL ${rplIdx}`, "Fuzzy Match %", "Matching Words"];
          const dataRows: any[][] = [];

          // Skip header row in processedRows
          for (let i = 1; i < processedRows.length; i++) {
            const row = processedRows[i];
            const customerName = row[3]; // Column D
            const rplValue = row[5 + rplIdx]; // RPL 1 is at index 6, RPL 2 at 7, etc.

            if (customerName && rplValue) {
              const similarity = calculateSimilarity(customerName, rplValue);
              const matchingWords = getMatchingWords(customerName, rplValue);
              dataRows.push([customerName, rplValue, similarity, matchingWords]);
            }
          }

          if (dataRows.length > 0) {
            // Sort by similarity percentage descending
            dataRows.sort((a, b) => b[2] - a[2]);

            // Format similarity as percentage string for display
            const formattedRows = dataRows.map(row => [
              row[0],
              row[1],
              `${row[2]}%`,
              row[3]
            ]);

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