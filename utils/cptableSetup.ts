import * as XLSX from 'xlsx';
// @ts-ignore
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';

// Register codepage tables so that SheetJS can parse legacy Excel 97-2003 (.xls / BIFF8)
// and international character encodings without throwing "Cannot read properties of undefined (reading 'utils')"
if (typeof window !== 'undefined') {
  (window as any).cptable = cptable;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).cptable = cptable;
}
if (typeof (XLSX as any).set_cptable === 'function') {
  (XLSX as any).set_cptable(cptable);
}

export { cptable };
