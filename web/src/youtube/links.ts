export interface YouTubeLink { videoId: string | null; playlistId: string | null; isMix: boolean }
/** Only exact YouTube hostnames and well-formed identifiers are accepted. */
export function parseYouTubeLink(input: string): YouTubeLink | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "https:" || !["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(u.hostname.toLowerCase())) return null;
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    const video = host === "youtu.be" && parts.length === 1 ? parts[0] : host !== "youtu.be" && u.pathname === "/watch" ? u.searchParams.get("v") : ["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : null;
    const list = u.searchParams.get("list");
    const videoId = video && /^[A-Za-z0-9_-]{11}$/.test(video) ? video : null;
    const playlistId = list && /^[A-Za-z0-9_-]{8,200}$/.test(list) ? list : null;
    if (!videoId && !playlistId) return null;
    return { videoId, playlistId, isMix: !!playlistId && playlistId.startsWith("RD") };
  } catch { return null; }
}
