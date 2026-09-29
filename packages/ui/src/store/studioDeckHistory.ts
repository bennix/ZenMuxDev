export interface StudioDeckRecord {
  id: string;
  title: string;
  pages: string[];
  updatedAt: number;
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("zencode-studio-decks", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("decks", { keyPath: "id" });
      request.result.createObjectStore("deleted");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}

export async function listStudioDecks(): Promise<StudioDeckRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("decks").objectStore("decks").getAll();
    request.onsuccess = () =>
      resolve((request.result as StudioDeckRecord[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}

export async function saveStudioDeck(record: StudioDeckRecord): Promise<void> {
  if (!record.pages.length) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["decks", "deleted"], "readwrite");
    const check = tx.objectStore("deleted").get(record.id);
    // 删除标记与页面写入同属一个事务，阻止旧面板的延迟保存复活记录。
    check.onsuccess = () => {
      if (!check.result) tx.objectStore("decks").put(record);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Deck save aborted"));
  });
}

export async function deleteStudioDecks(ids: readonly string[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["decks", "deleted"], "readwrite");
    for (const id of ids) {
      tx.objectStore("decks").delete(id);
      tx.objectStore("deleted").put(true, id);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Deck deletion aborted"));
  });
}
