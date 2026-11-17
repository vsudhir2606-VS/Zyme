import * as XLSX from 'xlsx';
import './cptableSetup.ts';
import { clampWorksheetRange } from './excelSafety.ts';

export interface StreamedDateCell {
  t: 'n';
  v: number;
  z?: string;
  w?: string;
}

export type StreamedRowCallback = (
  row: any[],
  rowIndex: number,
  bytesProgress?: { read: number; total: number }
) => void | boolean | Promise<void | boolean>;

export interface StreamReadOptions {
  maxRows?: number;
  maxCols?: number;
  signal?: AbortSignal;
  onChunkProgress?: (bytesRead: number, totalBytes: number) => void;
}

const DEFAULT_MAX_COLS = 200;
const XLSX_READ_CHUNK_BYTES = 1024 * 1024; // 1 MB per slice
const CSV_READ_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB per slice

export const yieldToUi = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const textDecoderUtf8 = new TextDecoder('utf-8');
const textEncoderUtf8 = new TextEncoder();

const BUILTIN_DATE_FMT_IDS = new Set([
  14, 15, 16, 17, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

const BUILTIN_DATE_FMT_STRINGS: Record<number, string> = {
  14: 'mm-dd-yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  22: 'm/d/yy h:mm',
};

const unescapeXmlFast = (s: string): string => {
  if (!s || s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, entity: string) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity.charCodeAt(0) === 35 /* # */) {
      const code =
        entity.charCodeAt(1) === 120 /* x */ || entity.charCodeAt(1) === 88 /* X */
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
    }
    return m;
  });
};

const escapeXmlText = (s: string): string => {
  // Strip XML 1.0 illegal control characters so Excel never repairs the file
  let clean = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
  if (clean.length > 32750) {
    clean = clean.slice(0, 32750) + '...';
  }
  if (clean.indexOf('&') === -1 && clean.indexOf('<') === -1 && clean.indexOf('>') === -1) {
    return clean;
  }
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const colLettersToIndex = (ref: string): number => {
  let idx = 0;
  for (let i = 0; i < ref.length; i++) {
    const ch = ref.charCodeAt(i);
    if (ch >= 65 && ch <= 90) {
      idx = idx * 26 + (ch - 64);
    } else if (ch >= 97 && ch <= 122) {
      idx = idx * 26 + (ch - 96);
    } else {
      break;
    }
  }
  return idx - 1;
};

export const indexToColLetters = (index: number): string => {
  let n = index;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

// -------------------- ZIP CENTRAL DIRECTORY PARSER --------------------

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const readUint64LE = (dv: DataView, offset: number): number => {
  const low = dv.getUint32(offset, true);
  const high = dv.getUint32(offset + 4, true);
  return high * 4294967296 + low;
};

const parseZipDirectory = async (file: File): Promise<Map<string, ZipEntry>> => {
  const fileSize = file.size;
  if (fileSize < 22) {
    throw new Error('Invalid ZIP/XLSX archive (file too small).');
  }

  const tailSize = Math.min(fileSize, 65557);
  const tailStart = fileSize - tailSize;
  const tailBuf = new Uint8Array(await file.slice(tailStart, fileSize).arrayBuffer());
  const tailDv = new DataView(tailBuf.buffer, tailBuf.byteOffset, tailBuf.byteLength);

  // Locate End of Central Directory (0x06054b50)
  let eocdPos = -1;
  for (let i = tailBuf.length - 22; i >= 0; i--) {
    if (
      tailBuf[i] === 0x50 &&
      tailBuf[i + 1] === 0x4b &&
      tailBuf[i + 2] === 0x05 &&
      tailBuf[i + 3] === 0x06
    ) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos === -1) {
    throw new Error('Could not locate ZIP End of Central Directory record.');
  }

  let totalEntries = tailDv.getUint16(eocdPos + 10, true);
  let cdSize = tailDv.getUint32(eocdPos + 12, true);
  let cdOffset = tailDv.getUint32(eocdPos + 16, true);

  // Check for ZIP64 EOCD Locator (0x07064b50) 20 bytes before EOCD
  if (
    totalEntries === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  ) {
    const locPos = eocdPos - 20;
    if (
      locPos >= 0 &&
      tailDv.getUint32(locPos, true) === 0x07064b50
    ) {
      const zip64EocdOffset = readUint64LE(tailDv, locPos + 8);
      if (zip64EocdOffset + 56 <= fileSize) {
        const z64Buf = await file.slice(zip64EocdOffset, zip64EocdOffset + 56).arrayBuffer();
        const z64Dv = new DataView(z64Buf);
        if (z64Dv.getUint32(0, true) === 0x06064b50) {
          totalEntries = readUint64LE(z64Dv, 32);
          cdSize = readUint64LE(z64Dv, 40);
          cdOffset = readUint64LE(z64Dv, 48);
        }
      }
    }
  }

  if (cdOffset + cdSize > fileSize) {
    throw new Error('ZIP Central Directory bounds exceed file size (corrupted archive).');
  }

  const cdBuf = new Uint8Array(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cdDv = new DataView(cdBuf.buffer, cdBuf.byteOffset, cdBuf.byteLength);

  const entries = new Map<string, ZipEntry>();
  let pos = 0;
  let count = 0;

  while (pos + 46 <= cdBuf.length && count < totalEntries) {
    const sig = cdDv.getUint32(pos, true);
    if (sig !== 0x02014b50) break;

    const method = cdDv.getUint16(pos + 10, true);
    let compSize = cdDv.getUint32(pos + 20, true);
    let uncompSize = cdDv.getUint32(pos + 24, true);
    const nameLen = cdDv.getUint16(pos + 28, true);
    const extraLen = cdDv.getUint16(pos + 30, true);
    const commentLen = cdDv.getUint16(pos + 32, true);
    let localHeaderOffset = cdDv.getUint32(pos + 42, true);

    const nameStart = pos + 46;
    const name = textDecoderUtf8.decode(cdBuf.subarray(nameStart, nameStart + nameLen));

    if (
      extraLen > 0 &&
      (uncompSize === 0xffffffff || compSize === 0xffffffff || localHeaderOffset === 0xffffffff)
    ) {
      let exPos = nameStart + nameLen;
      const exEnd = exPos + extraLen;
      while (exPos + 4 <= exEnd) {
        const headerId = cdDv.getUint16(exPos, true);
        const dataSize = cdDv.getUint16(exPos + 2, true);
        if (headerId === 0x0001) {
          let valOffset = exPos + 4;
          if (uncompSize === 0xffffffff && valOffset + 8 <= exEnd) {
            uncompSize = readUint64LE(cdDv, valOffset);
            valOffset += 8;
          }
          if (compSize === 0xffffffff && valOffset + 8 <= exEnd) {
            compSize = readUint64LE(cdDv, valOffset);
            valOffset += 8;
          }
          if (localHeaderOffset === 0xffffffff && valOffset + 8 <= exEnd) {
            localHeaderOffset = readUint64LE(cdDv, valOffset);
          }
          break;
        }
        exPos += 4 + dataSize;
      }
    }

    const entry: ZipEntry = {
      name,
      method,
      compressedSize: compSize,
      uncompressedSize: uncompSize,
      localHeaderOffset,
    };
    entries.set(name, entry);
    entries.set(name.toLowerCase(), entry);

    pos += 46 + nameLen + extraLen + commentLen;
    count++;
  }

  return entries;
};

const openZipEntryStream = async (
  file: File,
  entry: ZipEntry,
  onBytesRead?: (read: number, total: number) => void
): Promise<ReadableStream<Uint8Array>> => {
  const lhBuf = await file.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30).arrayBuffer();
  const lhDv = new DataView(lhBuf);
  if (lhDv.getUint32(0, true) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local file header for "${entry.name}".`);
  }
  const fnLen = lhDv.getUint16(26, true);
  const exLen = lhDv.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + 30 + fnLen + exLen;
  const dataEnd = dataStart + entry.compressedSize;

  let offset = dataStart;
  const totalComp = Math.max(1, entry.compressedSize);

  const rawStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= dataEnd) {
        controller.close();
        return;
      }
      const nextEnd = Math.min(dataEnd, offset + XLSX_READ_CHUNK_BYTES);
      const ab = await file.slice(offset, nextEnd).arrayBuffer();
      offset = nextEnd;
      if (onBytesRead) {
        onBytesRead(offset - dataStart, totalComp);
      }
      controller.enqueue(new Uint8Array(ab));
    },
  });

  if (entry.method === 0) {
    return rawStream;
  }
  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream is unavailable in this environment.');
    }
    return rawStream.pipeThrough(new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
  }
  throw new Error(`Unsupported ZIP compression method (${entry.method}) in "${entry.name}".`);
};

const readZipEntryText = async (file: File, entry: ZipEntry): Promise<string> => {
  const stream = await openZipEntryStream(file, entry);
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
};

// -------------------- XLSX METADATA PARSERS --------------------

const parseAttr = (tagAttrs: string, attrName: string): string => {
  const dblNeedle = `${attrName}="`;
  let idx = tagAttrs.indexOf(dblNeedle);
  while (idx !== -1) {
    const prev = idx === 0 ? 32 : tagAttrs.charCodeAt(idx - 1);
    if (prev === 32 || prev === 9 || prev === 10 || prev === 13) {
      const start = idx + dblNeedle.length;
      const end = tagAttrs.indexOf('"', start);
      if (end !== -1) return tagAttrs.slice(start, end);
      return '';
    }
    idx = tagAttrs.indexOf(dblNeedle, idx + 1);
  }
  const sglNeedle = `${attrName}='`;
  idx = tagAttrs.indexOf(sglNeedle);
  while (idx !== -1) {
    const prev = idx === 0 ? 32 : tagAttrs.charCodeAt(idx - 1);
    if (prev === 32 || prev === 9 || prev === 10 || prev === 13) {
      const start = idx + sglNeedle.length;
      const end = tagAttrs.indexOf("'", start);
      if (end !== -1) return tagAttrs.slice(start, end);
      return '';
    }
    idx = tagAttrs.indexOf(sglNeedle, idx + 1);
  }
  return '';
};

interface XfStyleInfo {
  isDate: boolean;
  formatCode: string;
}

const isExcelDateFormatCode = (fmt: string): boolean => {
  if (!fmt) return false;
  // Strip quoted strings, bracketed tokens ([Red], [$-409]), and backslash-escaped chars
  const stripped = fmt
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .toLowerCase();
  if (!stripped || stripped === 'general') return false;
  // Must contain year/day date tokens (y or d) or month token alongside date separators
  return /[yd]/.test(stripped) || /(?:m+[\/.\-]|[\/.\-]m+)/.test(stripped);
};

const parseXlsxStyles = async (
  file: File,
  entries: Map<string, ZipEntry>
): Promise<XfStyleInfo[]> => {
  const entry = entries.get('xl/styles.xml');
  if (!entry) return [];

  const xml = await readZipEntryText(file, entry);
  const customNumFmts = new Map<number, string>();

  // Extract custom <numFmt numFmtId="..." formatCode="..."/>
  const numFmtRe = /<numFmt\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = numFmtRe.exec(xml)) !== null) {
    const attrs = m[1];
    const idStr = parseAttr(attrs, 'numFmtId');
    const fmtRaw = parseAttr(attrs, 'formatCode');
    if (idStr && fmtRaw) {
      customNumFmts.set(parseInt(idStr, 10), unescapeXmlFast(fmtRaw));
    }
  }

  // Isolate <cellXfs>...</cellXfs> so <cellStyleXfs> never shifts style indices
  const cellXfsStart = xml.indexOf('<cellXfs');
  if (cellXfsStart === -1) return [];
  const cellXfsTagEnd = xml.indexOf('>', cellXfsStart);
  const cellXfsEnd = xml.indexOf('</cellXfs>', cellXfsTagEnd);
  if (cellXfsTagEnd === -1 || cellXfsEnd === -1) return [];

  const cellXfsBody = xml.slice(cellXfsTagEnd + 1, cellXfsEnd);
  const styles: XfStyleInfo[] = [];
  const xfRe = /<xf\b([^>]*)(?:\/>|>)/g;

  while ((m = xfRe.exec(cellXfsBody)) !== null) {
    const attrs = m[1];
    const numFmtIdStr = parseAttr(attrs, 'numFmtId');
    const applyNumFmt = parseAttr(attrs, 'applyNumberFormat');
    const numFmtId = numFmtIdStr ? parseInt(numFmtIdStr, 10) : 0;

    if (applyNumFmt === '0') {
      styles.push({ isDate: false, formatCode: '' });
      continue;
    }

    if (BUILTIN_DATE_FMT_IDS.has(numFmtId)) {
      styles.push({
        isDate: true,
        formatCode: BUILTIN_DATE_FMT_STRINGS[numFmtId] || 'yyyy-mm-dd',
      });
      continue;
    }

    const customCode = customNumFmts.get(numFmtId);
    if (customCode) {
      styles.push({ isDate: isExcelDateFormatCode(customCode), formatCode: customCode });
      continue;
    }

    styles.push({ isDate: false, formatCode: '' });
  }

  return styles;
};

interface WorkbookSheetMeta {
  name: string;
  path: string;
}

const parseWorkbookMeta = async (
  file: File,
  entries: Map<string, ZipEntry>
): Promise<{ sheet1Path: string; sheets: WorkbookSheetMeta[]; date1904: boolean }> => {
  const defaultSheet: WorkbookSheetMeta = { name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' };
  let date1904 = false;

  const wbEntry = entries.get('xl/workbook.xml');
  if (!wbEntry) return { sheet1Path: defaultSheet.path, sheets: [defaultSheet], date1904 };

  const wbXml = await readZipEntryText(file, wbEntry);

  const wbPrMatch = wbXml.match(/<workbookPr\b([^>]*)\/?>/);
  if (wbPrMatch) {
    const d1904 = parseAttr(wbPrMatch[1], 'date1904');
    if (d1904 === '1' || d1904 === 'true') {
      date1904 = true;
    }
  }

  const relsMap = new Map<string, string>();
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  if (relsEntry) {
    const relsXml = await readZipEntryText(file, relsEntry);
    const relRe = /<Relationship\b([^>]*)\/?>/g;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(relsXml)) !== null) {
      const id = parseAttr(rm[1], 'Id');
      let target = parseAttr(rm[1], 'Target');
      if (id && target) {
        target = target.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
        if (!target.startsWith('xl/')) {
          target = `xl/${target}`;
        }
        relsMap.set(id, target);
      }
    }
  }

  const sheets: WorkbookSheetMeta[] = [];
  const sheetRe = /<sheet\b([^>]*)\/?>/g;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(wbXml)) !== null) {
    const name = unescapeXmlFast(parseAttr(sm[1], 'name') || `Sheet${sheets.length + 1}`);
    const rId = parseAttr(sm[1], 'r:id') || parseAttr(sm[1], 'id');
    const path = (rId && relsMap.get(rId)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({ name, path });
  }

  if (sheets.length === 0) {
    sheets.push(defaultSheet);
  }

  return { sheet1Path: sheets[0].path, sheets, date1904 };
};

export const getXlsxSheetNames = async (file: File): Promise<string[]> => {
  const entries = await parseZipDirectory(file);
  const { sheets } = await parseWorkbookMeta(file, entries);
  return sheets.map((s) => s.name);
};

// -------------------- STREAMING SHARED STRINGS PARSER --------------------

const extractAllTextFromSi = (siInnerXml: string): string => {
  // Fast-path plain <t>...</t> (95%+ of shared strings)
  if (siInnerXml.indexOf('<rPh') === -1 && siInnerXml.indexOf('<r>') === -1) {
    const tStart = siInnerXml.indexOf('<t');
    if (tStart === -1) return '';
    const tContentStart = siInnerXml.indexOf('>', tStart);
    if (tContentStart === -1) return '';
    if (siInnerXml.charCodeAt(tContentStart - 1) === 47) return ''; // <t/>
    const tEnd = siInnerXml.indexOf('</t>', tContentStart + 1);
    if (tEnd === -1) return '';
    return unescapeXmlFast(siInnerXml.slice(tContentStart + 1, tEnd));
  }

  // Rich text (<r><t>...</t></r>), stripping phonetic guides (<rPh>...</rPh>)
  let source = siInnerXml;
  if (source.indexOf('<rPh') !== -1) {
    source = source.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  }

  let combined = '';
  let searchPos = 0;
  while (true) {
    const tStart = source.indexOf('<t', searchPos);
    if (tStart === -1) break;
    const afterT = source.charCodeAt(tStart + 2);
    // Ensure tag is <t> or <t ...> or <t/>
    if (afterT !== 62 && afterT !== 32 && afterT !== 47 && afterT !== 9 && afterT !== 10 && afterT !== 13) {
      searchPos = tStart + 2;
      continue;
    }
    const tClose = source.indexOf('>', tStart + 2);
    if (tClose === -1) break;
    if (source.charCodeAt(tClose - 1) === 47) {
      searchPos = tClose + 1;
      continue;
    }
    const tEnd = source.indexOf('</t>', tClose + 1);
    if (tEnd === -1) break;
    combined += unescapeXmlFast(source.slice(tClose + 1, tEnd));
    searchPos = tEnd + 4;
  }
  return combined;
};

const streamSharedStrings = async (
  file: File,
  entries: Map<string, ZipEntry>,
  signal?: AbortSignal
): Promise<string[]> => {
  const entry = entries.get('xl/sharedStrings.xml') || entries.get('xl/sharedstrings.xml');
  if (!entry) return [];

  const stream = await openZipEntryStream(file, entry);
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  const sharedStrings: string[] = [];

  let carry = '';
  let processedChunks = 0;

  const drainSiBlocks = () => {
    let pos = 0;
    while (true) {
      const siStart = carry.indexOf('<si', pos);
      if (siStart === -1) {
        // Keep up to last '<' in case '<si' is split across chunks
        const tailLt = carry.lastIndexOf('<');
        carry = tailLt >= pos ? carry.slice(tailLt) : '';
        return;
      }

      const tagEnd = carry.indexOf('>', siStart + 3);
      if (tagEnd === -1) {
        carry = carry.slice(siStart);
        return;
      }

      // Self-closing <si/>
      if (carry.charCodeAt(tagEnd - 1) === 47) {
        sharedStrings.push('');
        pos = tagEnd + 1;
        continue;
      }

      const siEnd = carry.indexOf('</si>', tagEnd + 1);
      if (siEnd === -1) {
        carry = carry.slice(siStart);
        return;
      }

      sharedStrings.push(extractAllTextFromSi(carry.slice(tagEnd + 1, siEnd)));
      pos = siEnd + 5;
    }
  };

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new Error('Consolidation was cancelled by the user.');
    }
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    drainSiBlocks();
    if (++processedChunks % 16 === 0) {
      await yieldToUi();
    }
  }

  carry += decoder.decode();
  drainSiBlocks();

  return sharedStrings;
};

// -------------------- FAST <row> PARSER --------------------

const extractValueTagContent = (cellInner: string): string => {
  let pos = 0;
  while (true) {
    const vStart = cellInner.indexOf('<v', pos);
    if (vStart === -1) return '';
    const nextCh = cellInner.charCodeAt(vStart + 2);
    if (nextCh === 62 /* > */ || nextCh === 32 || nextCh === 47) {
      const tagEnd = cellInner.indexOf('>', vStart + 2);
      if (tagEnd === -1) return '';
      if (cellInner.charCodeAt(tagEnd - 1) === 47) return '';
      const vEnd = cellInner.indexOf('</v>', tagEnd + 1);
      if (vEnd === -1) return '';
      return cellInner.slice(tagEnd + 1, vEnd);
    }
    pos = vStart + 2;
  }
};

const parseXlsxRowXml = (
  rowInner: string,
  sharedStrings: string[],
  styles: XfStyleInfo[],
  date1904: boolean,
  maxCols: number
): any[] => {
  const row: any[] = [];
  let nextImplicitCol = 0;
  let pos = 0;

  while (true) {
    const cStart = rowInner.indexOf('<c', pos);
    if (cStart === -1) break;

    const afterC = rowInner.charCodeAt(cStart + 2);
    if (afterC !== 32 && afterC !== 62 && afterC !== 47 && afterC !== 9) {
      pos = cStart + 2;
      continue;
    }

    const tagClose = rowInner.indexOf('>', cStart + 2);
    if (tagClose === -1) break;

    // Self-closing <c .../> -> empty formatted cell, skip immediately!
    if (rowInner.charCodeAt(tagClose - 1) === 47) {
      pos = tagClose + 1;
      nextImplicitCol++;
      continue;
    }

    const cellEnd = rowInner.indexOf('</c>', tagClose + 1);
    if (cellEnd === -1) break;

    const attrs = rowInner.slice(cStart + 2, tagClose);
    const refStr = parseAttr(attrs, 'r');
    const colIdx = refStr ? colLettersToIndex(refStr) : nextImplicitCol;
    nextImplicitCol = colIdx + 1;

    if (colIdx >= 0 && colIdx < maxCols) {
      const cellType = parseAttr(attrs, 't'); // '', 's', 'inlineStr', 'str', 'b', 'e', 'n'
      const cellInner = rowInner.slice(tagClose + 1, cellEnd);

      let resolved: any = '';

      if (cellType === 's') {
        const vRaw = extractValueTagContent(cellInner);
        if (vRaw !== '') {
          const sIdx = parseInt(vRaw, 10);
          resolved = sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
        }
      } else if (cellType === 'inlineStr') {
        const isStart = cellInner.indexOf('<is');
        if (isStart !== -1) {
          const isOpenEnd = cellInner.indexOf('>', isStart + 3);
          const isClose = cellInner.lastIndexOf('</is>');
          if (isOpenEnd !== -1 && isClose > isOpenEnd) {
            resolved = extractAllTextFromSi(cellInner.slice(isOpenEnd + 1, isClose));
          }
        } else {
          resolved = extractAllTextFromSi(cellInner);
        }
      } else if (cellType === 'str' || cellType === 'e') {
        resolved = unescapeXmlFast(extractValueTagContent(cellInner));
      } else if (cellType === 'b') {
        const vRaw = extractValueTagContent(cellInner).trim();
        resolved = vRaw === '1' || vRaw.toLowerCase() === 'true' ? 'TRUE' : 'FALSE';
      } else {
        // Numeric or Date (t === '' or t === 'n')
        const vRaw = extractValueTagContent(cellInner);
        if (vRaw !== '') {
          const num = Number(vRaw);
          if (Number.isFinite(num)) {
            const styleStr = parseAttr(attrs, 's');
            const styleIdx = styleStr ? parseInt(styleStr, 10) : 0;
            const styleInfo = styleIdx > 0 && styleIdx < styles.length ? styles[styleIdx] : undefined;

            if (styleInfo?.isDate) {
              const adjustedSerial = date1904 ? num + 1462 : num;
              resolved = {
                t: 'n',
                v: adjustedSerial,
                z: styleInfo.formatCode || 'yyyy-mm-dd',
              } as StreamedDateCell;
            } else {
              resolved = num;
            }
          } else {
            resolved = unescapeXmlFast(vRaw);
          }
        }
      }

      if (resolved !== '' && resolved !== undefined) {
        while (row.length < colIdx) {
          row.push('');
        }
        row[colIdx] = resolved;
      }
    }

    pos = cellEnd + 4;
  }

  return row;
};

// -------------------- STREAMING XLSX FIRST SHEET READER --------------------

export const streamXlsxFirstSheet = async (
  file: File,
  onRow: StreamedRowCallback,
  options?: StreamReadOptions & { sheetName?: string; sheetIndex?: number }
): Promise<void> => {
  const maxCols = options?.maxCols ?? DEFAULT_MAX_COLS;
  const maxRows = options?.maxRows;
  const signal = options?.signal;

  const entries = await parseZipDirectory(file);
  const { sheet1Path, sheets, date1904 } = await parseWorkbookMeta(file, entries);

  let targetPath = sheet1Path;
  if (options?.sheetName) {
    const found = sheets.find((s) => s.name === options.sheetName)
      || sheets.find((s) => s.name.toLowerCase() === options.sheetName!.toLowerCase());
    if (found) targetPath = found.path;
  } else if (options?.sheetIndex !== undefined && sheets[options.sheetIndex]) {
    targetPath = sheets[options.sheetIndex].path;
  }

  let sheetEntry = entries.get(targetPath) || entries.get(targetPath.toLowerCase());
  if (!sheetEntry) {
    sheetEntry = entries.get('xl/worksheets/sheet1.xml');
  }
  if (!sheetEntry) {
    throw new Error('Could not find worksheet data inside the XLSX workbook.');
  }

  // Note: If preflight only needs row 0 (headers) when maxRows === 1?
  // Wait: row 0 headers in XLSX are almost always shared strings (t="s"), so we need sharedStrings + styles!
  const [styles, sharedStrings] = await Promise.all([
    parseXlsxStyles(file, entries),
    streamSharedStrings(file, entries, signal),
  ]);

  if (signal?.aborted) {
    throw new Error('Consolidation was cancelled by the user.');
  }

  const stream = await openZipEntryStream(file, sheetEntry, options?.onChunkProgress);
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  let carry = '';
  let inSheetData = false;
  let emittedCount = 0;
  let stoppedEarly = false;

  const drainRows = async () => {
    if (!inSheetData) {
      const sdIdx = carry.indexOf('<sheetData');
      if (sdIdx === -1) {
        // Keep tiny tail so '<sheetData' spanning chunks is not lost
        carry = carry.length > 32 ? carry.slice(-32) : carry;
        return;
      }
      const sdClose = carry.indexOf('>', sdIdx);
      if (sdClose === -1) {
        carry = carry.slice(sdIdx);
        return;
      }
      if (carry.charCodeAt(sdClose - 1) === 47) {
        // Self-closing <sheetData/> -> empty sheet
        carry = '';
        stoppedEarly = true;
        return;
      }
      carry = carry.slice(sdClose + 1);
      inSheetData = true;
    }

    let pos = 0;
    while (true) {
      const rStart = carry.indexOf('<row', pos);
      if (rStart === -1) {
        if (carry.indexOf('</sheetData>', pos) !== -1) {
          carry = '';
          stoppedEarly = true;
          return;
        }
        const lastLt = carry.lastIndexOf('<');
        carry = lastLt >= pos ? carry.slice(lastLt) : '';
        return;
      }

      const tagEnd = carry.indexOf('>', rStart + 4);
      if (tagEnd === -1) {
        carry = carry.slice(rStart);
        return;
      }

      // Self-closing <row .../> -> empty row, skip
      if (carry.charCodeAt(tagEnd - 1) === 47) {
        pos = tagEnd + 1;
        continue;
      }

      const rEnd = carry.indexOf('</row>', tagEnd + 1);
      if (rEnd === -1) {
        carry = carry.slice(rStart);
        return;
      }

      const rowInner = carry.slice(tagEnd + 1, rEnd);
      if (rowInner.indexOf('<c') !== -1) {
        const parsedRow = parseXlsxRowXml(rowInner, sharedStrings, styles, date1904, maxCols);
        if (parsedRow.length > 0) {
          const cont = await onRow(parsedRow, emittedCount);
          emittedCount++;
          if (cont === false || (maxRows !== undefined && emittedCount >= maxRows)) {
            stoppedEarly = true;
            carry = '';
            return;
          }
          if (emittedCount % 12000 === 0) {
            await yieldToUi();
            if (signal?.aborted) {
              throw new Error('Consolidation was cancelled by the user.');
            }
          }
        }
      }

      pos = rEnd + 6;
    }
  };

  try {
    while (!stoppedEarly) {
      if (signal?.aborted) {
        throw new Error('Consolidation was cancelled by the user.');
      }
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      await drainRows();
    }
    if (!stoppedEarly) {
      carry += decoder.decode();
      await drainRows();
    }
  } finally {
    if (stoppedEarly) {
      await reader.cancel().catch(() => {});
    }
  }
};

// -------------------- STREAMING CSV / TSV READER --------------------

const detectDelimiterFromSample = (sample: string, fileName: string): string => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tsv')) return '\t';

  // Count candidates in first non-empty line (outside quotes)
  const candidates = [',', '\t', ';', '|'];
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0, '|': 0 };
  let inQuotes = false;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (counts[','] > 0 || counts['\t'] > 0 || counts[';'] > 0 || counts['|'] > 0) {
        break;
      }
    } else if (!inQuotes && counts[ch] !== undefined) {
      counts[ch]++;
    }
  }

  let best = ',';
  let bestCount = counts[','];
  for (const delim of candidates) {
    if (counts[delim] > bestCount) {
      bestCount = counts[delim];
      best = delim;
    }
  }
  return best;
};

export const streamDelimitedRows = async (
  file: File,
  onRow: StreamedRowCallback,
  options?: StreamReadOptions
): Promise<void> => {
  const maxCols = options?.maxCols ?? DEFAULT_MAX_COLS;
  const maxRows = options?.maxRows;
  const signal = options?.signal;

  const fileSize = file.size;
  if (fileSize === 0) return;

  // Sniff BOM & delimiter from first 16 KB
  const sniffLen = Math.min(fileSize, 16384);
  const sniffBytes = new Uint8Array(await file.slice(0, sniffLen).arrayBuffer());

  let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' = 'utf-8';
  let bomSkipBytes = 0;

  if (sniffBytes.length >= 3 && sniffBytes[0] === 0xef && sniffBytes[1] === 0xbb && sniffBytes[2] === 0xbf) {
    bomSkipBytes = 3;
  } else if (sniffBytes.length >= 2 && sniffBytes[0] === 0xff && sniffBytes[1] === 0xfe) {
    encoding = 'utf-16le';
    bomSkipBytes = 2;
  } else if (sniffBytes.length >= 2 && sniffBytes[0] === 0xfe && sniffBytes[1] === 0xff) {
    encoding = 'utf-16be';
    bomSkipBytes = 2;
  }

  const sniffDecoder = new TextDecoder(encoding);
  const sampleText = sniffDecoder.decode(sniffBytes.subarray(bomSkipBytes));
  const delimiter = detectDelimiterFromSample(sampleText, file.name);

  const decoder = new TextDecoder(encoding);

  let offset = bomSkipBytes;
  let currentRow: string[] = [];
  let fieldStartText = '';
  let inQuotes = false;
  let sawCr = false;
  let emittedCount = 0;
  let stoppedEarly = false;

  const flushField = (val: string) => {
    if (currentRow.length < maxCols) {
      currentRow.push(val);
    }
  };

  const emitCurrentRow = async () => {
    let hasValue = false;
    for (let i = 0; i < currentRow.length; i++) {
      if (currentRow[i] !== '' && currentRow[i].trim() !== '') {
        hasValue = true;
        break;
      }
    }
    const rowToEmit = currentRow;
    currentRow = [];

    if (!hasValue) return;

    const cont = await onRow(rowToEmit, emittedCount);
    emittedCount++;
    if (cont === false || (maxRows !== undefined && emittedCount >= maxRows)) {
      stoppedEarly = true;
    } else if (emittedCount % 15000 === 0) {
      await yieldToUi();
      if (signal?.aborted) {
        throw new Error('Consolidation was cancelled by the user.');
      }
    }
  };

  const processChunkText = async (text: string) => {
    const len = text.length;
    let sliceStart = 0;

    for (let i = 0; i < len; i++) {
      const ch = text[i];

      if (sawCr) {
        sawCr = false;
        if (ch === '\n') {
          sliceStart = i + 1;
          continue;
        }
      }

      if (inQuotes) {
        if (ch === '"') {
          fieldStartText += text.slice(sliceStart, i);
          // Peek next char; if also '"' it's an escaped quote
          if (i + 1 < len) {
            if (text[i + 1] === '"') {
              fieldStartText += '"';
              i++;
              sliceStart = i + 1;
            } else {
              inQuotes = false;
              sliceStart = i + 1;
            }
          } else {
            // Quote was at end of chunk; handle via state flag? Wait: simpler - keep a pendingQuote flag
            // handled seamlessly below by rolling sliceStart
            inQuotes = false;
            // Track pending quote check across chunks via edge flag
            pendingEndQuoteChunk = true;
            sliceStart = i + 1;
          }
        }
      } else {
        if (pendingEndQuoteChunk) {
          pendingEndQuoteChunk = false;
          if (ch === '"') {
            // The previous chunk ended with the first quote of a `""` pair!
            fieldStartText += '"';
            inQuotes = true;
            sliceStart = i + 1;
            continue;
          }
        }

        if (ch === '"' && fieldStartText === '' && sliceStart === i) {
          inQuotes = true;
          sliceStart = i + 1;
        } else if (ch === delimiter) {
          flushField(fieldStartText + text.slice(sliceStart, i));
          fieldStartText = '';
          sliceStart = i + 1;
        } else if (ch === '\n' || ch === '\r') {
          flushField(fieldStartText + text.slice(sliceStart, i));
          fieldStartText = '';
          if (ch === '\r') sawCr = true;
          sliceStart = i + 1;
          await emitCurrentRow();
          if (stoppedEarly) return;
        }
      }
    }

    if (sliceStart < len) {
      fieldStartText += text.slice(sliceStart);
    }
  };

  let pendingEndQuoteChunk = false;

  while (offset < fileSize && !stoppedEarly) {
    if (signal?.aborted) {
      throw new Error('Consolidation was cancelled by the user.');
    }

    const nextEnd = Math.min(fileSize, offset + CSV_READ_CHUNK_BYTES);
    const ab = await file.slice(offset, nextEnd).arrayBuffer();
    offset = nextEnd;

    if (options?.onChunkProgress) {
      options.onChunkProgress(offset, fileSize);
    }

    const chunkText = decoder.decode(new Uint8Array(ab), { stream: offset < fileSize });
    if (chunkText) {
      await processChunkText(chunkText);
    }
  }

  if (!stoppedEarly) {
    const tailText = decoder.decode();
    if (tailText) {
      await processChunkText(tailText);
    }
    if (!stoppedEarly && (fieldStartText !== '' || currentRow.length > 0)) {
      flushField(fieldStartText);
      fieldStartText = '';
      await emitCurrentRow();
    }
  }
};

// -------------------- UNIFIED SPREADSHEET ROW STREAMER --------------------

export const sniffFileFormat = async (
  file: File
): Promise<'xlsx' | 'csv' | 'sheetjs'> => {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    // Still verify it's not actually a renamed PK zip!
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
      return 'xlsx';
    }
    return 'csv';
  }

  if (lower.endsWith('.xls') || lower.endsWith('.xlsb') || lower.endsWith('.ods')) {
    return 'sheetjs';
  }

  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  // ZIP magic PK\x03\x04
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return 'xlsx';
  }
  // Legacy OLE2 BIFF (.xls) magic D0 CF 11 E0
  if (head.length >= 4 && head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    return 'sheetjs';
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    return 'sheetjs';
  }

  return 'csv';
};

const streamViaSheetJsFallback = async (
  file: File,
  onRow: StreamedRowCallback,
  options?: StreamReadOptions & { sheetName?: string; sheetIndex?: number }
): Promise<void> => {
  const maxCols = options?.maxCols ?? DEFAULT_MAX_COLS;
  const maxRows = options?.maxRows;
  const signal = options?.signal;

  const ab = await file.arrayBuffer();
  const uint8 = new Uint8Array(ab);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(uint8, {
      type: 'array',
      cellDates: false,
      cellNF: true,
      cellText: true,
      cellHTML: false,
      cellFormula: false,
    });
  } catch {
    const text = await file.text();
    wb = XLSX.read(text, { type: 'string', cellDates: false, cellNF: true });
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Workbook contains no readable sheets or tabs.');
  }

  let sheetName = wb.SheetNames[0];
  if (options?.sheetName) {
    const matched =
      wb.SheetNames.find((s) => s === options.sheetName) ||
      wb.SheetNames.find((s) => s.toLowerCase() === options.sheetName!.toLowerCase());
    if (matched) sheetName = matched;
  } else if (options?.sheetIndex !== undefined && wb.SheetNames[options.sheetIndex]) {
    sheetName = wb.SheetNames[options.sheetIndex];
  }

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet "${sheetName}" is empty or could not be loaded.`);
  }

  clampWorksheetRange(ws, maxCols, 1048576);
  const ref = ws['!ref'];
  if (!ref) return;

  const range = XLSX.utils.decode_range(ref);
  const maxColIndex = Math.min(maxCols - 1, range.e.c);
  const totalCols = maxColIndex + 1;
  const denseData = (ws as any)['!data'];

  let emittedCount = 0;
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (signal?.aborted) {
      throw new Error('Consolidation was cancelled by the user.');
    }
    const row: any[] = new Array(totalCols).fill('');
    let hasValue = false;

    for (let c = 0; c <= maxColIndex; c++) {
      const cell = denseData
        ? denseData[r]?.[c]
        : ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === undefined || cell.v === null) continue;

      if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && isExcelDateFormatCode(cell.z)) {
        row[c] = {
          t: 'n',
          v: cell.v,
          z: cell.z,
          w: cell.w,
        } as StreamedDateCell;
        hasValue = true;
      } else {
        const v = cell.v;
        if (String(v).trim() !== '') hasValue = true;
        row[c] = typeof v === 'object' ? String(v.v ?? v.w ?? '') : v;
      }
    }

    if (hasValue) {
      const cont = await onRow(row, emittedCount);
      emittedCount++;
      if (cont === false || (maxRows !== undefined && emittedCount >= maxRows)) {
        break;
      }
      if (emittedCount % 15000 === 0) {
        await yieldToUi();
      }
    }
  }
};

export const streamSpreadsheetRows = async (
  file: File,
  onRow: StreamedRowCallback,
  options?: StreamReadOptions & { sheetName?: string; sheetIndex?: number }
): Promise<'xlsx' | 'csv' | 'sheetjs'> => {
  const format = await sniffFileFormat(file);
  if (format === 'xlsx') {
    await streamXlsxFirstSheet(file, onRow, options);
  } else if (format === 'csv') {
    await streamDelimitedRows(file, onRow, options);
  } else {
    await streamViaSheetJsFallback(file, onRow, options);
  }
  return format;
};

// -------------------- FAST STREAMING XLSX WRITER --------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const updateCrc32 = (crc: number, bytes: Uint8Array): number => {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const dateToExcelSerialUtc = (d: Date): number => {
  // Excel epoch: 1899-12-30 UTC (includes 1900 leap year bug)
  const utcMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const epochMs = Date.UTC(1899, 11, 30);
  return Math.round((utcMs - epochMs) / 86400000);
};

interface WrittenZipEntryMeta {
  nameBytes: Uint8Array;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

class FastStreamingZipBuilder {
  private blobParts: BlobPart[] = [];
  private currentOffset = 0;
  private entries: WrittenZipEntryMeta[] = [];

  public async addStreamedTextEntry(
    fileName: string,
    produceChunks: (emit: (xmlChunk: string) => Promise<void>) => Promise<void>,
    compress = true
  ): Promise<void> {
    const nameBytes = textEncoderUtf8.encode(fileName);
    const localHeaderOffset = this.currentOffset;

    let crc = 0;
    let uncompressedSize = 0;
    let compressedSize = 0;
    const compressedChunks: Uint8Array[] = [];

    if (compress && typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();

      const pumpOut = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          compressedSize += value.byteLength;
          compressedChunks.push(value);
        }
      })();

      await produceChunks(async (chunkStr: string) => {
        if (!chunkStr) return;
        const bytes = textEncoderUtf8.encode(chunkStr);
        crc = updateCrc32(crc, bytes);
        uncompressedSize += bytes.byteLength;
        await writer.write(bytes);
      });

      await writer.close();
      await pumpOut;

      this.writeLocalAndPayload(
        nameBytes,
        8,
        crc,
        compressedSize,
        uncompressedSize,
        compressedChunks,
        localHeaderOffset
      );
    } else {
      const rawChunks: Uint8Array[] = [];
      await produceChunks(async (chunkStr: string) => {
        if (!chunkStr) return;
        const bytes = textEncoderUtf8.encode(chunkStr);
        crc = updateCrc32(crc, bytes);
        uncompressedSize += bytes.byteLength;
        compressedSize += bytes.byteLength;
        rawChunks.push(bytes);
      });

      this.writeLocalAndPayload(
        nameBytes,
        0,
        crc,
        compressedSize,
        uncompressedSize,
        rawChunks,
        localHeaderOffset
      );
    }
  }

  public async addStaticXmlEntry(fileName: string, content: string): Promise<void> {
    await this.addStreamedTextEntry(
      fileName,
      async (emit) => {
        await emit(content);
      },
      true
    );
  }

  private writeLocalAndPayload(
    nameBytes: Uint8Array,
    method: number,
    crc32: number,
    compressedSize: number,
    uncompressedSize: number,
    payloadChunks: Uint8Array[],
    localHeaderOffset: number
  ): void {
    const lh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0x0800, true); // UTF-8 flag
    dv.setUint16(8, method, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0x5421, true);
    dv.setUint32(14, crc32 >>> 0, true);
    dv.setUint32(18, compressedSize >>> 0, true);
    dv.setUint32(22, uncompressedSize >>> 0, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    this.blobParts.push(lh as unknown as BlobPart);
    this.currentOffset += lh.byteLength;

    for (let i = 0; i < payloadChunks.length; i++) {
      this.blobParts.push(payloadChunks[i] as unknown as BlobPart);
      this.currentOffset += payloadChunks[i].byteLength;
    }

    this.entries.push({
      nameBytes,
      method,
      crc32: crc32 >>> 0,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
  }

  public finishBlob(): Blob {
    const cdStart = this.currentOffset;
    let cdSize = 0;

    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const cd = new Uint8Array(46 + e.nameBytes.length);
      const dv = new DataView(cd.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true); // version made by
      dv.setUint16(6, 20, true); // version needed
      dv.setUint16(8, 0x0800, true); // UTF-8
      dv.setUint16(10, e.method, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0x5421, true);
      dv.setUint32(16, e.crc32, true);
      dv.setUint32(20, e.compressedSize >>> 0, true);
      dv.setUint32(24, e.uncompressedSize >>> 0, true);
      dv.setUint16(28, e.nameBytes.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, e.localHeaderOffset >>> 0, true);
      cd.set(e.nameBytes, 46);

      this.blobParts.push(cd as unknown as BlobPart);
      cdSize += cd.byteLength;
    }

    const eocd = new Uint8Array(22);
    const eDv = new DataView(eocd.buffer);
    eDv.setUint32(0, 0x06054b50, true);
    eDv.setUint16(4, 0, true);
    eDv.setUint16(6, 0, true);
    eDv.setUint16(8, this.entries.length, true);
    eDv.setUint16(10, this.entries.length, true);
    eDv.setUint32(12, cdSize >>> 0, true);
    eDv.setUint32(16, cdStart >>> 0, true);
    eDv.setUint16(20, 0, true);
    this.blobParts.push(eocd as unknown as BlobPart);

    return new Blob(this.blobParts, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
}

export interface FastSheetSpec {
  name: string;
  headers?: string[];
  rows: any[][];
  colWidths?: number[];
}

const formatXmlCell = (
  val: any,
  cellRef: string,
  isHeader: boolean
): string => {
  if (val === undefined || val === null || val === '') return '';

  if (typeof val === 'object' && !(val instanceof Date)) {
    if (val.t === 'n' && typeof val.v === 'number' && Number.isFinite(val.v)) {
      return `<c r="${cellRef}" s="1"><v>${val.v}</v></c>`;
    }
    const fallbackStr = String(val.v ?? val.w ?? val.text ?? '');
    if (!fallbackStr) return '';
    const esc = escapeXmlText(fallbackStr);
    const preserve = esc.length > 0 && (esc[0] === ' ' || esc[esc.length - 1] === ' ' || esc.includes('\n')) ? ' xml:space="preserve"' : '';
    return `<c r="${cellRef}"${isHeader ? ' s="2"' : ''} t="inlineStr"><is><t${preserve}>${esc}</t></is></c>`;
  }

  if (val instanceof Date && !isNaN(val.getTime())) {
    return `<c r="${cellRef}" s="1"><v>${dateToExcelSerialUtc(val)}</v></c>`;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return `<c r="${cellRef}"><v>${val}</v></c>`;
  }

  const str = String(val);
  if (str === '') return '';
  const esc = escapeXmlText(str);
  const preserve =
    esc.length > 0 && (esc[0] === ' ' || esc[esc.length - 1] === ' ' || esc.includes('\n'))
      ? ' xml:space="preserve"'
      : '';
  return `<c r="${cellRef}"${isHeader ? ' s="2"' : ''} t="inlineStr"><is><t${preserve}>${esc}</t></is></c>`;
};

const sanitizeSheetName = (name: string): string => {
  const cleaned = String(name || 'Sheet1').replace(/[:\\/?*\[\]]/g, '_').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
};

export const buildFastXlsxBlob = async (
  sheet1: FastSheetSpec,
  sheet2?: FastSheetSpec,
  signal?: AbortSignal
): Promise<Blob> => {
  const zip = new FastStreamingZipBuilder();
  const s1Name = sanitizeSheetName(sheet1.name);
  const s2Name = sheet2 ? sanitizeSheetName(sheet2.name) : '';

  await zip.addStaticXmlEntry(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      (sheet2
        ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        : '') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'
  );

  await zip.addStaticXmlEntry(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  );

  await zip.addStaticXmlEntry(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      `<sheet name="${escapeXmlText(s1Name)}" sheetId="1" r:id="rId1"/>` +
      (sheet2 ? `<sheet name="${escapeXmlText(s2Name)}" sheetId="2" r:id="rId2"/>` : '') +
      '</sheets>' +
      '</workbook>'
  );

  await zip.addStaticXmlEntry(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      (sheet2
        ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        : '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>') +
      '</Relationships>'
  );

  // Styles: xf 0 = default, xf 1 = yyyy-mm-dd date, xf 2 = bold header
  await zip.addStaticXmlEntry(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>' +
      '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '</cellXfs>' +
      '</styleSheet>'
  );

  const writeSheetEntry = async (path: string, spec: FastSheetSpec) => {
    const colCount = Math.max(
      spec.headers?.length ?? 0,
      spec.colWidths?.length ?? 0,
      spec.rows[0]?.length ?? 0
    );
    const colLetters: string[] = [];
    for (let c = 0; c < colCount; c++) {
      colLetters.push(indexToColLetters(c));
    }

    const ensureColLetter = (c: number): string => {
      while (colLetters.length <= c) {
        colLetters.push(indexToColLetters(colLetters.length));
      }
      return colLetters[c];
    };

    await zip.addStreamedTextEntry(path, async (emit) => {
      let headerXml =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

      if (spec.colWidths && spec.colWidths.length > 0) {
        headerXml += '<cols>';
        for (let c = 0; c < spec.colWidths.length; c++) {
          const w = Math.max(8, Math.min(60, spec.colWidths[c] || 12));
          headerXml += `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
        }
        headerXml += '</cols>';
      }
      headerXml += '<sheetData>';

      let rowParts: string[] = [headerXml];
      let excelRowNum = 1;

      if (spec.headers && spec.headers.length > 0) {
        let rXml = `<row r="${excelRowNum}">`;
        for (let c = 0; c < spec.headers.length; c++) {
          const cellXml = formatXmlCell(spec.headers[c], `${ensureColLetter(c)}${excelRowNum}`, true);
          if (cellXml) rXml += cellXml;
        }
        rXml += '</row>';
        rowParts.push(rXml);
        excelRowNum++;
      }

      let flushCount = 0;
      for (let i = 0; i < spec.rows.length; i++) {
        if (signal?.aborted) {
          throw new Error('Consolidation was cancelled by the user.');
        }

        const row = spec.rows[i];
        let rXml = `<row r="${excelRowNum}">`;
        for (let c = 0; c < row.length; c++) {
          const cellXml = formatXmlCell(row[c], `${ensureColLetter(c)}${excelRowNum}`, false);
          if (cellXml) rXml += cellXml;
        }
        rXml += '</row>';
        rowParts.push(rXml);
        excelRowNum++;

        if (rowParts.length >= 2500) {
          await emit(rowParts.join(''));
          rowParts = [];
          flushCount++;
          if (flushCount % 4 === 0) {
            await yieldToUi();
          }
        }
      }

      rowParts.push('</sheetData></worksheet>');
      await emit(rowParts.join(''));
    });
  };

  await writeSheetEntry('xl/worksheets/sheet1.xml', sheet1);
  if (sheet2) {
    await writeSheetEntry('xl/worksheets/sheet2.xml', sheet2);
  }

  return zip.finishBlob();
};

/**
 * Triggers a browser file download safely with delayed Blob URL revocation
 * so large multi-megabyte files are never aborted mid-transfer in Chromium/iFrames.
 */
export const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }, 1500);
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 60000);
};
