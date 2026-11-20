const DB_NAME = "zyme_db";
const STORE_NAME = "reference_store";
const SPLCC_STORE_NAME = "splcc_comments_store";
const RPL_MATCH_STORE_NAME = "rpl_match_store";
const MIN_DB_VERSION = 3;
const REQUIRED_STORES = [STORE_NAME, SPLCC_STORE_NAME, RPL_MATCH_STORE_NAME] as const;

function ensureStores(db: IDBDatabase): void {
  for (const storeName of REQUIRED_STORES) {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName);
    }
  }
}

function hasAllRequiredStores(db: IDBDatabase): boolean {
  return REQUIRED_STORES.every((storeName) => db.objectStoreNames.contains(storeName));
}

function openWithVersion(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      typeof version === "number"
        ? indexedDB.open(DB_NAME, version)
        : indexedDB.open(DB_NAME);

    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      // Allow pending versionchange handlers in other connections to close cleanly
    };
    request.onupgradeneeded = () => {
      ensureStores(request.result);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
  });
}

let pendingOpenPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (pendingOpenPromise) return pendingOpenPromise;

  const attemptOpen = async (): Promise<IDBDatabase> => {
    // Open at whatever version currently exists (never triggers VersionError)
    const db = await openWithVersion();
    if (hasAllRequiredStores(db)) {
      return db;
    }

    // Existing DB is missing one or more stores: safely bump version above current
    const targetVersion = Math.max(db.version + 1, MIN_DB_VERSION);
    db.close();

    try {
      return await openWithVersion(targetVersion);
    } catch (err: any) {
      // If another tab concurrently upgraded to an even higher version, re-open at current version
      if (err?.name === "VersionError") {
        const latestDb = await openWithVersion();
        if (hasAllRequiredStores(latestDb)) {
          return latestDb;
        }
        const retryVersion = latestDb.version + 1;
        latestDb.close();
        return openWithVersion(retryVersion);
      }
      throw err;
    }
  };

  pendingOpenPromise = attemptOpen().finally(() => {
    pendingOpenPromise = null;
  });

  return pendingOpenPromise;
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

export async function saveRplMatchConfigToDB(config: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(RPL_MATCH_STORE_NAME, "readwrite");
      const store = transaction.objectStore(RPL_MATCH_STORE_NAME);
      store.put(config, "rpl_match_config");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn("Failed to save RPL match config to IndexedDB", err);
  }
}

export async function getRplMatchConfigFromDB(): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise<any | null>((resolve, reject) => {
      const transaction = db.transaction(RPL_MATCH_STORE_NAME, "readonly");
      const store = transaction.objectStore(RPL_MATCH_STORE_NAME);
      const req = store.get("rpl_match_config");
      req.onsuccess = () => {
        resolve(req.result ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to load RPL match config from IndexedDB", err);
    return null;
  }
}
