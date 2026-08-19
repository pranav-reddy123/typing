/**
 * A ~90 line IndexedDB wrapper. We need six operations, not a 12 kB library.
 */

export interface StoreSpec {
  name: string;
  keyPath: string | string[];
  indexes?: Array<{ name: string; keyPath: string | string[]; unique?: boolean }>;
}

export class Idb {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private readonly name: string;
  private readonly version: number;
  private readonly stores: StoreSpec[];

  constructor(name: string, version: number, stores: StoreSpec[]) {
    this.name = name;
    this.version = version;
    this.stores = stores;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const spec of this.stores) {
          const store = db.objectStoreNames.contains(spec.name)
            ? req.transaction!.objectStore(spec.name)
            : db.createObjectStore(spec.name, { keyPath: spec.keyPath });
          for (const idx of spec.indexes ?? []) {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async run<T>(
    store: string,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return this.run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  }

  getAll<T>(store: string, query?: IDBKeyRange | IDBValidKey): Promise<T[]> {
    return this.run<T[]>(store, 'readonly', (s) => s.getAll(query) as IDBRequest<T[]>);
  }

  getAllByIndex<T>(store: string, index: string, query: IDBKeyRange | IDBValidKey): Promise<T[]> {
    return this.run<T[]>(store, 'readonly', (s) => s.index(index).getAll(query) as IDBRequest<T[]>);
  }

  put<T>(store: string, value: T): Promise<IDBValidKey> {
    return this.run<IDBValidKey>(store, 'readwrite', (s) => s.put(value) as IDBRequest<IDBValidKey>);
  }

  async putMany<T>(store: string, values: T[]): Promise<void> {
    if (values.length === 0) return;
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      for (const v of values) s.put(v);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  delete(store: string, key: IDBValidKey): Promise<undefined> {
    return this.run<undefined>(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
  }

  clear(store: string): Promise<undefined> {
    return this.run<undefined>(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
  }
}
