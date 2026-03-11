import { read, utils } from 'xlsx';

export interface InventoryData {
  region: string;
  receivedFiles: number;
  receivedTransactions: number;
  releasedFiles: number;
  releasedTransactions: number;
  pendingFiles: number;
  pendingTransactions: number;
}

export interface InventorySummary {
  newVolumeFiles: number;
  newVolumeTransactions: number;
  clearedFiles: number;
  clearedTransactions: number;
  remainingFiles: number;
  remainingTransactions: number;
  escalations: {
    apj: number;
    ams: number;
    emea: number;
  };
  table: InventoryData[];
  date: string;
}

export const processInventoryFiles = async (metricsFile: File, statusFile: File): Promise<InventorySummary> => {
  const metricsData = await readFile(metricsFile);
  const statusData = await readFile(statusFile);

  // --- Pre-process metricsData ---
  // 1. Delete rows 1, 2, 3, 4, 6 (Indices 0, 1, 2, 3, 5)
  let processedMetrics = metricsData.filter((_, idx) => ![0, 1, 2, 3, 5].includes(idx));
  
  // 2. Delete column 1 (Index 0)
  processedMetrics = processedMetrics.map(row => row.slice(1));

  // 3. Filter by present date
  // The header is now at index 0 of processedMetrics
  const metricsHeaders = processedMetrics[0] || [];
  const dateColIdx = metricsHeaders.findIndex(h => String(h).toLowerCase().includes('date'));
  
  if (dateColIdx !== -1) {
    const today = new Date();
    const dataRows = processedMetrics.slice(1).filter(row => {
      const cellVal = row[dateColIdx];
      if (!cellVal) return false;
      
      let d: Date;
      if (typeof cellVal === 'number') {
        // Handle Excel serial date if cellDates: true didn't catch it
        d = new Date((cellVal - 25569) * 86400 * 1000);
      } else {
        d = new Date(cellVal);
      }

      if (isNaN(d.getTime())) return false;
      
      return d.getDate() === today.getDate() &&
             d.getMonth() === today.getMonth() &&
             d.getFullYear() === today.getFullYear();
    });
    processedMetrics = [metricsHeaders, ...dataRows];
  }

  // Initialize table data
  const regions = ['APJ', 'AMS', 'EMEA'];
  const table: InventoryData[] = regions.map(region => ({
    region,
    receivedFiles: 0,
    receivedTransactions: 0,
    releasedFiles: 0,
    releasedTransactions: 0,
    pendingFiles: 0,
    pendingTransactions: 0
  }));

  // Logic to parse metricsData
  // We expect columns like 'Region', 'Status', 'File Count', 'Transaction Count'
  // Or similar variations.
  
  const processSheet = (data: any[][]) => {
    const headers = data[0] || [];
    const rows = data.slice(1);

    const findCol = (keywords: string[]) => {
      return headers.findIndex(h => 
        keywords.some(k => String(h).toLowerCase().includes(k.toLowerCase()))
      );
    };

    const regionCol = findCol(['region']);
    const statusCol = findCol(['status', 'type', 'category']);
    const fileCol = findCol(['file count', 'files', 'count']);
    const transCol = findCol(['transaction', 'tran count', 'transactions']);

    if (regionCol === -1) return;

    rows.forEach(row => {
      const region = String(row[regionCol] || '').toUpperCase();
      const status = String(row[statusCol] || '').toLowerCase();
      const files = Number(row[fileCol]) || 0;
      const trans = Number(row[transCol]) || 0;

      const target = table.find(t => region.includes(t.region));
      if (target) {
        if (status.includes('received') || status.includes('new')) {
          target.receivedFiles += files;
          target.receivedTransactions += trans;
        } else if (status.includes('released') || status.includes('cleared') || status.includes('processed')) {
          target.releasedFiles += files;
          target.releasedTransactions += trans;
        } else if (status.includes('pending') || status.includes('remaining')) {
          target.pendingFiles += files;
          target.pendingTransactions += trans;
        }
      }
    });
  };

  processSheet(processedMetrics);
  // If status file has similar structure or different, we can process it too
  // For escalations, we might look for 'Escalation' or 'Gina/Kiran/Shawn'
  
  let escalations = { apj: 0, ams: 0, emea: 0 };
  
  const findEscalations = (data: any[][]) => {
    const headers = data[0] || [];
    const rows = data.slice(1);
    
    const regionCol = headers.findIndex(h => String(h).toLowerCase().includes('region'));
    const escalationCol = headers.findIndex(h => 
      ['escalation', 'gina', 'kiran', 'shawn'].some(k => String(h).toLowerCase().includes(k))
    );

    if (regionCol !== -1 && escalationCol !== -1) {
      rows.forEach(row => {
        const region = String(row[regionCol] || '').toUpperCase();
        const val = Number(row[escalationCol]) || 0;
        if (region.includes('APJ')) escalations.apj += val;
        if (region.includes('AMS')) escalations.ams += val;
        if (region.includes('EMEA')) escalations.emea += val;
      });
    }
  };

  findEscalations(statusData);

  const totalReceivedFiles = table.reduce((sum, t) => sum + t.receivedFiles, 0);
  const totalReceivedTrans = table.reduce((sum, t) => sum + t.receivedTransactions, 0);
  const totalReleasedFiles = table.reduce((sum, t) => sum + t.releasedFiles, 0);
  const totalReleasedTrans = table.reduce((sum, t) => sum + t.releasedTransactions, 0);
  const totalPendingFiles = table.reduce((sum, t) => sum + t.pendingFiles, 0);
  const totalPendingTrans = table.reduce((sum, t) => sum + t.pendingTransactions, 0);

  return {
    newVolumeFiles: totalReceivedFiles,
    newVolumeTransactions: totalReceivedTrans,
    clearedFiles: totalReleasedFiles,
    clearedTransactions: totalReleasedTrans,
    remainingFiles: totalPendingFiles,
    remainingTransactions: totalPendingTrans,
    escalations,
    table,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  };
};

const readFile = (file: File): Promise<any[][]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
        resolve(jsonData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
