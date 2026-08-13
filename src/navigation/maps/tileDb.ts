/**
 * IndexedDB tile cache store (`aanyaa_tile_cache`).
 * Persists loaded map tile DataURLs or Blobs for 100% offline map availability.
 */

const DB_NAME = 'aanyaa_tile_cache';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

let dbPromise: Promise<IDBDatabase> | null = null;

function getTileDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

export async function saveTileToDb(key: string, dataUrl: string): Promise<void> {
  try {
    const db = await getTileDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, key);
  } catch {
    /* ignore storage quota / error */
  }
}

export async function getTileFromDb(key: string): Promise<string | null> {
  try {
    const db = await getTileDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
