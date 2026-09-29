import React, { useState, useMemo } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  FileSpreadsheet,
  Loader2,
  Mail,
  Calendar,
  Check,
  Filter,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ParsedInventoryRow {
  rowIndex: number;
  sessionKey: string;
  region: 'AMS' | 'APJ' | 'EMEA' | 'OTHER';
  businessType: string;
  status: string;
  isInProcess: boolean;
  lastChangedRaw: string;
  candidateDates: string[];
  primaryDate: string;
  releasedItemCount: number;
  blockedItemCount: number;
}

interface RegionalStatRow {
  region: string;
  prefixLabel: string;
  releasedFiles: number;
  releasedItemCount: number;
  escalatedFiles: number;
  escalatedCount: number;
  inProcessFileCount: number;
}

export const InventoryReport: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [allParsedRows, setAllParsedRows] = useState<ParsedInventoryRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [copiedMode, setCopiedMode] = useState<'text' | 'email' | null>(null);
  const [showDetailsTable, setShowDetailsTable] = useState<boolean>(false);
  const [detailsTab, setDetailsTab] = useState<'released' | 'escalated' | 'inprocess'>('released');

  const parseZymeNumber = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val).trim();
    if (!str) return 0;

    if (str.includes('.') && str.includes(',')) {
      const dotIdx = str.lastIndexOf('.');
      const commaIdx = str.lastIndexOf(',');
      if (dotIdx < commaIdx) {
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        return parseFloat(str.replace(/,/g, '')) || 0;
      }
    }

    if (str.includes('.') && !str.includes(',')) {
      if (/\.\d{3}/.test(str)) {
        return parseFloat(str.replace(/\./g, '')) || 0;
      }
    }

    return parseFloat(str.replace(/,/g, '')) || 0;
  };

  // Extract YYYY-MM-DD candidate dates from Excel raw/formatted cell
  const extractDatesFromCell = (
    rawVal: any,
    formattedVal: any
  ): { candidateDates: string[]; primaryDate: string; displayStr: string } => {
    const candidates = new Set<string>();
    let primaryDate = '';
    const displayStr = String(formattedVal ?? rawVal ?? '').trim();

    // 1. Excel serial number
    if (typeof rawVal === 'number' && rawVal > 20000 && rawVal < 100000) {
      const ssf = (XLSX as any).SSF || (XLSX as any).default?.SSF;
      if (ssf && typeof ssf.parse_date_code === 'function') {
        const parsed = ssf.parse_date_code(rawVal);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const iso = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
          candidates.add(iso);
          primaryDate = iso;
        }
      }
    }

    // 2. Date instance
    if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
      const utcIso = `${rawVal.getUTCFullYear()}-${String(rawVal.getUTCMonth() + 1).padStart(2, '0')}-${String(rawVal.getUTCDate()).padStart(2, '0')}`;
      const localIso = `${rawVal.getFullYear()}-${String(rawVal.getMonth() + 1).padStart(2, '0')}-${String(rawVal.getDate()).padStart(2, '0')}`;
      candidates.add(utcIso);
      candidates.add(localIso);
      if (!primaryDate) primaryDate = utcIso;
    }

    // 3. String parsing from both rawVal and formattedVal
    const stringsToCheck = [String(rawVal ?? '').trim(), displayStr].filter(Boolean);
    for (const str of stringsToCheck) {
      const isoMatch = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (isoMatch) {
        const y = isoMatch[1];
        const m = isoMatch[2].padStart(2, '0');
        const d = isoMatch[3].padStart(2, '0');
        const iso = `${y}-${m}-${d}`;
        candidates.add(iso);
        if (!primaryDate) primaryDate = iso;
      }

      const dmyMatch = str.match(/(?:^|\b)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\b|$)/);
      if (dmyMatch) {
        const p1 = parseInt(dmyMatch[1], 10);
        const p2 = parseInt(dmyMatch[2], 10);
        const y = dmyMatch[3];

        if (p1 > 12 && p2 <= 12) {
          const iso = `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
          candidates.add(iso);
          if (!primaryDate) primaryDate = iso;
        } else if (p2 > 12 && p1 <= 12) {
          const iso = `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
          candidates.add(iso);
          if (!primaryDate) primaryDate = iso;
        } else if (p1 <= 12 && p2 <= 12) {
          const isoDMY = `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
          const isoMDY = `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
          candidates.add(isoDMY);
          candidates.add(isoMDY);
          if (!primaryDate) primaryDate = isoDMY;
        }
      }

      const parsedDate = new Date(str);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 2000) {
        const localIso = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
        const utcIso = `${parsedDate.getUTCFullYear()}-${String(parsedDate.getUTCMonth() + 1).padStart(2, '0')}-${String(parsedDate.getUTCDate()).padStart(2, '0')}`;
        candidates.add(localIso);
        candidates.add(utcIso);
        if (!primaryDate) primaryDate = localIso;
      }
    }

    return {
      candidateDates: Array.from(candidates),
      primaryDate,
      displayStr,
    };
  };

  // Map Session Key to Region:
  // Starting with Nasa -> AMS, APJ -> APJ, EMEA -> EMEA
  const getRegionFromSessionKey = (sessionKey: string): 'AMS' | 'APJ' | 'EMEA' | 'OTHER' => {
    const clean = sessionKey.trim().toUpperCase();
    if (!clean) return 'OTHER';

    if (clean.startsWith('NASA') || clean.startsWith('AMS')) return 'AMS';
    if (clean.startsWith('APJ')) return 'APJ';
    if (clean.startsWith('EMEA')) return 'EMEA';

    if (clean.includes('NASA') || clean.includes('AMS')) return 'AMS';
    if (clean.includes('APJ')) return 'APJ';
    if (clean.includes('EMEA')) return 'EMEA';

    return 'OTHER';
  };

  // Check if Status column value is "In-process" or "New" (case-insensitive)
  const checkIsInProcessOrNew = (statusVal: string): boolean => {
    const normalized = statusVal.trim().toLowerCase().replace(/[-_\s]+/g, '');
    return (
      normalized === 'inprocess' ||
      normalized.includes('inprocess') ||
      normalized === 'new' ||
      normalized.startsWith('new')
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const xlsxRead = XLSX.read || (XLSX as any).default?.read;
      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;

      if (!xlsxRead || !xlsxUtils) {
        throw new Error('Excel library (XLSX) not properly loaded.');
      }

      const workbook = xlsxRead(data, { cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = xlsxUtils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,
        defval: '',
      }) as any[][];

      const formattedRows = xlsxUtils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        dateNF: 'yyyy-mm-dd',
        defval: '',
      }) as any[][];

      if (!rawRows || rawRows.length === 0) {
        throw new Error('The uploaded Excel file is empty.');
      }

      // Locate header row within first 10 rows
      let headerRowIdx = 0;
      let sessionKeyColIdx = 0; // First column is Session Key by default
      let businessTypeColIdx = -1;
      let statusColIdx = -1;
      let lastChangedColIdx = -1;
      let releasedCountColIdx = -1;
      let blockedCountColIdx = -1;

      const maxScan = Math.min(rawRows.length, 10);
      for (let r = 0; r < maxScan; r++) {
        const row = rawRows[r] || [];
        let foundCols = 0;

        row.forEach((cell, cIdx) => {
          const h = String(cell || '').toLowerCase().trim();
          if (!h) return;

          if (h === 'session key' || h === 'session_key' || h === 'sessionkey' || h.includes('session key')) {
            sessionKeyColIdx = cIdx;
            foundCols++;
          }
          if (h === 'business type' || h === 'business_type' || h === 'businesstype' || h.includes('business type')) {
            businessTypeColIdx = cIdx;
            foundCols++;
          }
          if (h === 'status' || h === 'session status' || h === 'file status') {
            statusColIdx = cIdx;
            foundCols++;
          }
          if (
            h === 'last changed at (utc)' ||
            h.includes('last changed at') ||
            h.includes('last changed') ||
            (h.includes('changed') && h.includes('utc'))
          ) {
            lastChangedColIdx = cIdx;
            foundCols++;
          }
          if (
            h === 'total released item count' ||
            h.includes('total released item count') ||
            h.includes('released item count') ||
            h.includes('released count')
          ) {
            releasedCountColIdx = cIdx;
            foundCols++;
          }
          if (
            h === 'total blocked item count' ||
            h.includes('total blocked item count') ||
            h.includes('blocked item count') ||
            h.includes('blocked count')
          ) {
            blockedCountColIdx = cIdx;
            foundCols++;
          }
        });

        if (foundCols >= 2) {
          headerRowIdx = r;
          break;
        }
      }

      const headerRow = rawRows[headerRowIdx] || [];

      // Fallback column search if slightly different naming was used
      if (businessTypeColIdx === -1) {
        businessTypeColIdx = headerRow.findIndex(c =>
          String(c || '').toLowerCase().includes('business')
        );
      }
      if (statusColIdx === -1) {
        statusColIdx = headerRow.findIndex(c =>
          String(c || '').toLowerCase().includes('status')
        );
      }
      if (lastChangedColIdx === -1) {
        lastChangedColIdx = headerRow.findIndex(c => {
          const s = String(c || '').toLowerCase();
          return s.includes('changed') || s.includes('date') || s.includes('utc');
        });
      }
      if (releasedCountColIdx === -1) {
        releasedCountColIdx = headerRow.findIndex(c =>
          String(c || '').toLowerCase().includes('released')
        );
      }
      if (blockedCountColIdx === -1) {
        blockedCountColIdx = headerRow.findIndex(c =>
          String(c || '').toLowerCase().includes('blocked')
        );
      }

      if (businessTypeColIdx === -1 || lastChangedColIdx === -1 || releasedCountColIdx === -1) {
        const missing: string[] = [];
        if (businessTypeColIdx === -1) missing.push('"Business Type"');
        if (lastChangedColIdx === -1) missing.push('"Last Changed At (UTC)"');
        if (releasedCountColIdx === -1) missing.push('"Total Released Item Count"');
        throw new Error(
          `Could not find required column(s): ${missing.join(', ')}. Found headers: ${headerRow
            .filter(Boolean)
            .slice(0, 10)
            .join(', ')}`
        );
      }

      const parsed: ParsedInventoryRow[] = [];
      for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const rawRow = rawRows[r] || [];
        const fmtRow = formattedRows[r] || [];

        const sessionKey = String(fmtRow[sessionKeyColIdx] ?? rawRow[sessionKeyColIdx] ?? '').trim();
        const businessType = String(fmtRow[businessTypeColIdx] ?? rawRow[businessTypeColIdx] ?? '').trim();
        const status =
          statusColIdx !== -1
            ? String(fmtRow[statusColIdx] ?? rawRow[statusColIdx] ?? '').trim()
            : '';

        if (!sessionKey && !businessType) continue;

        const { candidateDates, primaryDate, displayStr } = extractDatesFromCell(
          rawRow[lastChangedColIdx],
          fmtRow[lastChangedColIdx]
        );

        const releasedItemCount = parseZymeNumber(
          rawRow[releasedCountColIdx] ?? fmtRow[releasedCountColIdx]
        );
        const blockedItemCount =
          blockedCountColIdx !== -1
            ? parseZymeNumber(rawRow[blockedCountColIdx] ?? fmtRow[blockedCountColIdx])
            : 0;

        const region = getRegionFromSessionKey(sessionKey);
        const isInProcess = checkIsInProcessOrNew(status);

        parsed.push({
          rowIndex: r + 1,
          sessionKey,
          region,
          businessType,
          status,
          isInProcess,
          lastChangedRaw: displayStr,
          candidateDates,
          primaryDate,
          releasedItemCount,
          blockedItemCount,
        });
      }

      setAllParsedRows(parsed);
      setFileName(file.name);
    } catch (err: any) {
      console.error('Error parsing inventory Excel file:', err);
      setError(err.message || `Failed to parse "${file.name}"`);
      setAllParsedRows([]);
      setFileName(null);
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Available dates in the uploaded file for Business Type = Zyme and Total Released Item Count != 0
  const availableZymeDates = useMemo(() => {
    const dateCounts = new Map<string, number>();
    allParsedRows.forEach(r => {
      const isZyme =
        r.businessType.toLowerCase() === 'zyme' || r.businessType.toLowerCase().includes('zyme');
      const isNonZeroReleased = r.releasedItemCount !== 0 && r.releasedItemCount > 0;
      if (isZyme && isNonZeroReleased && r.primaryDate) {
        dateCounts.set(r.primaryDate, (dateCounts.get(r.primaryDate) || 0) + 1);
      }
    });
    return Array.from(dateCounts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count }));
  }, [allParsedRows]);

  // Filtering and calculations:
  // 1. Filter Business Type == 'Zyme'
  // 2. Released: Last Changed At (UTC) == selectedDate AND Total Released Item Count != 0
  //    - Session Key starting with Nasa -> AMS, APJ -> APJ, EMEA -> EMEA
  //    - Total Files Released & Total Count Released (sum of Total Released Item Count)
  // 3. Escalated: If Total Released Item Count != 0 AND Total Blocked Item Count != 0,
  //    the value of Total Blocked Item Count is the Count Escalated
  // 4. In-Process Total File Count: From the uploaded file (Business Type = Zyme),
  //    Status == 'In-process' AND Total Released Item Count == 0 -> Total File Count (In-process)
  const filteredResults = useMemo(() => {
    const zymeRows = allParsedRows.filter(
      r => r.businessType.toLowerCase() === 'zyme' || r.businessType.toLowerCase().includes('zyme')
    );

    // Released rows on selectedDate (Total Released Item Count != 0)
    const dateMatchedRows = zymeRows.filter(r => r.candidateDates.includes(selectedDate));
    const releasedRows = dateMatchedRows.filter(
      r =>
        r.releasedItemCount !== 0 &&
        r.releasedItemCount > 0 &&
        (r.region === 'AMS' || r.region === 'APJ' || r.region === 'EMEA')
    );

    // Escalated rows: Total Released Item Count != 0 & Total Blocked Item Count != 0
    const escalatedRows = releasedRows.filter(
      r => r.blockedItemCount !== 0 && r.blockedItemCount > 0
    );

    // In-process rows from the uploaded file: Status is In-process & Total Released Item Count is 0
    const inProcessRows = zymeRows.filter(
      r =>
        r.isInProcess &&
        r.releasedItemCount === 0 &&
        (r.region === 'AMS' || r.region === 'APJ' || r.region === 'EMEA')
    );

    const statsByRegion: Record<'AMS' | 'APJ' | 'EMEA', RegionalStatRow> = {
      AMS: {
        region: 'AMS',
        prefixLabel: 'Nasa*',
        releasedFiles: 0,
        releasedItemCount: 0,
        escalatedFiles: 0,
        escalatedCount: 0,
        inProcessFileCount: 0,
      },
      APJ: {
        region: 'APJ',
        prefixLabel: 'APJ*',
        releasedFiles: 0,
        releasedItemCount: 0,
        escalatedFiles: 0,
        escalatedCount: 0,
        inProcessFileCount: 0,
      },
      EMEA: {
        region: 'EMEA',
        prefixLabel: 'EMEA*',
        releasedFiles: 0,
        releasedItemCount: 0,
        escalatedFiles: 0,
        escalatedCount: 0,
        inProcessFileCount: 0,
      },
    };

    releasedRows.forEach(row => {
      if (row.region === 'AMS' || row.region === 'APJ' || row.region === 'EMEA') {
        statsByRegion[row.region].releasedFiles += 1;
        statsByRegion[row.region].releasedItemCount += row.releasedItemCount;
        if (row.blockedItemCount !== 0 && row.blockedItemCount > 0) {
          statsByRegion[row.region].escalatedFiles += 1;
          statsByRegion[row.region].escalatedCount += row.blockedItemCount;
        }
      }
    });

    inProcessRows.forEach(row => {
      if (row.region === 'AMS' || row.region === 'APJ' || row.region === 'EMEA') {
        statsByRegion[row.region].inProcessFileCount += 1;
      }
    });

    const regionalList: RegionalStatRow[] = [
      statsByRegion.AMS,
      statsByRegion.APJ,
      statsByRegion.EMEA,
    ];

    const totalFilesReleased = regionalList.reduce((acc, r) => acc + r.releasedFiles, 0);
    const totalCountReleased = regionalList.reduce((acc, r) => acc + r.releasedItemCount, 0);
    const totalEscalatedFiles = regionalList.reduce((acc, r) => acc + r.escalatedFiles, 0);
    const totalCountEscalated = regionalList.reduce((acc, r) => acc + r.escalatedCount, 0);
    const totalInProcessFiles = regionalList.reduce((acc, r) => acc + r.inProcessFileCount, 0);

    const totalRow: RegionalStatRow = {
      region: 'Total',
      prefixLabel: 'AMS + APJ + EMEA',
      releasedFiles: totalFilesReleased,
      releasedItemCount: totalCountReleased,
      escalatedFiles: totalEscalatedFiles,
      escalatedCount: totalCountEscalated,
      inProcessFileCount: totalInProcessFiles,
    };

    const reportDateObj = new Date(`${selectedDate}T00:00:00`);
    const formattedDate = !isNaN(reportDateObj.getTime())
      ? reportDateObj.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : selectedDate;

    const reportText = `Hi Team,

Please find the Zyme inventory details for ${formattedDate}:

• Total Files Released: ${totalFilesReleased} files
• Total Count Released: ${Math.round(totalCountReleased)} Transactions (AMS: ${statsByRegion.AMS.releasedFiles} files / ${Math.round(statsByRegion.AMS.releasedItemCount)} TXN, APJ: ${statsByRegion.APJ.releasedFiles} files / ${Math.round(statsByRegion.APJ.releasedItemCount)} TXN, EMEA: ${statsByRegion.EMEA.releasedFiles} files / ${Math.round(statsByRegion.EMEA.releasedItemCount)} TXN)
• Count Escalated/Pending : ${Math.round(totalCountEscalated)} TXN (${Math.round(statsByRegion.APJ.escalatedCount)} - APJ, ${Math.round(statsByRegion.AMS.escalatedCount)} - AMS, ${Math.round(statsByRegion.EMEA.escalatedCount)} - EMEA)
• Total File Count : ${totalInProcessFiles} files (AMS: ${statsByRegion.AMS.inProcessFileCount}, APJ: ${statsByRegion.APJ.inProcessFileCount}, EMEA: ${statsByRegion.EMEA.inProcessFileCount})`;

    return {
      totalRawRows: allParsedRows.length,
      zymeRowCount: zymeRows.length,
      dateMatchedCount: dateMatchedRows.length,
      releasedRows,
      escalatedRows,
      inProcessRows,
      regionalRows: [...regionalList, totalRow],
      statsByRegion,
      totalFilesReleased,
      totalCountReleased,
      totalEscalatedFiles,
      totalCountEscalated,
      totalInProcessFiles,
      reportText,
      formattedDate,
    };
  }, [allParsedRows, selectedDate]);

  const copyToClipboard = async () => {
    if (!filteredResults.reportText) return;
    await navigator.clipboard.writeText(filteredResults.reportText);
    setCopiedMode('text');
    setTimeout(() => setCopiedMode(null), 2200);
  };

  const copyForEmail = async () => {
    if (!filteredResults.reportText) return;

    try {
      const tableHtml = `
        <table style="width: 100%; max-width: 760px; border-collapse: collapse; font-family: sans-serif; font-size: 12px; margin-top: 16px;">
          <thead>
            <tr style="background-color: #1e293b; color: white;">
              <th style="padding: 8px 12px; border: 1px solid #334155; text-align: left;">Region</th>
              <th style="padding: 8px 12px; border: 1px solid #334155; text-align: left;">Session Key Prefix</th>
              <th style="padding: 8px 12px; border: 1px solid #334155; text-align: right;">Total Files Released</th>
              <th style="padding: 8px 12px; border: 1px solid #334155; text-align: right;">Total Count Released(TXNs)</th>
              <th style="padding: 8px 12px; border: 1px solid #334155; text-align: right;">Count Escalated (TXNs)</th>
              <th style="padding: 8px 12px; border: 1px solid #334155; text-align: right;">Total File Count (In-Process)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredResults.regionalRows
              .map(
                (row, idx) => `
              <tr style="background-color: ${
                idx === filteredResults.regionalRows.length - 1 ? '#f1f5f9' : '#ffffff'
              }; font-weight: ${
                  idx === filteredResults.regionalRows.length - 1 ? 'bold' : 'normal'
                };">
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${row.region}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #64748b;">${row.prefixLabel}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${row.releasedFiles}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${Math.round(
                  row.releasedItemCount
                )}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${Math.round(
                  row.escalatedCount
                )}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${row.inProcessFileCount}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;

      const fullHtml = `
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
          <pre style="font-family: sans-serif; white-space: pre-wrap; margin: 0;">${filteredResults.reportText}</pre>
          ${tableHtml}
        </div>
      `;

      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([filteredResults.reportText], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText,
        }),
      ]);

      setCopiedMode('email');
      setTimeout(() => setCopiedMode(null), 2200);
    } catch {
      await copyToClipboard();
    }
  };

  const resetAll = () => {
    setFileName(null);
    setAllParsedRows([]);
    setError(null);
    setShowDetailsTable(false);
  };

  const activeDetailRows =
    detailsTab === 'released'
      ? filteredResults.releasedRows
      : detailsTab === 'escalated'
      ? filteredResults.escalatedRows
      : filteredResults.inProcessRows;

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 relative z-10">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Top Controls: Date Selection & Single Excel Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Date Picker Card (5 cols) */}
          <div className="lg:col-span-5 bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">Last Changed At (UTC) Date</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Defaults to current date, or select any report date
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
              >
                Today
              </button>
            </div>

            <div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
              />
            </div>

            {/* Quick Date Chips found in uploaded file */}
            {fileName && availableZymeDates.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
                  Dates available in uploaded file (Zyme):
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {availableZymeDates.slice(0, 8).map(d => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setSelectedDate(d.date)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all tabular-nums ${
                        selectedDate === d.date
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {d.date} ({d.count})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Single Excel File Upload Card (7 cols) */}
          <div
            className={`lg:col-span-7 p-6 rounded-2xl border-2 border-dashed transition-all flex flex-col justify-center ${
              fileName
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-white/80 border-slate-300 hover:border-indigo-400'
            }`}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div
                className={`p-3.5 rounded-2xl ${
                  fileName ? 'bg-emerald-500/20 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                {isProcessing ? (
                  <Loader2 size={26} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={26} />
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Upload Inventory Excel File
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Single Excel file for Released Files, Released Count, Escalated Count &amp; In-Process File Count
                </p>
              </div>

              {fileName ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold">
                    <CheckCircle2 size={15} />
                    <span className="truncate max-w-[240px]">{fileName}</span>
                  </div>

                  <label className="cursor-pointer px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-all shadow-2xs">
                    Change File
                    <input
                      type="file"
                      className="hidden"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={resetAll}
                    className="p-2 text-slate-500 hover:text-red-600 bg-white border border-slate-200 hover:border-red-200 rounded-xl transition-colors"
                    title="Clear file"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-200">
                  Select Excel File
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                  />
                </label>
              )}
            </div>
          </div>

        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={18} />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">Error Processing File</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {/* Results Section when File is Uploaded */}
        {fileName && !error && (
          <div className="space-y-6">
            
            {/* Filter Pipeline Status Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <Filter size={14} className="text-indigo-600" />
                <span>Filter Summary:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 tabular-nums">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                  Zyme Rows: <b>{filteredResults.zymeRowCount}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold">
                  Released ({selectedDate}, &ne; 0): <b>{filteredResults.totalFilesReleased} files</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-bold">
                  Escalated (Blocked &ne; 0): <b>{Math.round(filteredResults.totalCountEscalated)}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold">
                  In-Process / New (Released = 0): <b>{filteredResults.totalInProcessFiles} files</b>
                </span>
              </div>
            </div>

            {/* Top 4 Primary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total Files Released */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Files Released
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-black tabular-nums text-white">
                    {filteredResults.totalFilesReleased}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    Released &ne; 0
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                  <span>AMS: {filteredResults.statsByRegion.AMS.releasedFiles}</span>
                  <span>APJ: {filteredResults.statsByRegion.APJ.releasedFiles}</span>
                  <span>EMEA: {filteredResults.statsByRegion.EMEA.releasedFiles}</span>
                </div>
              </div>

              {/* 2. Total Count Released */}
              <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">
                  Total Count Released
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-black tabular-nums text-white">
                    {Math.round(filteredResults.totalCountReleased).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-indigo-100 font-semibold">
                    AMS + APJ + EMEA
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-indigo-500/60 flex items-center justify-between text-[11px] text-indigo-100 tabular-nums">
                  <span>AMS: {Math.round(filteredResults.statsByRegion.AMS.releasedItemCount)}</span>
                  <span>APJ: {Math.round(filteredResults.statsByRegion.APJ.releasedItemCount)}</span>
                  <span>EMEA: {Math.round(filteredResults.statsByRegion.EMEA.releasedItemCount)}</span>
                </div>
              </div>

              {/* 3. Count Escalated/Pending (Released != 0 & Blocked != 0) */}
              <div className="bg-amber-500 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-100">
                    Count Escalated/Pending
                  </span>
                  <ShieldAlert size={15} className="text-amber-100" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-black tabular-nums text-white">
                    {Math.round(filteredResults.totalCountEscalated)}
                  </span>
                  <span className="text-[11px] text-amber-100 font-semibold">
                    TXN ({filteredResults.totalEscalatedFiles} files)
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-amber-400/60 flex items-center justify-between text-[11px] text-amber-50 tabular-nums">
                  <span>AMS: {Math.round(filteredResults.statsByRegion.AMS.escalatedCount)}</span>
                  <span>APJ: {Math.round(filteredResults.statsByRegion.APJ.escalatedCount)}</span>
                  <span>EMEA: {Math.round(filteredResults.statsByRegion.EMEA.escalatedCount)}</span>
                </div>
              </div>

              {/* 4. Total File Count (Status = In-process or New & Total Released Item Count = 0) */}
              <div className="bg-blue-600 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
                    Total File Count (In-Process)
                  </span>
                  <Clock size={15} className="text-blue-100" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-black tabular-nums text-white">
                    {filteredResults.totalInProcessFiles}
                  </span>
                  <span className="text-[11px] text-blue-100 font-semibold">
                    In-process / New &amp; Released = 0
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-blue-500/60 flex items-center justify-between text-[11px] text-blue-100 tabular-nums">
                  <span>AMS: {filteredResults.statsByRegion.AMS.inProcessFileCount}</span>
                  <span>APJ: {filteredResults.statsByRegion.APJ.inProcessFileCount}</span>
                  <span>EMEA: {filteredResults.statsByRegion.EMEA.inProcessFileCount}</span>
                </div>
              </div>
            </div>

            {/* Report & Regional Summary Table Card */}
            <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Inventory Report Summary ({filteredResults.formattedDate})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg transition-all text-xs font-bold"
                  >
                    {copiedMode === 'text' ? (
                      <>
                        <Check size={14} className="text-emerald-600" />
                        <span className="text-emerald-600">Copied Text!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={copyForEmail}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-all text-xs font-bold shadow-2xs"
                  >
                    {copiedMode === 'email' ? (
                      <>
                        <Check size={14} />
                        <span>Copied for Email!</span>
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        <span>Copy for Email</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-sm bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                  {filteredResults.reportText}
                </pre>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="p-3.5 border border-slate-700">Region</th>
                        <th className="p-3.5 border border-slate-700">Session Key Prefix</th>
                        <th className="p-3.5 border border-slate-700 text-right">
                          Total Files Released
                        </th>
                        <th className="p-3.5 border border-slate-700 text-right">
                          Total Count Released(TXNs)
                        </th>
                        <th className="p-3.5 border border-slate-700 text-right">
                          Count Escalated (TXNs)
                        </th>
                        <th className="p-3.5 border border-slate-700 text-right">
                          Total File Count (In-Process)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.regionalRows.map((row, idx) => {
                        const isTotal = idx === filteredResults.regionalRows.length - 1;
                        return (
                          <tr
                            key={row.region}
                            className={`${
                              isTotal
                                ? 'bg-slate-100 font-black text-slate-900'
                                : 'bg-white text-slate-700'
                            } border-b border-slate-200 hover:bg-slate-50 transition-colors tabular-nums`}
                          >
                            <td className="p-3.5 border border-slate-200">{row.region}</td>
                            <td className="p-3.5 border border-slate-200 font-mono text-slate-500">
                              {row.prefixLabel}
                            </td>
                            <td className="p-3.5 border border-slate-200 text-right">
                              {row.releasedFiles}
                            </td>
                            <td className="p-3.5 border border-slate-200 text-right">
                              {Math.round(row.releasedItemCount)}
                            </td>
                            <td className="p-3.5 border border-slate-200 text-right">
                              {Math.round(row.escalatedCount)}
                            </td>
                            <td className="p-3.5 border border-slate-200 text-right">
                              {row.inProcessFileCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Collapsible Matching Sessions Inspector */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDetailsTable(prev => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    {showDetailsTable ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    <span>
                      {showDetailsTable ? 'Hide' : 'Inspect'} Filtered Rows (Released: {filteredResults.releasedRows.length}, Escalated: {filteredResults.escalatedRows.length}, In-Process: {filteredResults.inProcessRows.length})
                    </span>
                  </button>

                  {showDetailsTable && (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailsTab('released')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            detailsTab === 'released'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Released ({filteredResults.releasedRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('escalated')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            detailsTab === 'escalated'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Escalated ({filteredResults.escalatedRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('inprocess')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            detailsTab === 'inprocess'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          In-Process / New &amp; Released = 0 ({filteredResults.inProcessRows.length})
                        </button>
                      </div>

                      <div className="overflow-x-auto max-h-80 rounded-xl border border-slate-200">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-slate-100 text-slate-700 sticky top-0">
                            <tr>
                              <th className="p-2.5 border-b border-slate-200">Session Key</th>
                              <th className="p-2.5 border-b border-slate-200">Region</th>
                              <th className="p-2.5 border-b border-slate-200">Status</th>
                              <th className="p-2.5 border-b border-slate-200">Last Changed At (UTC)</th>
                              <th className="p-2.5 border-b border-slate-200 text-right">
                                Total Released Item Count
                              </th>
                              <th className="p-2.5 border-b border-slate-200 text-right">
                                Total Blocked Item Count
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeDetailRows.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-6 text-center text-slate-400">
                                  No matching rows for this category.
                                </td>
                              </tr>
                            ) : (
                              activeDetailRows.map((r, i) => (
                                <tr key={i} className="hover:bg-slate-50 tabular-nums">
                                  <td className="p-2.5 font-mono text-slate-800 font-medium">
                                    {r.sessionKey}
                                  </td>
                                  <td className="p-2.5">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        r.region === 'AMS'
                                          ? 'bg-blue-50 text-blue-700'
                                          : r.region === 'APJ'
                                          ? 'bg-amber-50 text-amber-700'
                                          : 'bg-emerald-50 text-emerald-700'
                                      }`}
                                    >
                                      {r.region}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-slate-600">{r.status || '-'}</td>
                                  <td className="p-2.5 font-mono text-slate-600">{r.lastChangedRaw}</td>
                                  <td className="p-2.5 text-right font-bold text-slate-900">
                                    {Math.round(r.releasedItemCount).toLocaleString()}
                                  </td>
                                  <td className="p-2.5 text-right font-bold text-amber-700">
                                    {Math.round(r.blockedItemCount).toLocaleString()}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Instructions when no file is uploaded */}
        {!fileName && (
          <div className="bg-indigo-50/60 rounded-2xl p-6 border border-indigo-100">
            <div className="flex gap-4">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg h-fit">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-900 mb-1">How Inventory Report Works</h4>
                <ul className="text-xs text-indigo-700 space-y-1.5 list-disc ml-4">
                  <li>
                    Filters rows where <b>Business Type</b> is <b>Zyme</b> and maps <b>Session Key</b> prefixes: <b>Nasa*</b> &rarr; <b>AMS</b>, <b>APJ*</b> &rarr; <b>APJ</b>, <b>EMEA*</b> &rarr; <b>EMEA</b>.
                  </li>
                  <li>
                    <b>Total Files Released &amp; Total Count Released</b>: Rows matching selected <b>Last Changed At (UTC)</b> date where <b>Total Released Item Count &ne; 0</b>.
                  </li>
                  <li>
                    <b>Count Escalated</b>: When <b>Total Released Item Count &ne; 0</b> and <b>Total Blocked Item Count &ne; 0</b>, sums the <b>Total Blocked Item Count</b> value.
                  </li>
                  <li>
                    <b>Total File Count (In-Process)</b>: Rows from the uploaded file where <b>Status</b> is <b>In-process</b> or <b>New</b> and <b>Total Released Item Count = 0</b>.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
