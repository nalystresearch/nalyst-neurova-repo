type UpgradeCallback = (
  db: IDBDatabase,
  oldVersion: number,
  newVersion: number | null,
) => void;

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Transaction error"));
  });
}

export async function openDb(
  name: string,
  version: number,
  onUpgrade: UpgradeCallback,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);

    req.onupgradeneeded = (event) => {
      const e = event as IDBVersionChangeEvent;
      onUpgrade(req.result, e.oldVersion, e.newVersion);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function withStore<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await fn(store);
  await transactionDone(tx);
  return result;
}

export async function withStores<T>(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(storeNames, mode);
  const stores: Record<string, IDBObjectStore> = {};
  for (const name of storeNames) stores[name] = tx.objectStore(name);
  const result = await fn(stores);
  await transactionDone(tx);
  return result;
}

export { requestToPromise };
