import * as XLSX from 'xlsx';
import { saveSplCcCommentsToDB, getSplCcCommentsFromDB } from './db.ts';

export interface SavedSplCcComment {
  id: string;
  posnr?: string;
  customerName: string;
  address: string;
  country: string;
  rplNames: string;
  comments: string;
  savedAt: string;
}

const STORAGE_KEY = 'zyme_saved_spl_cc_comments';

// Helper to push updates to the backend filesystem so comments persist across refreshes & restarts
async function persistToServer(comments: SavedSplCcComment[]): Promise<void> {
  try {
    // Back up to IndexedDB as well
    saveSplCcCommentsToDB(comments).catch(() => {});

    if (typeof fetch !== 'undefined') {
      await fetch('/api/save-splcc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments })
      });
    }
  } catch (err) {
    console.warn('Could not persist SPL CC comments to server:', err);
  }
}

// Synchronize storage with server file and IndexedDB on startup
export async function syncSplCcStorageWithServer(): Promise<SavedSplCcComment[]> {
  try {
    let localList = getSavedSplCcComments();

    // Check IndexedDB if local storage was empty
    if (localList.length === 0) {
      try {
        const idbList = await getSplCcCommentsFromDB();
        if (idbList && idbList.length > 0) {
          localList = idbList;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(localList));
        }
      } catch {
        // ignore IDB fallback error
      }
    }

    if (typeof fetch !== 'undefined') {
      const res = await fetch('/api/get-splcc');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.comments)) {
          const serverList: SavedSplCcComment[] = data.comments;
          
          if (localList.length === 0 && serverList.length > 0) {
            // Restore from server
            localList = serverList;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(localList));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: localList }));
            }
          } else if (localList.length > 0) {
            // Merge any missing items from server
            const localKeys = new Set(localList.map(c => `${c.customerName?.trim().toLowerCase()}_${c.address?.trim().toLowerCase()}`));
            let hasNew = false;
            serverList.forEach(sItem => {
              const k = `${sItem.customerName?.trim().toLowerCase()}_${sItem.address?.trim().toLowerCase()}`;
              if (!localKeys.has(k)) {
                localList.push(sItem);
                localKeys.add(k);
                hasNew = true;
              }
            });
            if (hasNew) {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(localList));
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: localList }));
              }
            }
            // Ensure server has latest local list
            persistToServer(localList);
          }
        }
      }
    }
    return localList;
  } catch (err) {
    console.warn('Error syncing SPL CC comments with server:', err);
    return getSavedSplCcComments();
  }
}

// Get all saved SPL CC comments from persistent storage
export function getSavedSplCcComments(): SavedSplCcComment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Failed to read saved SPL CC comments from localStorage:', err);
    return [];
  }
}

// Save or update an SPL CC comment in persistent storage
export function saveSplCcComment(
  entry: Omit<SavedSplCcComment, 'id' | 'savedAt'> & { id?: string }
): { success: boolean; comment: SavedSplCcComment; isUpdate: boolean } {
  try {
    const existing = getSavedSplCcComments();
    const nowStr = new Date().toLocaleString();
    
    // Check if an entry with matching customerName and address already exists
    let existingIndex = -1;
    if (entry.id) {
      existingIndex = existing.findIndex(item => item.id === entry.id);
    }
    if (existingIndex === -1 && entry.customerName) {
      const cleanName = entry.customerName.trim().toLowerCase();
      const cleanAddr = (entry.address || '').trim().toLowerCase();
      existingIndex = existing.findIndex(item => {
        const iName = (item.customerName || '').trim().toLowerCase();
        const iAddr = (item.address || '').trim().toLowerCase();
        if (iName !== cleanName) return false;
        if (cleanAddr && iAddr) return cleanAddr === iAddr;
        return true;
      });
    }

    let savedItem: SavedSplCcComment;
    let isUpdate = false;

    if (existingIndex >= 0) {
      // Update existing record
      isUpdate = true;
      savedItem = {
        ...existing[existingIndex],
        ...entry,
        id: existing[existingIndex].id,
        savedAt: nowStr,
      };
      existing[existingIndex] = savedItem;
    } else {
      // Add new record
      isUpdate = false;
      savedItem = {
        id: entry.id || `splcc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        posnr: entry.posnr || '',
        customerName: entry.customerName || '',
        address: entry.address || '',
        country: entry.country || '',
        rplNames: entry.rplNames || '',
        comments: entry.comments || '',
        savedAt: nowStr,
      };
      existing.unshift(savedItem); // newest on top
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    persistToServer(existing);
    
    // Dispatch custom event for real-time reactive sync
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: existing }));
    }

    return { success: true, comment: savedItem, isUpdate };
  } catch (err) {
    console.error('Failed to save SPL CC comment:', err);
    return { 
      success: false, 
      comment: {
        id: '',
        customerName: entry.customerName,
        address: entry.address,
        country: entry.country,
        rplNames: entry.rplNames,
        comments: entry.comments,
        savedAt: new Date().toLocaleString(),
      },
      isUpdate: false 
    };
  }
}

// Delete a single saved SPL CC comment
export function deleteSavedSplCcComment(id: string): SavedSplCcComment[] {
  try {
    const existing = getSavedSplCcComments();
    const filtered = existing.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    persistToServer(filtered);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: filtered }));
    }
    return filtered;
  } catch (err) {
    console.error('Failed to delete SPL CC comment:', err);
    return getSavedSplCcComments();
  }
}

// Clear all saved SPL CC comments
export function clearAllSavedSplCcComments(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    persistToServer([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: [] }));
    }
  } catch (err) {
    console.error('Failed to clear saved SPL CC comments:', err);
  }
}

// Import or update SPL CC comments archive from an uploaded Excel or CSV file
export async function importSplCcCommentsFromExcel(file: File): Promise<{ count: number; updated: SavedSplCcComment[] }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error('Spreadsheet appears to be empty or corrupted.');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('Spreadsheet has no rows.');
  }

  // Detect header indices
  let custNameIdx = -1;
  let addrIdx = -1;
  let countryIdx = -1;
  let rplIdx = -1;
  let commentIdx = -1;
  let posnrIdx = -1;

  const headerRow = rawRows[0] || [];
  headerRow.forEach((col, idx) => {
    const s = String(col || '').trim().toLowerCase();
    if (s.includes('customer') || (s.includes('name') && !s.includes('rpl'))) custNameIdx = idx;
    else if (s.includes('addr') || s.includes('street')) addrIdx = idx;
    else if (s.includes('countr') || s === 'ctr') countryIdx = idx;
    else if (s.includes('rpl')) rplIdx = idx;
    else if (s.includes('comment') || s.includes('note') || s.includes('remark')) commentIdx = idx;
    else if (s.includes('posnr') || s.includes('item')) posnrIdx = idx;
  });

  // If couldn't detect header names, fallback to standard column positions
  if (custNameIdx === -1 && commentIdx === -1) {
    custNameIdx = 0;
    addrIdx = 1;
    countryIdx = 2;
    rplIdx = 3;
    commentIdx = 4;
    posnrIdx = 5;
  }

  const existing = getSavedSplCcComments();
  const nowStr = new Date().toLocaleString();
  let importedCount = 0;

  // Process rows (start from 1 if row 0 was headers)
  const startIndex = (custNameIdx !== -1 && String(headerRow[custNameIdx] || '').toLowerCase().includes('name')) ? 1 : 0;

  for (let r = startIndex; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const customerName = custNameIdx >= 0 ? String(row[custNameIdx] || '').trim() : '';
    const comments = commentIdx >= 0 ? String(row[commentIdx] || '').trim() : '';
    const address = addrIdx >= 0 ? String(row[addrIdx] || '').trim() : '';
    const country = countryIdx >= 0 ? String(row[countryIdx] || '').trim() : '';
    const rplNames = rplIdx >= 0 ? String(row[rplIdx] || '').trim() : '';
    const posnr = posnrIdx >= 0 ? String(row[posnrIdx] || '').trim() : '';

    if (!customerName && !comments) continue;

    // Check if matching record exists
    const cleanName = customerName.toLowerCase();
    const cleanAddr = address.toLowerCase();

    const existingIdx = existing.findIndex(item => {
      const iName = (item.customerName || '').trim().toLowerCase();
      const iAddr = (item.address || '').trim().toLowerCase();
      if (cleanName && iName !== cleanName) return false;
      if (cleanAddr && iAddr) return cleanAddr === iAddr;
      return true;
    });

    if (existingIdx >= 0) {
      existing[existingIdx] = {
        ...existing[existingIdx],
        customerName: customerName || existing[existingIdx].customerName,
        address: address || existing[existingIdx].address,
        country: country || existing[existingIdx].country,
        rplNames: rplNames || existing[existingIdx].rplNames,
        comments: comments || existing[existingIdx].comments,
        posnr: posnr || existing[existingIdx].posnr,
        savedAt: nowStr
      };
    } else {
      existing.unshift({
        id: `splcc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        posnr,
        customerName,
        address,
        country,
        rplNames,
        comments,
        savedAt: nowStr
      });
    }
    importedCount++;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  persistToServer(existing);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: existing }));
  }

  return { count: importedCount, updated: existing };
}

// Download saved SPL CC comments as an Excel file
// Required columns: Customer Name, Address, Country, RPL Names, Comments
export function exportSplCcCommentsToExcel(comments?: SavedSplCcComment[]): boolean {
  try {
    const list = comments || getSavedSplCcComments();
    if (!list || list.length === 0) {
      return false;
    }

    // Exact headers requested by user:
    // "customer name , address & country with RPL names & Comments"
    const headers = [
      'Customer Name',
      'Address',
      'Country',
      'RPL Names',
      'Comments',
      'Posnr',
      'Date Saved'
    ];

    const rows = list.map(item => [
      item.customerName || '',
      item.address || '',
      item.country || '',
      item.rplNames || '',
      item.comments || '',
      item.posnr || '',
      item.savedAt || ''
    ]);

    const aoa = [headers, ...rows];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Auto-compute column widths
    const colWidths = headers.map((hdr, colI) => {
      let maxLen = hdr.length;
      for (let r = 1; r < Math.min(aoa.length, 150); r++) {
        const val = aoa[r]?.[colI];
        if (val !== null && val !== undefined) {
          const l = String(val).length;
          if (l > maxLen) maxLen = l;
        }
      }
      return { wch: Math.min(Math.max(maxLen + 3, 14), 60) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'SPL_CC_Comments');

    const excelBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([new Uint8Array(excelBuf)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const fileName = `SPL_CC_Comments_${dateStr}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return true;
  } catch (err) {
    console.error('Failed to export SPL CC comments to Excel:', err);
    return false;
  }
}
