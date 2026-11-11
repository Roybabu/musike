import type { TakeoutActivity } from "./takeout";

// An independent database keeps imports away from the existing library and its backup format.
const DATABASE = "musike-takeout-activity";
const STORE = "activities";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ["videoId", "watchedAt"] });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open activity storage"));
    request.onblocked = () => reject(new Error("Activity storage is blocked by another app window"));
  });
}

/** Add missing activities atomically; duplicate keys do not overwrite existing entries. */
export async function importActivities(activities: TakeoutActivity[]): Promise<{ added: number; duplicates: number }> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let added = 0;
      let duplicates = 0;
      try {
        for (const activity of activities) {
          const request = store.add(activity);
          request.onsuccess = () => { added++; };
          request.onerror = (event) => {
            if (request.error?.name === "ConstraintError") {
              event.preventDefault();
              event.stopPropagation();
              duplicates++;
            }
          };
        }
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve({ added, duplicates });
      tx.onabort = () => reject(tx.error ?? new Error("Could not save imported activity"));
      tx.onerror = () => { /* onabort reports the error */ };
    });
  } finally { db.close(); }
}

export async function activityCount(): Promise<number> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not read activity storage"));
    });
  } finally { db.close(); }
}
