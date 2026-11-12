import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { readTakeoutZip, parseMusicLibrary } from "../src/listening/takeoutZip.ts";

const csv = 'Video ID,Song Title,Album Title,Artist Name 1\r\nabcdefghijk,"Song, the ""one""",Album,Artist\r\nabcdefghijk,Duplicate,,Artist\r\n';
test("imports targeted JSON and CSV entries while ignoring unrelated data", async () => {
  const history = [{ title: "Watched Song", titleUrl: "https://music.youtube.com/watch?v=abcdefghijk", time: "2025-01-01T00:00:00Z", products: ["YouTube Music"] }];
  const zip = zipSync({ "Takeout/YouTube and YouTube Music/history/watch-history.json": strToU8(JSON.stringify(history)), "Takeout/YouTube and YouTube Music/music (library and uploads)/music library songs.csv": strToU8(csv), "unrelated.txt": strToU8("private content") });
  const result = await readTakeoutZip(new Blob([zip]));
  assert.equal(result.activities.length, 1); assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].title, 'Song, the "one"');
  assert.equal(result.historyFound, true); assert.equal(result.libraryFound, true);
});
test("handles a ZIP with songs but no history honestly", async () => {
  const zip = zipSync({ "music library songs.csv": strToU8(csv), "search-history.html": strToU8("searches") });
  const r = await readTakeoutZip(new Blob([zip])); assert.equal(r.historyFound, false); assert.equal(r.tracks.length, 1); assert.equal(r.activities.length, 0);
});
test("rejects malformed and oversized metadata without extracting", async () => {
  await assert.rejects(readTakeoutZip(new Blob(["not a zip"])));
  const zip = zipSync({ "watch-history.json": strToU8("[]") });
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength); let at = 0;
  for (; at < zip.length - 4; at++) if (view.getUint32(at, true) === 0x02014b50) break;
  view.setUint32(at + 24, 200 * 1024 * 1024, true);
  await assert.rejects(readTakeoutZip(new Blob([zip])), /too large/);
});
test("rejects unterminated quoted CSV", () => { assert.throws(() => parseMusicLibrary('Video ID,Song Title\naaaaaaaaaaa,"broken')); });
