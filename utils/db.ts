const DB_NAME = "zyme_db";
const STORE_NAME = "reference_store";
const SPLCC_STORE_NAME = "splcc_comments_store";
const DB_VERSION = 2;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SPLCC_STORE_NAME)) {
        db.createObjectStore(SPLCC_STORE_NAME);
      }
    };
  });
}

export async function saveReferenceData(data: Record<string, string[]>, fileName: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    store.put(data, "referenceData");
    store.put(fileName, "referenceFileName");
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getReferenceData(): Promise<{ data: Record<string, string[]> | null; fileName: string | null }> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      
      const reqData = store.get("referenceData");
      const reqName = store.get("referenceFileName");
      
      let data: Record<string, string[]> | null = null;
      let fileName: string | null = null;
      
      reqData.onsuccess = () => {
        data = reqData.result || null;
      };
      reqName.onsuccess = () => {
        fileName = reqName.result || null;
      };
      
      transaction.oncomplete = () => {
        resolve({ data, fileName });
      };
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error("Failed to read from IndexedDB", error);
    return { data: null, fileName: null };
  }
}

export async function clearReferenceData(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.delete("referenceData");
      store.delete("referenceFileName");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("Failed to clear IndexedDB", error);
  }
}

export async function saveSplCcCommentsToDB(comments: any[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SPLCC_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SPLCC_STORE_NAME);
      store.put(comments, "all_comments");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn("Failed to save SPL CC comments to IndexedDB", err);
  }
}

export async function getSplCcCommentsFromDB(): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise<any[]>((resolve, reject) => {
      const transaction = db.transaction(SPLCC_STORE_NAME, "readonly");
      const store = transaction.objectStore(SPLCC_STORE_NAME);
      const req = store.get("all_comments");
      req.onsuccess = () => {
        const val = req.result;
        resolve(Array.isArray(val) ? val : []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to load SPL CC comments from IndexedDB", err);
    return [];
  }
}
