import ExcelJS from 'exceljs';
import { read, utils } from 'xlsx';

export interface OofConsolidationResult {
  data: Uint8Array;
  fileCount: number;
  rowCount: number;
  previewRows: any[][];
}

/**
 * Consolidates multiple Excel/CSV files into a single master XLSX file.
 * For each file uploaded, a new row is inserted as the first row for that file containing the file name.
 */
export const consolidateOofFiles = async (files: File[]): Promise<OofConsolidationResult> => {
  if (files.length === 0) {
    throw new Error("No files selected for consolidation.");
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Off Consolidated');

  let totalRowCount = 0;
  const previewRows: any[][] = [];

  const clampRow = (r: any[]) =>
    r.map(val => (typeof val === 'string' && val.length > 32750) ? (val.slice(0, 32750) + "... [truncated]") : (val ?? ""));

  for (const file of files) {
    const data = await file.arrayBuffer();
    const tempWb = read(new Uint8Array(data), { type: 'array' });

    if (!tempWb.SheetNames.length) continue;

    const sheetName = tempWb.SheetNames[0];
    const worksheet = tempWb.Sheets[sheetName];
    const jsonData: any[][] = utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    if (jsonData.length === 0) continue;

    // Append all rows from the file, ensuring Column A (index 0) has the file name for all rows
    for (const row of jsonData) {
      if (!row || row.length === 0) continue;
      const clamped = clampRow([file.name, ...row]);
      sheet.addRow(clamped);
      totalRowCount++;

      if (previewRows.length < 100) {
        previewRows.push(clamped);
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    data: new Uint8Array(buffer),
    fileCount: files.length,
    rowCount: totalRowCount,
    previewRows
  };
};
