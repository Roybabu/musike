import { test } from "node:test";
import assert from "node:assert/strict";
import { ListeningTracker } from "../src/listening/tracker.ts";
const track = { id: "abcdefghijk", title: "Song", artist: "Artist", duration: 120, thumb: "", art: "", kind: "song" as const };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("counts measured progress but not pauses or seeks", async () => {
  const saved: any[] = [];
  const t = new ListeningTracker(async (sessions) => { saved.push(sessions[0]); });
  t.start(track, 0); t.sample(0, 0); t.sample(10, 10_000); t.pause(10, 10_000);
  t.sample(10, 90_000); t.sample(20, 100_000); t.resetBaseline(); t.sample(100, 101_000); t.sample(110, 111_000); t.pause(110, 111_000);
  await tick();
  assert.equal(saved.at(-1).listenedSeconds, 30);
  assert.equal(saved.at(-1).counted, true);
});

test("new sessions for repeats and no count for a short skip", async () => {
  const saved: any[] = [];
  const t = new ListeningTracker(async (sessions) => { saved.push(sessions[0]); });
  t.start(track, 0); t.sample(0,0); t.sample(5,5000); t.start(track,6000); t.sample(0,6000); t.sample(5,11000); t.flush();
  await tick();
  assert.equal(new Set(saved.map((s) => s.id)).size, 2); assert.equal(saved[0].counted, false);
});
