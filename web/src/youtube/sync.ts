import { Capacitor, registerPlugin } from "@capacitor/core";
import { create } from "zustand";
import type { Track } from "../lib/types";

export interface YouTubePlaylist { id: string; name: string; tracks: Track[] }
export interface NativeYouTube {
  status(): Promise<{ connected: boolean }>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  forget(): Promise<void>;
  sync(): Promise<{ playlists: YouTubePlaylist[] }>;
}
const native = registerPlugin<NativeYouTube>("MusikeYouTube");
interface SyncState {
  connected: boolean; busy: boolean; error: string | null; lastSync: number | null; playlists: YouTubePlaylist[];
  initialize(): Promise<void>; connect(): Promise<void>; disconnect(): Promise<void>; forget(): Promise<void>; sync(): Promise<void>;
}
export function createYouTubeStore(client: NativeYouTube, isAndroid: () => boolean) {
let generation = 0;
let pending: Promise<void> | null = null;
return create<SyncState>((set, get) => ({
  connected: false, busy: false, error: null, lastSync: null, playlists: [],
  initialize: async () => {
    if (!isAndroid()) return;
    try {
      const { connected } = await client.status();
      set({ connected });
      if (connected) await get().sync();
    } catch { set({ error: "Google account service is unavailable." }); }
  },
  connect: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try { await client.connect(); set({ connected: true, busy: false, playlists: [], lastSync: null }); await get().sync(); }
    catch (e) { set({ error: (e as Error).message || "Google connection failed.", busy: false }); }
  },
  disconnect: async () => {
    if (get().busy) return;
    generation++;
    set({ busy: true, error: null });
    try { await client.disconnect(); set({ connected: false, playlists: [], lastSync: null, busy: false }); }
    catch (e) { set({ error: (e as Error).message || "Could not disconnect Google.", busy: false }); }
  },
  forget: async () => {
    if (get().busy) return;
    try { await client.forget(); generation++; set({ connected: false, playlists: [], lastSync: null, error: null }); }
    catch (e) { set({ error: (e as Error).message || "Could not remove account from this device." }); }
  },
  sync: async () => {
    if (!get().connected) return;
    if (pending) return pending;
    const own = generation;
    set({ busy: true, error: null });
    pending = (async () => {
      try {
        const result = await client.sync();
        if (own === generation) set({ playlists: result.playlists, lastSync: Date.now() });
      } catch (e) { if (own === generation) set({ error: (e as Error).message || "Playlist sync failed." }); }
      finally { if (own === generation) set({ busy: false }); pending = null; }
    })();
    return pending;
  },
}));
}
export const useYouTube = createYouTubeStore(native, () => Capacitor.getPlatform() === "android");

/** While the app is active, retry on return/online and at most hourly. */
export function startYouTubeSync() {
  if (Capacitor.getPlatform() !== "android") return () => {};
  void useYouTube.getState().initialize();
  const refresh = () => {
    const s = useYouTube.getState();
    if (document.visibilityState === "visible" && s.connected && (!s.lastSync || Date.now() - s.lastSync >= 60 * 60_000)) void s.sync();
  };
  const timer = setInterval(refresh, 60_000);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", refresh);
  return () => { clearInterval(timer); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
}
