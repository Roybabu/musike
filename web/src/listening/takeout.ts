/** A Takeout activity is evidence of a watch, not evidence of its duration or completion. */
export interface TakeoutActivity {
  videoId: string;
  title: string;
  artist: string | null;
  watchedAt: string;
  products: string[];
}

export interface TakeoutParseResult {
  activities: TakeoutActivity[];
  skipped: number;
  duplicates: number;
}

/** Parse the JSON watch-history file from Google Takeout. Does not mutate the Musike library. */
export function parseTakeoutHistory(input: unknown): TakeoutParseResult {
  if (!Array.isArray(input)) throw new Error("Expected a Google Takeout watch-history JSON array.");
  const activities: TakeoutActivity[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== "object") { skipped++; continue; }
    const row = raw as Record<string, unknown>;
    if (typeof row.titleUrl !== "string" || typeof row.time !== "string" || typeof row.title !== "string") {
      skipped++; continue;
    }
    let url: URL;
    try { url = new URL(row.titleUrl); } catch { skipped++; continue; }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com", "music.youtube.com", "m.youtube.com"].includes(host) || url.pathname !== "/watch") {
      skipped++; continue;
    }
    const videoId = url.searchParams.get("v");
    const timestamp = Date.parse(row.time);
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !Number.isFinite(timestamp)) { skipped++; continue; }
    const watchedAt = new Date(timestamp).toISOString();
    const key = `${videoId}:${watchedAt}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const subtitles = Array.isArray(row.subtitles) ? row.subtitles : [];
    const subtitle = subtitles.find((s: unknown) => s && typeof s === "object" && typeof (s as Record<string, unknown>).name === "string") as { name: string } | undefined;
    activities.push({
      videoId,
      title: row.title.replace(/^(Watched|Listened to)\s+/i, "").slice(0, 300),
      artist: subtitle?.name.slice(0, 300) || null,
      watchedAt,
      products: Array.isArray(row.products) ? row.products.filter((p): p is string => typeof p === "string").slice(0, 20) : [],
    });
  }
  return { activities, skipped, duplicates };
}
