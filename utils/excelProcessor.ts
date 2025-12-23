import * as XLSX from 'xlsx';

export interface ProcessConfig {
  highRiskKeywords: string[];
  aprvCodes: string[];
}

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
 */
const extractValues = (text: string, key: string): string[] => {
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
 * Processes various Excel formats and returns a modern .xlsx buffer.
 */
export const processExcelFile = async (file: File, config: ProcessConfig): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file data");

        // Use Uint8Array for best compatibility across .xls, .xlsx, .csv, and .html formats
        const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), { 
          type: 'array',
          cellDates: true, 
          cellNF: true,    
          cellText: true,  
          raw: false       
        });
        
        if (!workbook.SheetNames.length) {
          throw new Error("The Excel file contains no readable sheets.");
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
          throw new Error("The selected Excel sheet is empty.");
        }

        // Define the output header structure including new Splid columns
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

        // Process every row starting from index 0 to ensure the first row is visible
        for (let i = 0; i < jsonData.length; i++) {
          const rawRow = jsonData[i];
          if (!rawRow || rawRow.length === 0) continue;

          // Mapping logic (Excel Col -> Index): A=0, B=1, C=2, D=3...
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
          
          // Updated "No add" condition: Only Columns L and O are blank
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
          // We combine with pipes to handle search logic effectively
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

        // Export as modern .xlsx for maximum compatibility
        const newWs = XLSX.utils.aoa_to_sheet(processedRows);
        const newWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWb, newWs, "Processed Report");

        const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
        resolve(new Uint8Array(wbout));

      } catch (err) {
        console.error("Excel Processing Error:", err);
        reject(err instanceof Error ? err : new Error("Failed to process Excel file"));
      }
    };

    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsArrayBuffer(file);
  });
};