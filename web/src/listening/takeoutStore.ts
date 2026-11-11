import type { TakeoutActivity } from "./takeout";

// An independent database keeps imports away from the existing library and its backup format.
const DATABASE = "musike-takeout-activity";
const STORE = "activities";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: ["videoId", "watchedAt"] });
      if (!request.result.objectStoreNames.contains("sessions")) request.result.createObjectStore("sessions", { keyPath: "id" });
    };
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

export interface ListeningSession {
  id: string;
  track: { id: string; title: string; artist: string; duration: number; thumb: string; art: string; kind: "song" | "video" };
  startedAt: string;
  listenedSeconds: number;
  counted: boolean;
}

async function readAll<T>(store: string): Promise<T[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(store, "readonly").objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error ?? new Error("Could not read listening data"));
    });
  } finally { db.close(); }
}
export const allActivities = () => readAll<TakeoutActivity>(STORE);
export const allSessions = () => readAll<ListeningSession>("sessions");

export async function saveSessions(sessions: ListeningSession[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      try {
        const store = tx.objectStore("sessions");
        for (const session of sessions) {
          const existing = store.get(session.id);
          existing.onsuccess = () => {
            const old = existing.result as ListeningSession | undefined;
            if (!old || session.listenedSeconds > old.listenedSeconds) store.put(session);
          };
        }
      }
      catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Could not save listening data"));
    });
  } finally { db.close(); }
}

/** Validate portable listening data before merging an untrusted backup. */
export async function restoreListeningData(input: unknown): Promise<void> {
  if (!input || typeof input !== "object") throw new Error("Invalid listening backup");
  const data = input as Record<string, unknown>;
  if (!Array.isArray(data.activities) || !Array.isArray(data.sessions)) throw new Error("Invalid listening backup");
  const activities: TakeoutActivity[] = data.activities.map((v: unknown) => {
    if (!v || typeof v !== "object") throw new Error("Invalid listening activity");
    const a = v as Record<string, unknown>;
    if (typeof a.videoId !== "string" || !/^[\w-]{11}$/.test(a.videoId) || typeof a.title !== "string" || typeof a.watchedAt !== "string" || !Number.isFinite(Date.parse(a.watchedAt)) || !(a.artist === null || typeof a.artist === "string") || !Array.isArray(a.products) || !a.products.every((p: unknown) => typeof p === "string")) throw new Error("Invalid listening activity");
    return { videoId: a.videoId, title: a.title.slice(0, 300), watchedAt: new Date(a.watchedAt).toISOString(), artist: typeof a.artist === "string" ? a.artist.slice(0, 300) : null, products: (a.products as string[]).slice(0, 20) };
  });
  const sessions: ListeningSession[] = data.sessions.map((v: unknown) => {
    if (!v || typeof v !== "object") throw new Error("Invalid listening session");
    const s = v as ListeningSession;
    if (typeof s.id !== "string" || !/^[\w-]{8,64}$/.test(s.id) || typeof s.startedAt !== "string" || !Number.isFinite(Date.parse(s.startedAt)) || typeof s.listenedSeconds !== "number" || !Number.isFinite(s.listenedSeconds) || s.listenedSeconds < 0 || typeof s.counted !== "boolean" || !s.track || typeof s.track.id !== "string" || !/^[\w-]{11}$/.test(s.track.id) || typeof s.track.title !== "string" || typeof s.track.artist !== "string" || typeof s.track.duration !== "number" || !Number.isFinite(s.track.duration)) throw new Error("Invalid listening session");
    return { id: s.id, startedAt: new Date(s.startedAt).toISOString(), listenedSeconds: s.listenedSeconds, counted: s.counted, track: { id: s.track.id, title: s.track.title.slice(0, 300), artist: s.track.artist.slice(0, 300), duration: Math.max(0, s.track.duration), thumb: typeof s.track.thumb === "string" && /^https:\/\//.test(s.track.thumb) ? s.track.thumb.slice(0, 500) : "", art: typeof s.track.art === "string" && /^https:\/\//.test(s.track.art) ? s.track.art.slice(0, 500) : "", kind: s.track.kind === "video" ? "video" : "song" } };
  });
  // Listening records always merge; replacing a library must not silently erase separate listening data.
  await importActivities(activities);
  await saveSessions(sessions);
}
