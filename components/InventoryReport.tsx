import React, { useState, useMemo } from 'react';
import {
  FileText,
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

    const dateMatchedRows = zymeRows.filter(r => r.candidateDates.includes(selectedDate));
    const releasedRows = dateMatchedRows.filter(
      r =>
        r.releasedItemCount !== 0 &&
        r.releasedItemCount > 0 &&
        (r.region === 'AMS' || r.region === 'APJ' || r.region === 'EMEA')
    );

    const escalatedRows = releasedRows.filter(
      r => r.blockedItemCount !== 0 && r.blockedItemCount > 0
    );

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
        <table style="width: 100%; max-width: 780px; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; margin-top: 16px;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th style="padding: 9px 12px; border: 1px solid #1e293b; text-align: left;">Region</th>
              <th style="padding: 9px 12px; border: 1px solid #1e293b; text-align: left;">Session Key Prefix</th>
              <th style="padding: 9px 12px; border: 1px solid #1e293b; text-align: right;">Total Files Released</th>
              <th style="padding: 9px 12px; border: 1px solid #1e293b; text-align: right;">Total Count Released(TXNs)</th>
              <th style="padding: 9px 12px; border: 1px solid #1e293b; text-align: right;">Count Escalated (TXNs)</th>
              <th style="padding: 9px 12px; border: 1px solid #1e293b; text-align: right;">Total File Count (In-Process)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredResults.regionalRows
              .map(
                (row, idx) => `
              <tr style="background-color: ${
                idx === filteredResults.regionalRows.length - 1 ? '#f8fafc' : '#ffffff'
              }; font-weight: ${
                  idx === filteredResults.regionalRows.length - 1 ? 'bold' : 'normal'
                };">
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #0f172a;">${row.region}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #64748b;">${row.prefixLabel}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${row.releasedFiles}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${Math.round(
                  row.releasedItemCount
                )}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${Math.round(
                  row.escalatedCount
                )}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #0f172a;">${row.inProcessFileCount}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;

      const fullHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.6;">
          <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap; margin: 0;">${filteredResults.reportText}</pre>
          ${tableHtml}
        </div>
      `;

      const plainTextWithTable = `${filteredResults.reportText}\n\nRegion\tSession Key Prefix\tTotal Files Released\tTotal Count Released(TXNs)\tCount Escalated (TXNs)\tTotal File Count (In-Process)\n${filteredResults.regionalRows
        .map(
          r =>
            `${r.region}\t${r.prefixLabel}\t${r.releasedFiles}\t${Math.round(
              r.releasedItemCount
            )}\t${Math.round(r.escalatedCount)}\t${r.inProcessFileCount}`
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
        : detailsTab === 'escalated'
        ? filteredResults.escalatedRows
        : filteredResults.inProcessRows;

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
    <div className="flex-1 overflow-y-auto p-6 md:p-8 relative z-10">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Unified Top Control Bar */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            
            {/* Left: File Source Control */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 flex-shrink-0">
                {isProcessing ? (
                  <Loader2 size={20} className="animate-spin text-indigo-600" />
                ) : (
                  <FileSpreadsheet size={20} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">
                    {fileName ? fileName : 'Inventory Source Workbook'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {fileName
                    ? `${filteredResults.totalRawRows.toLocaleString()} total rows · ${filteredResults.zymeRowCount.toLocaleString()} Zyme records`
                    : 'Upload single Excel or CSV export to compute regional release and in-process metrics'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs">
                  <Upload size={14} />
                  <span>{fileName ? 'Replace File' : 'Upload Excel'}</span>
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
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors"
                    title="Clear uploaded file"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Vertical Divider on Desktop */}
            <div className="hidden lg:block w-px h-10 bg-slate-200" />

            {/* Right: Report Date Filter */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <Calendar size={15} className="text-slate-400" />
                <span>Last Changed (UTC):</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors"
                >
                  Today
                </button>
              </div>
            </div>

          </div>

          {/* Available Dates Selector Bar (when file is loaded) */}
          {fileName && availableZymeDates.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 font-medium mr-1">
                Detected dates in file:
              </span>
              {availableZymeDates.slice(0, 10).map(d => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDate(d.date)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors tabular-nums ${
                    selectedDate === d.date
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                  }`}
                >
                  {d.date} <span className="opacity-70">({d.count})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="text-rose-600 mt-0.5 flex-shrink-0" size={18} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-900">Unable to process workbook</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
              <Trash2 size={15} />
            </button>
          </div>
        )}

        {/* Empty Upload State */}
        {!fileName && !error && (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-10 text-center">
            <div className="max-w-lg mx-auto space-y-5">
              <label className="group block border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-xl p-10 cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/10">
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-colors shadow-2xs">
                    <Upload size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                      Drop your Zyme Inventory Excel file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Supports .xlsx, .xls, and .csv exports
                    </p>
                  </div>
                </div>
              </label>

              <div className="text-left bg-slate-50 rounded-lg p-4 border border-slate-200/60 space-y-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Automated Calculation Rules</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-500 leading-relaxed">
                  <div>
                    1. Filters <span className="text-slate-700 font-medium">Business Type = Zyme</span> and maps <span className="text-slate-700 font-medium">Session Key</span> (<span className="font-mono">Nasa*</span> &rarr; AMS, <span className="font-mono">APJ*</span> &rarr; APJ, <span className="font-mono">EMEA*</span> &rarr; EMEA).
                  </div>
                  <div>
                    2. <span className="text-slate-700 font-medium">Released Files &amp; TXNs</span>: Matches selected <span className="text-slate-700 font-medium">Last Changed At (UTC)</span> date with <span className="text-slate-700 font-medium">Total Released Item Count &ne; 0</span>.
                  </div>
                  <div>
                    3. <span className="text-slate-700 font-medium">Count Escalated (TXNs)</span>: Sums <span className="text-slate-700 font-medium">Total Blocked Item Count</span> where Released &ne; 0 and Blocked &ne; 0.
                  </div>
                  <div>
                    4. <span className="text-slate-700 font-medium">Total File Count (In-Process)</span>: Counts rows where <span className="text-slate-700 font-medium">Status</span> is <span className="text-slate-700 font-medium">In-process</span> or <span className="text-slate-700 font-medium">New</span> and Released = 0.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Executive Results Section */}
        {fileName && !error && (
          <div className="space-y-6">
            
            {/* Unified 4-Metric KPI Strip */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
              
              {/* Metric 1: Total Files Released */}
              <div className="p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Total Files Released</span>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">{selectedDate}</span>
                </div>
                <div className="my-2.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-slate-900 tracking-tight font-mono tabular-nums">
                    {filteredResults.totalFilesReleased}
                  </span>
                  <span className="text-xs text-slate-500">files</span>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-2">
                  <span>AMS {filteredResults.statsByRegion.AMS.releasedFiles}</span>
                  <span aria-hidden="true">·</span>
                  <span>APJ {filteredResults.statsByRegion.APJ.releasedFiles}</span>
                  <span aria-hidden="true">·</span>
                  <span>EMEA {filteredResults.statsByRegion.EMEA.releasedFiles}</span>
                </div>
              </div>

              {/* Metric 2: Total Count Released (TXNs) */}
              <div className="p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Total Count Released</span>
                  <span className="text-xs text-emerald-600 font-medium">Cleared</span>
                </div>
                <div className="my-2.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-slate-900 tracking-tight font-mono tabular-nums">
                    {Math.round(filteredResults.totalCountReleased)}
                  </span>
                  <span className="text-xs text-slate-500">Transactions</span>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-2">
                  <span>AMS {Math.round(filteredResults.statsByRegion.AMS.releasedItemCount)}</span>
                  <span aria-hidden="true">·</span>
                  <span>APJ {Math.round(filteredResults.statsByRegion.APJ.releasedItemCount)}</span>
                  <span aria-hidden="true">·</span>
                  <span>EMEA {Math.round(filteredResults.statsByRegion.EMEA.releasedItemCount)}</span>
                </div>
              </div>

              {/* Metric 3: Count Escalated/Pending */}
              <div className="p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Count Escalated/Pending</span>
                  <span className="text-xs text-amber-600 font-medium">
                    {filteredResults.totalEscalatedFiles} {filteredResults.totalEscalatedFiles === 1 ? 'file' : 'files'}
                  </span>
                </div>
                <div className="my-2.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-slate-900 tracking-tight font-mono tabular-nums">
                    {Math.round(filteredResults.totalCountEscalated)}
                  </span>
                  <span className="text-xs text-slate-500">TXN</span>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-2">
                  <span>APJ {Math.round(filteredResults.statsByRegion.APJ.escalatedCount)}</span>
                  <span aria-hidden="true">·</span>
                  <span>AMS {Math.round(filteredResults.statsByRegion.AMS.escalatedCount)}</span>
                  <span aria-hidden="true">·</span>
                  <span>EMEA {Math.round(filteredResults.statsByRegion.EMEA.escalatedCount)}</span>
                </div>
              </div>

              {/* Metric 4: Total File Count (In-Process / New) */}
              <div className="p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Total File Count</span>
                  <span className="text-xs text-indigo-600 font-medium">In-Process / New</span>
                </div>
                <div className="my-2.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-slate-900 tracking-tight font-mono tabular-nums">
                    {filteredResults.totalInProcessFiles}
                  </span>
                  <span className="text-xs text-slate-500">files</span>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-2">
                  <span>AMS {filteredResults.statsByRegion.AMS.inProcessFileCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>APJ {filteredResults.statsByRegion.APJ.inProcessFileCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>EMEA {filteredResults.statsByRegion.EMEA.inProcessFileCount}</span>
                </div>
              </div>

            </div>

            {/* Main Results Container: Regional Table + Formatted Status Dispatch */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              
              {/* Results Header Bar */}
              <div className="px-6 py-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Zyme Inventory Report — {filteredResults.formattedDate}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Regional breakdown and formatted email status summary
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors text-xs font-semibold"
                  >
                    {copiedMode === 'text' ? (
                      <>
                        <Check size={14} className="text-emerald-600" />
                        <span className="text-emerald-700">Copied Text</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} className="text-slate-500" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={copyForEmail}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-xs font-semibold shadow-2xs"
                  >
                    {copiedMode === 'email' ? (
                      <>
                        <Check size={14} />
                        <span>Copied with Table</span>
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

              {/* Content Body: Regional Breakdown Table + Email Text Preview */}
              <div className="p-6 space-y-6">
                
                {/* Regional Summary Table */}
                <div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-slate-100 border-b border-slate-800">
                          <th className="py-3 px-4 font-semibold">Region</th>
                          <th className="py-3 px-4 font-semibold">Session Key Prefix</th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Total Files Released
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Total Count Released(TXNs)
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Count Escalated (TXNs)
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Total File Count (In-Process)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80">
                        {filteredResults.regionalRows.map((row, idx) => {
                          const isTotal = idx === filteredResults.regionalRows.length - 1;
                          return (
                            <tr
                              key={row.region}
                              className={
                                isTotal
                                  ? 'bg-slate-50/90 font-semibold text-slate-900 border-t-2 border-slate-300'
                                  : 'bg-white text-slate-700 hover:bg-slate-50/60 transition-colors'
                              }
                            >
                              <td className="py-3 px-4 font-medium text-slate-900">
                                {row.region}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-500">
                                {row.prefixLabel}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {row.releasedFiles}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {Math.round(row.releasedItemCount)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {Math.round(row.escalatedCount)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {row.inProcessFileCount}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Email Status Message Preview */}
                <div className="rounded-lg border border-slate-200/90 bg-slate-50/60 p-5">
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200/70">
                    <span className="text-xs font-semibold text-slate-700">
                      Formatted Email Dispatch
                    </span>
                    <span className="text-xs text-slate-400">
                      Ready to paste into Outlook / Teams
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed text-sm select-all">
                    {filteredResults.reportText}
                  </pre>
                </div>

              </div>

              {/* Footer: Collapsible Row-Level Audit Inspector */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowDetailsTable(prev => !prev)}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
                  >
                    {showDetailsTable ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    <span>
                      {showDetailsTable ? 'Hide underlying session records' : 'Inspect underlying session records'}
                    </span>
                    <span className="text-slate-400 font-normal font-mono tabular-nums">
                      ({filteredResults.releasedRows.length} released · {filteredResults.escalatedRows.length} escalated · {filteredResults.inProcessRows.length} in-process/new)
                    </span>
                  </button>
                </div>

                {showDetailsTable && (
                  <div className="mt-4 space-y-3 pt-3 border-t border-slate-200/70">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Segmented Filter Control */}
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setDetailsTab('released')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
                            detailsTab === 'released'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Released ({filteredResults.releasedRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('escalated')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
                            detailsTab === 'escalated'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Escalated ({filteredResults.escalatedRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('inprocess')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
                            detailsTab === 'inprocess'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          In-Process / New ({filteredResults.inProcessRows.length})
                        </button>
                      </div>

                      {/* Search Input */}
                      <div className="relative w-full sm:w-64">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          value={detailSearch}
                          onChange={(e) => setDetailSearch(e.target.value)}
                          placeholder="Filter by Session Key or Region..."
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-80 rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-600 sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3.5 font-semibold">Session Key</th>
                            <th className="py-2.5 px-3.5 font-semibold">Region</th>
                            <th className="py-2.5 px-3.5 font-semibold">Status</th>
                            <th className="py-2.5 px-3.5 font-semibold">Last Changed At (UTC)</th>
                            <th className="py-2.5 px-3.5 font-semibold text-right">
                              Released (TXNs)
                            </th>
                            <th className="py-2.5 px-3.5 font-semibold text-right">
                              Blocked / Escalated (TXNs)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeDetailRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400">
                                No matching records found for this view.
                              </td>
                            </tr>
                          ) : (
                            activeDetailRows.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50/80">
                                <td className="py-2 px-3.5 font-mono text-slate-900">
                                  {r.sessionKey}
                                </td>
                                <td className="py-2 px-3.5 font-medium text-slate-700">
                                  {r.region}
                                </td>
                                <td className="py-2 px-3.5 text-slate-600">{r.status || '—'}</td>
                                <td className="py-2 px-3.5 font-mono text-slate-500 tabular-nums">
                                  {r.lastChangedRaw || '—'}
                                </td>
                                <td className="py-2 px-3.5 text-right font-mono tabular-nums font-medium text-slate-900">
                                  {Math.round(r.releasedItemCount)}
                                </td>
                                <td className="py-2 px-3.5 text-right font-mono tabular-nums font-medium text-slate-700">
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
