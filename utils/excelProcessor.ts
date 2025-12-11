import * as XLSX from 'xlsx';

export interface ProcessConfig {
  highRiskKeywords: string[];
  aprvCodes: string[];
}

const getCellValue = (row: any[], index: number): string => {
  return row[index] !== undefined && row[index] !== null ? String(row[index]).trim() : '';
};

const extractValues = (text: string, key: string): string[] => {
  // Regex looks for key=value|
  // We assume the value cannot contain |
  // We make the | optional for the last item if the string ends abruptly, though user specified ends with |
  const regex = new RegExp(`${key}=([^|]+)\\|`, 'g');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.push(match[1].trim());
    }
  }
  return matches;
};

export const processExcelFile = async (file: File, config: ProcessConfig): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Assume first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays (header: 1 means array of arrays)
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          throw new Error("Excel file is empty");
        }

        // Prepare new data structure
        // Header Row
        const newHeader = [
          "Status",           // A: Final Status
          "File name",        // B: Source C
          "Ref No",           // C: Source D
          "Customer Name",    // D: Source I
          "City",             // E: Source L
          "CTR",              // F: Source O
          "RPL 1",            // G: Match Name 1
          "RPL 2",            // H: Match Name 2
          "RPL 3",            // I: Match Name 3
          "RPL 4",            // J: Match Name 4
          "RPL 5",            // K: Match Name 5
          "Denial Type 1",    // L
          "Denial Type 2",    // M
          "Denial Type 3",    // N
          "Denial Type 4",    // O
          "Denial Type 5",    // P
        ];

        const processedRows = [newHeader];

        // Iterate rows, skipping header (index 0)
        for (let i = 1; i < jsonData.length; i++) {
          const rawRow = jsonData[i];
          if (!rawRow || rawRow.length === 0) continue;

          // Helper to get raw column by Excel index (0-based: A=0, B=1, C=2...)
          const rawC = getCellValue(rawRow, 2);  // File name
          const rawD = getCellValue(rawRow, 3);  // Ref No
          const rawI = getCellValue(rawRow, 8);  // Customer Name
          const rawJ = getCellValue(rawRow, 9);
          const rawK = getCellValue(rawRow, 10);
          const rawL = getCellValue(rawRow, 11); // City
          const rawO = getCellValue(rawRow, 14); // CTR
          const rawW = getCellValue(rawRow, 22);
          const rawAA = getCellValue(rawRow, 26);

          // --- Logic for Column A (Status) ---
          let status = "SPL"; // Default
          
          // Precompute flags
          const combinedSearchText = (rawW + " " + rawAA).toUpperCase();
          const hasZKWD = combinedSearchText.includes("ZKWD");
          const hasZEMB = combinedSearchText.includes("ZEMB");
          
          const isNoAdd = rawJ === "" && rawK === "" && rawL === "" && rawO === "";
          
          // Check High Risk Keywords (Case insensitive partial match in Customer Name)
          const isHighRisk = config.highRiskKeywords.some(kw => 
            kw && rawI.toLowerCase().includes(kw.toLowerCase())
          );
          
          // Check APRV (Exact match in CTR column rawO)
          // User listed codes: RU, UA, NI, VE, BY, CU, IR, KP, SY
          const isAPRV = config.aprvCodes.some(code => 
            code && rawO.toUpperCase() === code.toUpperCase()
          );

          // Apply Priority Logic
          // 1. High Risk overrides others? Or just "if matched".
          // We will apply a strict priority order based on typical compliance logic unless specified otherwise.
          // Order: High Risk > APRV > ZKWD/ZEMB > No Add > SPL
          
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

          // --- Logic for Data Extraction (Match Name / Denial Type) ---
          const textToSearch = (rawW + "|" + rawAA).replace(/\|+/g, '|'); // Normalize pipes just in case
          // Actually, raw concatenation might be safer:
          // The format is `key=value|`. Concatenating W and AA might merge `|` from W and start of AA.
          const rawCombined = rawW + " " + rawAA;

          const matchNames = extractValues(rawCombined, "matchname");
          const denialTypes = extractValues(rawCombined, "denialtype");

          // --- Construct Final Row ---
          const newRow = [
            status,             // A
            rawC,               // B
            rawD,               // C
            rawI,               // D
            rawL,               // E
            rawO,               // F
            matchNames[0] || "", // G
            matchNames[1] || "", // H
            matchNames[2] || "", // I
            matchNames[3] || "", // J
            matchNames[4] || "", // K
            denialTypes[0] || "", // L
            denialTypes[1] || "", // M
            denialTypes[2] || "", // N
            denialTypes[3] || "", // O
            denialTypes[4] || "", // P
          ];

          processedRows.push(newRow);
        }

        // Create new workbook
        const newWs = XLSX.utils.aoa_to_sheet(processedRows);
        const newWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWb, newWs, "Processed Report");

        // Write to buffer
        const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
        resolve(wbout);

      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
