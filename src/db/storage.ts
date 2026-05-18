const DB_NAME = 'studying-tools-db';
const STORE_NAME = 'sqlite';
const DB_KEY = 'main';

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveDatabase(data: Uint8Array): Promise<void> {
  const idb = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = (event: Event) => reject((event.target as IDBTransaction).error);
  });
}

export async function loadDatabase(): Promise<Uint8Array | null> {
  const idb = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DB_KEY);
    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBRequest).result ?? null);
    };
    request.onerror = (event: Event) => {
      reject((event.target as IDBRequest).error);
    };
  });
}
