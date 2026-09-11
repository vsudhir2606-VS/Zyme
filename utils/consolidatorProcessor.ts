import * as XLSX from 'xlsx';

export interface ConsolidatorProgressUpdate {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  totalRows: number;
  percent: number;
  stage: 'reading' | 'processing' | 'generating' | 'done';
}

export interface ConsolidationResult {
  data: Uint8Array;
  fileCount: number;
  rowCount: number;
  warnings?: string[];
}

export interface ConsolidatorOptions {
  onProgress?: (progress: ConsolidatorProgressUpdate) => void;
  signal?: AbortSignal;
}

const clampCell = (val: any): any => {
  if (val === undefined || val === null) return "";
  if (typeof val === 'string' && val.length > 32750) {
    return val.slice(0, 32750) + "... [truncated]";
  }
  return val;
};

/**
 * Consolidates multiple Excel/CSV files into a single XLSX file with two sheets.
 * Sheet 1: Full consolidated data from all files.
 * Sheet 2: Specific columns extracted from source columns C, D, H, I, J, K, L, M, N, O.
 * Optimized with SheetJS dense mode and event-loop yielding for huge datasets and 200+ files.
 */
export const consolidateFiles = async (
  files: File[],
  options?: ConsolidatorOptions
): Promise<ConsolidationResult> => {
  if (files.length === 0) {
    throw new Error("No files selected for consolidation.");
  }

  const { onProgress, signal } = options || {};
  const totalFiles = files.length;
  const warnings: string[] = [];

  const sheet1Rows: any[][] = [];
  const sheet2Rows: any[][] = [
    [
      "File Name", "Transaction #", "Tran Type", "Customer Name", 
      "Address", "Address 2", "City", "Status", "zip", "Country", "Comments"
    ]
  ];

  let totalRowCount = 0;

  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    if (signal?.aborted) {
      throw new Error("Consolidation was cancelled by the user.");
    }

    const file = files[fileIdx];

    if (onProgress) {
      const readPercent = Math.min(88, Math.round((fileIdx / totalFiles) * 88));
      onProgress({
        currentFile: fileIdx + 1,
        totalFiles,
        fileName: file.name,
        totalRows: totalRowCount,
        percent: readPercent,
        stage: 'reading'
      });
    }

    // Yield control to browser so GC can run and UI stays smooth
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const data = await file.arrayBuffer();
      const tempWb = XLSX.read(new Uint8Array(data), {
        type: 'array',
        dense: true,
        cellDates: true,
        cellNF: false,
        cellText: false,
        cellHTML: false,
        cellFormula: false
      });
      
      if (!tempWb.SheetNames.length) {
        warnings.push(`File "${file.name}" contains no sheets and was skipped.`);
        continue;
      }

      const sheetName = tempWb.SheetNames[0];
      const worksheet = tempWb.Sheets[sheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false
      });

      if (!jsonData || jsonData.length === 0) continue;

      // Process rows
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        // Sheet 1: Clamped raw row
        const s1Row = row.map(clampCell);
        sheet1Rows.push(s1Row);

        // Sheet 2: Specific column mapping
        const mappedRow = [
          clampCell(row[2]),  // File Name (C)
          clampCell(row[3]),  // Transaction # (D)
          clampCell(row[7]),  // Tran Type (H)
          clampCell(row[8]),  // Customer Name (I)
          clampCell(row[9]),  // Address (J)
          clampCell(row[10]), // Address 2 (K)
          clampCell(row[11]), // City (L)
          clampCell(row[12]), // Status (M)
          clampCell(row[13]), // zip (N)
          clampCell(row[14]), // Country (O)
          ""                  // Comments (Blank)
        ];
        sheet2Rows.push(mappedRow);
        totalRowCount++;

        if (i > 0 && i % 25000 === 0) {
          if (onProgress) {
            onProgress({
              currentFile: fileIdx + 1,
              totalFiles,
              fileName: file.name,
              totalRows: totalRowCount,
              percent: Math.min(88, Math.round(((fileIdx + (i / jsonData.length)) / totalFiles) * 88)),
              stage: 'processing'
            });
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (err: any) {
      console.error(`Error reading file ${file.name}:`, err);
      warnings.push(`File "${file.name}" could not be parsed: ${err.message || 'Error'}`);
    }
  }

  if (signal?.aborted) {
    throw new Error("Consolidation was cancelled by the user.");
  }

  if (onProgress) {
    onProgress({
      currentFile: totalFiles,
      totalFiles,
      fileName: 'Generating Excel workbook...',
      totalRows: totalRowCount,
      percent: 92,
      stage: 'generating'
    });
  }

  await new Promise(resolve => setTimeout(resolve, 15));

  const workbook = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows.length > 0 ? sheet1Rows : [["No Data"]]);
  XLSX.utils.book_append_sheet(workbook, ws1, 'Sheet1');

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  XLSX.utils.book_append_sheet(workbook, ws2, 'Sheet2');

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true
  });

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

  return {
    data: new Uint8Array(buffer),
    fileCount: files.length,
    rowCount: totalRowCount,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};

