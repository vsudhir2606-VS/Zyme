import * as XLSX from 'xlsx';

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
    
    // Check if an entry with matching customerName and posnr already exists
    let existingIndex = -1;
    if (entry.id) {
      existingIndex = existing.findIndex(item => item.id === entry.id);
    }
    if (existingIndex === -1 && entry.customerName) {
      // Find by combination of customerName and posnr or comments
      existingIndex = existing.findIndex(
        item => item.customerName.trim().toLowerCase() === entry.customerName.trim().toLowerCase() &&
                (entry.posnr ? item.posnr === entry.posnr : true)
      );
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
    
    // Dispatch a custom window event so other components (App.tsx, Settings modal) sync in real time
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zyme:splcc-updated', { detail: [] }));
    }
  } catch (err) {
    console.error('Failed to clear saved SPL CC comments:', err);
  }
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
