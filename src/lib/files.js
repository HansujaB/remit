const DB = "remit-files";
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function fileStore(action, key, file) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "files",
        action === "get" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("files");
      const request =
        action === "put"
          ? store.put(file, key)
          : action === "delete"
            ? store.delete(key)
            : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
