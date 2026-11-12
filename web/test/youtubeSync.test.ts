import { test } from "node:test";
import assert from "node:assert/strict";
import { createYouTubeStore, type NativeYouTube } from "../src/youtube/sync.ts";

function mock(): NativeYouTube & { calls: number; fail: boolean } {
  return { calls: 0, fail: false, status: async () => ({ connected: true }), connect: async () => {}, disconnect: async () => {}, forget: async () => {}, async sync() { this.calls++; if (this.fail) throw new Error("offline"); return { playlists: [{ id: "yt", name: "Remote", tracks: [] }] }; } };
}
test("startup and manual sync retain data on errors and clear it on disconnect", async () => {
  const client = mock(); const store = createYouTubeStore(client, () => true);
  await store.getState().initialize();
  assert.equal(client.calls, 1); assert.equal(store.getState().playlists[0].name, "Remote");
  client.fail = true; await store.getState().sync();
  assert.equal(store.getState().error, "offline"); assert.equal(store.getState().playlists.length, 1);
  await store.getState().disconnect(); assert.equal(store.getState().connected, false); assert.equal(store.getState().playlists.length, 0);
});
test("manual syncs in flight are coalesced", async () => {
  let finish!: (x: {playlists: []}) => void;
  const client = mock(); client.sync = () => { client.calls++; return new Promise((r) => { finish = r; }); };
  const store = createYouTubeStore(client, () => true); store.setState({connected: true});
  const a = store.getState().sync(); const b = store.getState().sync();
  assert.equal(client.calls, 1); finish({playlists: []}); await Promise.all([a,b]);
});

test("failed authorization leaves account disconnected and local sync empty", async () => {
  const client = mock(); client.connect = async () => { throw new Error("cancelled"); };
  const store = createYouTubeStore(client, () => true);
  await store.getState().connect();
  assert.equal(store.getState().connected, false); assert.equal(store.getState().error, "cancelled"); assert.equal(client.calls, 0);
});

test("removing from device clears synced data after revocation failure", async () => {
  const client = mock(); client.disconnect = async () => { throw new Error("offline"); };
  const store = createYouTubeStore(client, () => true); await store.getState().initialize();
  await store.getState().disconnect(); assert.equal(store.getState().connected, true);
  await store.getState().forget(); assert.equal(store.getState().connected, false); assert.equal(store.getState().playlists.length, 0);
});
