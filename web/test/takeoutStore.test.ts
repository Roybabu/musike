import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityCount, importActivities } from "../src/listening/takeoutStore.ts";

const first = { videoId: "abcdefghijk", title: "A song", artist: null, watchedAt: "2024-01-01T00:00:00.000Z", products: [] };
const second = { ...first, watchedAt: "2024-01-02T00:00:00.000Z" };

test("imports separately, persists, and skips duplicates across imports", async () => {
  assert.deepEqual(await importActivities([first, second]), { added: 2, duplicates: 0 });
  assert.equal(await activityCount(), 2);
  assert.deepEqual(await importActivities([first, second]), { added: 0, duplicates: 2 });
  assert.equal(await activityCount(), 2);
});

test("aborts the entire transaction if a record has an invalid key", async () => {
  const fresh = { ...first, videoId: "12345678901" };
  await assert.rejects(importActivities([fresh, { ...first, videoId: undefined } as never]));
  assert.equal(await activityCount(), 2);
});

test("restores a backup without losing a newer session", async () => {
  const { saveSessions, allSessions, restoreListeningData } = await import("../src/listening/takeoutStore.ts");
  const track = { id: "abcdefghijk", title: "Song", artist: "Artist", duration: 120, thumb: "", art: "", kind: "song" as const };
  const session = { id: "session-123", track, startedAt: "2024-01-01T00:00:00.000Z", listenedSeconds: 60, counted: true };
  await saveSessions([session]);
  await restoreListeningData({ activities: [first], sessions: [{ ...session, listenedSeconds: 10, counted: false }] });
  assert.equal((await allSessions())[0].listenedSeconds, 60);
  assert.equal(await activityCount(), 2);
  await assert.rejects(restoreListeningData({ activities: [{ ...first, videoId: "invalid" }], sessions: [] }));
});

test("imports saved songs separately and deduplicates on repeated imports", async () => {
  const { importTakeoutBundle, allSavedSongs, restoreListeningData } = await import("../src/listening/takeoutStore.ts");
  const song = { id: "abcdefghijk", title: "Song", artist: "Artist", duration: 0, thumb: "", art: "", kind: "song" as const };
  const before = await activityCount();
  assert.deepEqual(await importTakeoutBundle([], [song]), { activitiesAdded: 0, songsAdded: 1, duplicates: 0 });
  assert.deepEqual(await importTakeoutBundle([], [song]), { activitiesAdded: 0, songsAdded: 0, duplicates: 1 });
  assert.equal(await activityCount(), before);
  await restoreListeningData({ activities: [], sessions: [], savedSongs: [song] });
  assert.equal((await allSavedSongs()).length, 1);
});

test("a failure in a bundled import rolls back activity and songs", async () => {
  const { importTakeoutBundle, allSavedSongs } = await import("../src/listening/takeoutStore.ts");
  const beforeActivities = await activityCount(); const beforeSongs = (await allSavedSongs()).length;
  const fresh = { ...first, videoId: "zzzzzzzzzzz" };
  await assert.rejects(importTakeoutBundle([fresh], [{ id: undefined } as never]));
  assert.equal(await activityCount(), beforeActivities); assert.equal((await allSavedSongs()).length, beforeSongs);
});
