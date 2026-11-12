import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTakeoutHistory } from "../src/listening/takeout.ts";

const item = { title: "Watched A song", titleUrl: "https://music.youtube.com/watch?v=abcdefghijk", time: "2024-01-02T03:04:05Z", subtitles: [{ name: "An artist" }], products: ["YouTube Music"] };

test("parses Takeout activity without inventing a listening duration", () => {
  const { activities } = parseTakeoutHistory([item]);
  assert.deepEqual(activities, [{ videoId: "abcdefghijk", title: "A song", artist: "An artist", watchedAt: "2024-01-02T03:04:05.000Z", products: ["YouTube Music"] }]);
});

test("deduplicates the same timestamp and video while preserving separate plays", () => {
  const result = parseTakeoutHistory([item, item, { ...item, time: "2024-01-02T03:05:05Z" }]);
  assert.equal(result.activities.length, 2);
  assert.equal(result.duplicates, 1);
});

test("skips malformed, non-watch and hostile URLs", () => {
  const result = parseTakeoutHistory([null, {}, { ...item, titleUrl: "https://youtube.com.evil.test/watch?v=abcdefghijk" }, { ...item, titleUrl: "https://youtube.com/playlist?v=abcdefghijk" }, { ...item, time: "invalid" }]);
  assert.equal(result.skipped, 5);
  assert.equal(result.activities.length, 0);
});

test("rejects a different JSON format", () => {
  assert.throws(() => parseTakeoutHistory({}), /watch-history JSON array/);
});
