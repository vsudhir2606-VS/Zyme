import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  Copy,
  Trash2,
  FileSpreadsheet,
  Loader2,
  Mail,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Upload,
  Search,
  Layers,
  FileCheck2,
  Clock,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { clampWorksheetRange } from '../utils/excelSafety.ts';

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
  releasedFiles: number;
  totalTxnsReleased: number;
  totalPendingFiles: number;
  totalTxnsPending: number;
  countEscalated: number;
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
  const [detailsTab, setDetailsTab] = useState<'released' | 'pending' | 'escalated'>('released');
  const [detailSearch, setDetailSearch] = useState<string>('');

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

  const extractDatesFromCell = (
    rawVal: any,
    formattedVal: any
  ): { candidateDates: string[]; primaryDate: string; displayStr: string } => {
    const candidates = new Set<string>();
    let primaryDate = '';
    const displayStr = String(formattedVal ?? rawVal ?? '').trim();

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

    if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
      const utcIso = `${rawVal.getUTCFullYear()}-${String(rawVal.getUTCMonth() + 1).padStart(2, '0')}-${String(rawVal.getUTCDate()).padStart(2, '0')}`;
      const localIso = `${rawVal.getFullYear()}-${String(rawVal.getMonth() + 1).padStart(2, '0')}-${String(rawVal.getDate()).padStart(2, '0')}`;
      candidates.add(utcIso);
      candidates.add(localIso);
      if (!primaryDate) primaryDate = utcIso;
    }

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

  const checkIsInProcessOrNew = (statusVal: string): boolean => {
    const normalized = statusVal.trim().toLowerCase().replace(/[-_\s]+/g, '');
    if (!normalized) return false;
    return (
      normalized.includes('inprocess') ||
      normalized.includes('process') ||
      normalized.includes('new') ||
      normalized.includes('pending') ||
      normalized.includes('open') ||
      normalized.includes('hold') ||
      normalized.includes('queued') ||
      normalized.includes('assigned')
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
      clampWorksheetRange(worksheet);

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

      let headerRowIdx = 0;
      let sessionKeyColIdx = 0;
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
          if (
            h === 'status' || 
            h === 'session status' || 
            h === 'file status' || 
            h.includes('status') ||
            h.includes('stage') ||
            h.includes('state')
          ) {
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

      if (businessTypeColIdx === -1) {
        businessTypeColIdx = headerRow.findIndex(c =>
          String(c || '').toLowerCase().includes('business')
        );
      }
      if (statusColIdx === -1) {
        statusColIdx = headerRow.findIndex(c => {
          const s = String(c || '').toLowerCase().trim();
          return s.includes('status') || s.includes('stage') || s.includes('state');
        });
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

  const filteredResults = useMemo(() => {
    const zymeRows = allParsedRows.filter(
      r => r.businessType.toLowerCase() === 'zyme' || r.businessType.toLowerCase().includes('zyme')
    );

    // 1. Released on selected date
    const dateMatchedRows = zymeRows.filter(r => r.candidateDates.includes(selectedDate));
    const releasedRows = dateMatchedRows.filter(
      r =>
        r.releasedItemCount !== 0 &&
        r.releasedItemCount > 0 &&
        (r.region === 'AMS' || r.region === 'APJ' || r.region === 'EMEA')
    );

    // 2. Total Pending Files:
    // Session Key starting with NASA/AMS, APJ, EMEA & status as In-process
    const inProcessRows = zymeRows.filter(r => {
      const isRegional = r.region === 'AMS' || r.region === 'APJ' || r.region === 'EMEA';
      if (!isRegional) return false;
      const statusNorm = r.status.trim().toLowerCase().replace(/[-_\s]+/g, '');
      return statusNorm.includes('inprocess') || statusNorm.includes('process');
    });

    // 3. Count Escalated:
    // "Count escalated must be calculated same as total pending but remove wherever the total released item count is 0, the remaining is the count escalated"
    // Same as total pending (Session Key starting with NASA/APJ/EMEA & status In-process), but releasedItemCount > 0
    const escalatedRows = inProcessRows.filter(r => r.releasedItemCount > 0);

    const statsByRegion: Record<'AMS' | 'APJ' | 'EMEA', RegionalStatRow> = {
      AMS: {
        region: 'AMS',
        releasedFiles: 0,
        totalTxnsReleased: 0,
        totalPendingFiles: 0,
        totalTxnsPending: 0,
        countEscalated: 0,
      },
      APJ: {
        region: 'APJ',
        releasedFiles: 0,
        totalTxnsReleased: 0,
        totalPendingFiles: 0,
        totalTxnsPending: 0,
        countEscalated: 0,
      },
      EMEA: {
        region: 'EMEA',
        releasedFiles: 0,
        totalTxnsReleased: 0,
        totalPendingFiles: 0,
        totalTxnsPending: 0,
        countEscalated: 0,
      },
    };

    // Released files & transactions on selected date
    releasedRows.forEach(row => {
      if (row.region === 'AMS' || row.region === 'APJ' || row.region === 'EMEA') {
        statsByRegion[row.region].releasedFiles += 1;
        statsByRegion[row.region].totalTxnsReleased += row.releasedItemCount;
      }
    });

    // Total Pending Files (Session Key starting with NASA, APJ, EMEA & status In-process)
    inProcessRows.forEach(row => {
      if (row.region === 'AMS' || row.region === 'APJ' || row.region === 'EMEA') {
        statsByRegion[row.region].totalPendingFiles += 1;
        statsByRegion[row.region].totalTxnsPending += row.blockedItemCount; // Pending blocked transactions in queue
      }
    });

    // Count Escalated (Same as total pending but removing where total released item count is 0)
    escalatedRows.forEach(row => {
      if (row.region === 'AMS' || row.region === 'APJ' || row.region === 'EMEA') {
        statsByRegion[row.region].countEscalated += 1;
      }
    });

    const regionalList: RegionalStatRow[] = [
      statsByRegion.AMS,
      statsByRegion.APJ,
      statsByRegion.EMEA,
    ];

    const totalFilesReleased = regionalList.reduce((acc, r) => acc + r.releasedFiles, 0);
    const totalTxnsReleased = regionalList.reduce((acc, r) => acc + r.totalTxnsReleased, 0);
    const totalPendingFiles = regionalList.reduce((acc, r) => acc + r.totalPendingFiles, 0);
    const totalTxnsPending = regionalList.reduce((acc, r) => acc + r.totalTxnsPending, 0);
    const totalCountEscalated = regionalList.reduce((acc, r) => acc + r.countEscalated, 0);

    const totalRow: RegionalStatRow = {
      region: 'Total',
      releasedFiles: totalFilesReleased,
      totalTxnsReleased: totalTxnsReleased,
      totalPendingFiles: totalPendingFiles,
      totalTxnsPending: totalTxnsPending,
      countEscalated: totalCountEscalated,
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
• Total Txn's Released: ${Math.round(totalTxnsReleased)} Transactions (AMS: ${statsByRegion.AMS.releasedFiles} files / ${Math.round(statsByRegion.AMS.totalTxnsReleased)} TXN, APJ: ${statsByRegion.APJ.releasedFiles} files / ${Math.round(statsByRegion.APJ.totalTxnsReleased)} TXN, EMEA: ${statsByRegion.EMEA.releasedFiles} files / ${Math.round(statsByRegion.EMEA.totalTxnsReleased)} TXN)
• Total Pending Files: ${totalPendingFiles} files (AMS: ${statsByRegion.AMS.totalPendingFiles}, APJ: ${statsByRegion.APJ.totalPendingFiles}, EMEA: ${statsByRegion.EMEA.totalPendingFiles})
• Total Txn's Pending: ${Math.round(totalTxnsPending)} TXN (AMS: ${Math.round(statsByRegion.AMS.totalTxnsPending)}, APJ: ${Math.round(statsByRegion.APJ.totalTxnsPending)}, EMEA: ${Math.round(statsByRegion.EMEA.totalTxnsPending)})
• Count Escalated: ${totalCountEscalated} files (APJ: ${statsByRegion.APJ.countEscalated}, AMS: ${statsByRegion.AMS.countEscalated}, EMEA: ${statsByRegion.EMEA.countEscalated})`;

    return {
      totalRawRows: allParsedRows.length,
      zymeRowCount: zymeRows.length,
      dateMatchedCount: dateMatchedRows.length,
      releasedRows,
      inProcessRows,
      escalatedRows,
      regionalRows: [...regionalList, totalRow],
      statsByRegion,
      totalFilesReleased,
      totalTxnsReleased,
      totalPendingFiles,
      totalTxnsPending,
      totalCountEscalated,
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
        <table style="width: 100%; max-width: 760px; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; margin-top: 14px;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th style="padding: 10px 14px; border: 1px solid #1e293b; text-align: left;">Region</th>
              <th style="padding: 10px 14px; border: 1px solid #1e293b; text-align: right;">Total Files Released</th>
              <th style="padding: 10px 14px; border: 1px solid #1e293b; text-align: right;">Total Txn's Released</th>
              <th style="padding: 10px 14px; border: 1px solid #1e293b; text-align: right;">Total Pending Files</th>
              <th style="padding: 10px 14px; border: 1px solid #1e293b; text-align: right;">Total Txn's Pending</th>
              <th style="padding: 10px 14px; border: 1px solid #1e293b; text-align: right;">Count Escalated</th>
            </tr>
          </thead>
          <tbody>
            ${filteredResults.regionalRows
              .map(
                (row, idx) => `
              <tr style="background-color: ${
                idx === filteredResults.regionalRows.length - 1 ? '#f1f5f9' : '#ffffff'
              }; font-weight: ${
                  idx === filteredResults.regionalRows.length - 1 ? '700' : '500'
                };">
                <td style="padding: 9px 14px; border: 1px solid #e2e8f0; color: #0f172a;">${row.region}</td>
                <td style="padding: 9px 14px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${row.releasedFiles}</td>
                <td style="padding: 9px 14px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${Math.round(
                  row.totalTxnsReleased
                )}</td>
                <td style="padding: 9px 14px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${row.totalPendingFiles}</td>
                <td style="padding: 9px 14px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${Math.round(
                  row.totalTxnsPending
                )}</td>
                <td style="padding: 9px 14px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${row.countEscalated}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;

      const fullHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; line-height: 1.6;">
          <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap; margin: 0; font-size: 13px;">${filteredResults.reportText}</pre>
          ${tableHtml}
        </div>
      `;

      const plainTextWithTable = `${filteredResults.reportText}\n\nRegion\tTotal Files Released\tTotal Txn's Released\tTotal Pending Files\tTotal Txn's Pending\tCount Escalated\n${filteredResults.regionalRows
        .map(
          r =>
            `${r.region}\t${r.releasedFiles}\t${Math.round(
              r.totalTxnsReleased
            )}\t${r.totalPendingFiles}\t${Math.round(r.totalTxnsPending)}\t${r.countEscalated}`
        )
        .join('\n')}`;

      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([plainTextWithTable], { type: 'text/plain' });

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
    setDetailSearch('');
  };

  const activeDetailRows = useMemo(() => {
    const base =
      detailsTab === 'released'
        ? filteredResults.releasedRows
        : detailsTab === 'pending'
        ? filteredResults.inProcessRows
        : filteredResults.escalatedRows;

    if (!detailSearch.trim()) return base;
    const q = detailSearch.toLowerCase().trim();
    return base.filter(
      r =>
        r.sessionKey.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
    );
  }, [detailsTab, filteredResults, detailSearch]);

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8 relative z-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Top Minimal Action & Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Left: Workbook Info / Selector */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                {isProcessing ? (
                  <Loader2 size={18} className="animate-spin text-indigo-600" />
                ) : (
                  <FileSpreadsheet size={18} />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800 truncate">
                    {fileName ? fileName : 'Upload Zyme Inventory Report'}
                  </h3>
                  {fileName && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                      Loaded
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {fileName
                    ? `${filteredResults.totalRawRows.toLocaleString()} rows · ${filteredResults.zymeRowCount.toLocaleString()} Zyme records`
                    : 'Select .xlsx or .csv report to analyze metrics'}
                </p>
              </div>
            </div>

            {/* Right: Date Picker & Actions */}
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                <Calendar size={13} className="text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none tabular-nums cursor-pointer"
                />
              </div>

              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition-all shadow-xs">
                <Upload size={13} />
                <span>{fileName ? 'Replace' : 'Upload File'}</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                />
              </label>

              {fileName && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Remove uploaded file"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

          </div>

          {/* Quick Date Pills */}
          {fileName && availableZymeDates.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-slate-400 mr-1">
                Quick Dates:
              </span>
              {availableZymeDates.slice(0, 8).map(d => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDate(d.date)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all tabular-nums cursor-pointer ${
                    selectedDate === d.date
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d.date}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
            <AlertCircle className="text-rose-600 mt-0.5 flex-shrink-0" size={17} />
            <div className="flex-1">
              <p className="text-xs font-bold text-rose-900">Workbook Read Error</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 p-1">
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Empty Upload Hero */}
        {!fileName && !error && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <label className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-8 cursor-pointer transition-all bg-slate-50/50 hover:bg-indigo-50/20">
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                />
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 group-hover:border-indigo-300 group-hover:text-indigo-600 text-slate-500 flex items-center justify-center transition-all shadow-xs mb-3">
                  <Upload size={20} />
                </div>
                <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                  Choose your Zyme Inventory Excel file
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports .xlsx, .xls, and .csv exports
                </p>
              </label>

              <div className="text-left bg-slate-50 rounded-xl p-3.5 border border-slate-100 text-[11px] text-slate-500 space-y-1">
                <span className="font-bold text-slate-700 block text-xs">Included Columns:</span>
                <p>• Total Files Released &amp; Total Txn's Released</p>
                <p>• Total Pending Files &amp; Total Txn's Pending</p>
                <p>• Count Escalated</p>
              </div>
            </div>
          </div>
        )}

        {/* Processed Results View */}
        {fileName && !error && (
          <div className="space-y-5">
            
            {/* Clean 5-KPI Metric Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              
              {/* Metric 1 */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <FileCheck2 size={14} className="text-indigo-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Files Released</span>
                </div>
                <div className="my-2">
                  <span className="text-2xl font-black text-slate-800 font-mono tabular-nums">
                    {filteredResults.totalFilesReleased}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  AMS {filteredResults.statsByRegion.AMS.releasedFiles} · APJ {filteredResults.statsByRegion.APJ.releasedFiles} · EMEA {filteredResults.statsByRegion.EMEA.releasedFiles}
                </p>
              </div>

              {/* Metric 2 */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Check size={14} className="text-emerald-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Txn's Released</span>
                </div>
                <div className="my-2">
                  <span className="text-2xl font-black text-emerald-600 font-mono tabular-nums">
                    {Math.round(filteredResults.totalTxnsReleased)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  AMS {Math.round(filteredResults.statsByRegion.AMS.totalTxnsReleased)} · APJ {Math.round(filteredResults.statsByRegion.APJ.totalTxnsReleased)} · EMEA {Math.round(filteredResults.statsByRegion.EMEA.totalTxnsReleased)}
                </p>
              </div>

              {/* Metric 3 */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Pending Files</span>
                </div>
                <div className="my-2">
                  <span className="text-2xl font-black text-slate-800 font-mono tabular-nums">
                    {filteredResults.totalPendingFiles}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  AMS {filteredResults.statsByRegion.AMS.totalPendingFiles} · APJ {filteredResults.statsByRegion.APJ.totalPendingFiles} · EMEA {filteredResults.statsByRegion.EMEA.totalPendingFiles}
                </p>
              </div>

              {/* Metric 4 */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Ban size={14} className="text-rose-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Txn's Pending</span>
                </div>
                <div className="my-2">
                  <span className="text-2xl font-black text-rose-600 font-mono tabular-nums">
                    {Math.round(filteredResults.totalTxnsPending)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  AMS {Math.round(filteredResults.statsByRegion.AMS.totalTxnsPending)} · APJ {Math.round(filteredResults.statsByRegion.APJ.totalTxnsPending)} · EMEA {Math.round(filteredResults.statsByRegion.EMEA.totalTxnsPending)}
                </p>
              </div>

              {/* Metric 5 */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between col-span-2 md:col-span-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Count Escalated</span>
                </div>
                <div className="my-2">
                  <span className="text-2xl font-black text-amber-600 font-mono tabular-nums">
                    {filteredResults.totalCountEscalated}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  APJ {filteredResults.statsByRegion.APJ.countEscalated} · AMS {filteredResults.statsByRegion.AMS.countEscalated} · EMEA {filteredResults.statsByRegion.EMEA.countEscalated}
                </p>
              </div>

            </div>

            {/* Main Clean Card: Regional Table + Email Preview */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Inventory Summary — {filteredResults.formattedDate}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Official regional reconciliation
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all text-xs font-semibold cursor-pointer active:scale-95"
                  >
                    {copiedMode === 'text' ? (
                      <>
                        <Check size={13} className="text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} className="text-slate-500" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={copyForEmail}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all text-xs font-semibold shadow-xs cursor-pointer active:scale-95"
                  >
                    {copiedMode === 'email' ? (
                      <>
                        <Check size={13} />
                        <span>Copied Table</span>
                      </>
                    ) : (
                      <>
                        <Mail size={13} />
                        <span>Copy Table</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Clean Table */}
              <div className="p-5 space-y-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-slate-100">
                        <th className="py-2.5 px-4 font-bold">Region</th>
                        <th className="py-2.5 px-4 font-bold text-right">Total Files Released</th>
                        <th className="py-2.5 px-4 font-bold text-right">Total Txn's Released</th>
                        <th className="py-2.5 px-4 font-bold text-right">Total Pending Files</th>
                        <th className="py-2.5 px-4 font-bold text-right">Total Txn's Pending</th>
                        <th className="py-2.5 px-4 font-bold text-right">Count Escalated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {filteredResults.regionalRows.map((row, idx) => {
                        const isTotal = idx === filteredResults.regionalRows.length - 1;
                        return (
                          <tr
                            key={row.region}
                            className={
                              isTotal
                                ? 'bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-200'
                                : 'bg-white text-slate-700 hover:bg-slate-50/70 transition-colors'
                            }
                          >
                            <td className="py-2.5 px-4 font-sans font-bold text-slate-900">
                              {row.region}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-slate-800">
                              {row.releasedFiles}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-emerald-700 font-bold">
                              {Math.round(row.totalTxnsReleased)}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-slate-800">
                              {row.totalPendingFiles}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-rose-600 font-semibold">
                              {Math.round(row.totalTxnsPending)}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-amber-700 font-semibold">
                              {row.countEscalated}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Email Dispatch Box */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Formatted Email Dispatch
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Matches official update format
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed text-xs select-all">
                    {filteredResults.reportText}
                  </pre>
                </div>
              </div>

              {/* Collapsible Record Inspector */}
              <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDetailsTable(prev => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  {showDetailsTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>
                    {showDetailsTable ? 'Hide underlying records' : 'Inspect underlying records'}
                  </span>
                  <span className="text-slate-400 font-normal">
                    ({filteredResults.releasedRows.length} released · {filteredResults.inProcessRows.length} pending · {filteredResults.escalatedRows.length} escalated)
                  </span>
                </button>

                {showDetailsTable && (
                  <div className="mt-3.5 space-y-3 pt-3 border-t border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      {/* Segmented Filter Control */}
                      <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setDetailsTab('released')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            detailsTab === 'released'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Released ({filteredResults.releasedRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('pending')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            detailsTab === 'pending'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Pending ({filteredResults.inProcessRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('escalated')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            detailsTab === 'escalated'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Escalated ({filteredResults.escalatedRows.length})
                        </button>
                      </div>

                      {/* Search */}
                      <div className="relative w-full sm:w-56">
                        <Search
                          size={13}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          value={detailSearch}
                          onChange={(e) => setDetailSearch(e.target.value)}
                          placeholder="Filter session keys..."
                          className="w-full pl-7 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-72 rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 font-semibold">Session Key</th>
                            <th className="py-2 px-3 font-semibold">Region</th>
                            <th className="py-2 px-3 font-semibold">Status</th>
                            <th className="py-2 px-3 font-semibold">Last Changed (UTC)</th>
                            <th className="py-2 px-3 font-semibold text-right">Released TXNs</th>
                            <th className="py-2 px-3 font-semibold text-right">Blocked TXNs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                          {activeDetailRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-400 font-sans">
                                No records matching view.
                              </td>
                            </tr>
                          ) : (
                            activeDetailRows.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50/70">
                                <td className="py-1.5 px-3 font-bold text-slate-900">
                                  {r.sessionKey}
                                </td>
                                <td className="py-1.5 px-3 font-sans font-medium text-slate-700">
                                  {r.region}
                                </td>
                                <td className="py-1.5 px-3 text-slate-600 font-sans">{r.status || '—'}</td>
                                <td className="py-1.5 px-3 text-slate-500 tabular-nums">
                                  {r.lastChangedRaw || '—'}
                                </td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-slate-900 font-bold">
                                  {Math.round(r.releasedItemCount)}
                                </td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-rose-600 font-bold">
                                  {Math.round(r.blockedItemCount)}
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
        )}

      </div>
    </div>
  );
};
