import ExcelJS from 'exceljs';
import { read, utils } from 'xlsx';

export interface ConsolidationResult {
  data: Uint8Array;
  fileCount: number;
  rowCount: number;
}

/**
 * Consolidates multiple Excel/CSV files into a single XLSX file with two sheets.
 * Sheet 1: Full consolidated data from all files.
 * Sheet 2: Specific columns extracted from source columns C, D, H, I, J, K, L, M, N, O.
 */
export const consolidateFiles = async (files: File[]): Promise<ConsolidationResult> => {
  if (files.length === 0) {
    throw new Error("No files selected for consolidation.");
  }

  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Full Consolidated Data
  const sheet1 = workbook.addWorksheet('Sheet1');
  
  // Sheet 2: Specific Column Mapping
  const sheet2 = workbook.addWorksheet('Sheet2');
  
  // Sheet 2 Headers
  const sheet2Headers = [
    "File Name", "Transaction #", "Tran Type", "Customer Name", 
    "Address", "Address 2", "City", "Status", "zip", "Country", "Comments"
  ];
  
  const headerRow2 = sheet2.addRow(sheet2Headers);
  headerRow2.eachCell((cell) => {
    cell.font = { bold: true };
  });

  let totalRowCount = 0;
  let isFirstFile = true;

  for (const file of files) {
    const data = await file.arrayBuffer();
    const tempWb = read(new Uint8Array(data), { type: 'array' });
    
    if (!tempWb.SheetNames.length) continue;

    const sheetName = tempWb.SheetNames[0];
    const worksheet = tempWb.Sheets[sheetName];
    const jsonData: any[][] = utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    if (jsonData.length === 0) continue;

    const clampRow = (r: any[]) => r.map(val => (typeof val === 'string' && val.length > 32750) ? (val.slice(0, 32750) + "... [truncated]") : val);

    // --- Process Sheet 1 (Full Consolidation) ---
    // Requirement: headers not required for Sheet 1
    // Include all rows including the first one
    jsonData.forEach(row => sheet1.addRow(clampRow(row)));

    // --- Process Sheet 2 (Specific Mapping) ---
    // Include all rows including the first one
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      // Mapping as per requirements:
      // File Name: Source Col C (Index 2)
      // Transaction #: Source Col D (Index 3)
      // Tran Type: Source Col H (Index 7)
      // Customer Name: Source Col I (Index 8)
      // Address: Source Col J (Index 9)
      // Address 2: Source Col K (Index 10)
      // City: Source Col L (Index 11)
      // Status: Source Col M (Index 12)
      // zip: Source Col N (Index 13)
      // Country: Source Col O (Index 14)
      // Comments: Blank
      
      const mappedRow = [
        row[2] || "",    // File Name (C)
        row[3] || "",    // Transaction # (D)
        row[7] || "",    // Tran Type (H)
        row[8] || "",    // Customer Name (I)
        row[9] || "",    // Address (J)
        row[10] || "",   // Address 2 (K)
        row[11] || "",   // City (L)
        row[12] || "",   // Status (M)
        row[13] || "",   // zip (N)
        row[14] || "",   // Country (O)
        ""               // Comments (Blank)
      ];
      
      sheet2.addRow(clampRow(mappedRow));
      totalRowCount++;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  
  return {
    data: new Uint8Array(buffer),
    fileCount: files.length,
    rowCount: totalRowCount
  };
};
