import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeLink } from "../src/youtube/links.ts";

test("parses YouTube Music mixes with the selected track", () => {
  assert.deepEqual(parseYouTubeLink("https://music.youtube.com/watch?v=abcdefghijk&list=RDAMVMabcdefghijk"), { videoId: "abcdefghijk", playlistId: "RDAMVMabcdefghijk", isMix: true });
});
test("supports playlists, shortened links and individual tracks", () => {
  assert.equal(parseYouTubeLink("https://www.youtube.com/playlist?list=PL123456789")?.playlistId, "PL123456789");
  assert.equal(parseYouTubeLink("https://youtu.be/abcdefghijk?t=2")?.videoId, "abcdefghijk");
  assert.equal(parseYouTubeLink("https://youtube.com/shorts/abcdefghijk")?.videoId, "abcdefghijk");
});
test("rejects lookalike hosts, invalid ids and non-HTTPS URLs", () => {
  for (const value of ["https://youtube.com.attacker.example/watch?v=abcdefghijk", "http://youtube.com/watch?v=abcdefghijk", "https://youtube.com/watch?v=abcdefghijk-extra", "https://youtu.be/abcdefghijk/other?list=bad!"]) {
    assert.equal(parseYouTubeLink(value), null);
  }
});
