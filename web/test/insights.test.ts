import { test } from "node:test";
import assert from "node:assert/strict";
import { insights } from "../src/listening/insights.ts";
const track = { id: "abcdefghijk", title: "Song", artist: "Artist", duration: 120, thumb: "", art: "", kind: "song" as const };
test("keeps imported activity and measured duration distinct", () => {
  const a = [{ videoId: track.id, title: track.title, artist: track.artist, watchedAt: "2025-01-01T00:00:00.000Z", products: ["YouTube Music"] }, { videoId: "12345678901", title: "Video", artist: null, watchedAt: "2025-01-01T00:00:00.000Z", products: ["YouTube"] }];
  const s = [{ id: "session-123", track, startedAt: "2025-01-02T00:00:00.000Z", listenedSeconds: 45, counted: true }];
  const result = insights(a, s);
  assert.equal(result.imported,2); assert.equal(result.seconds,45); assert.equal(result.plays,1); assert.equal(result.songs.length,1);
  assert.equal(result.songs[0].imported,1); assert.equal(result.songs[0].plays,1);
});
