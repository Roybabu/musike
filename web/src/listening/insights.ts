import type { TakeoutActivity } from "./takeout";
import type { ListeningSession } from "./takeoutStore";
import type { Track } from "../lib/types";

export function insights(activities: TakeoutActivity[], sessions: ListeningSession[]) {
  const songs = new Map<string, { track: Track; imported: number; plays: number; seconds: number }>();
  const artists = new Map<string, number>();
  const days = new Map<string, { imported: number; plays: number; seconds: number }>();
  const day = (date: string) => { const key = date.slice(0, 10); let d = days.get(key); if (!d) { d = { imported: 0, plays: 0, seconds: 0 }; days.set(key, d); } return d; };
  for (const a of activities) {
    // Takeout watch history can contain non-music video; retain it but only use explicitly tagged Music records for recommendations.
    if (!a.products.some((p) => p.toLowerCase().includes("music"))) continue;
    let row = songs.get(a.videoId);
    if (!row) { row = { track: { id: a.videoId, title: a.title, artist: a.artist ?? "", duration: 0, thumb: "", art: "", kind: "song" }, imported: 0, plays: 0, seconds: 0 }; songs.set(a.videoId, row); }
    row.imported++;
    if (a.artist) artists.set(a.artist, (artists.get(a.artist) ?? 0) + 1);
    day(a.watchedAt).imported++;
  }
  for (const s of sessions) {
    let row = songs.get(s.track.id);
    if (!row) { row = { track: s.track, imported: 0, plays: 0, seconds: 0 }; songs.set(s.track.id, row); }
    else if (s.track.duration || s.track.thumb || s.track.art) row.track = s.track;
    row.seconds += s.listenedSeconds;
    if (s.counted) {
      row.plays++;
      if (s.track.artist) artists.set(s.track.artist, (artists.get(s.track.artist) ?? 0) + 1);
      day(s.startedAt).plays++;
    }
    day(s.startedAt).seconds += s.listenedSeconds;
  }
  return { songs: [...songs.values()].sort((a, b) => b.plays + b.imported - a.plays - a.imported || b.seconds - a.seconds), artists: [...artists.entries()].sort((a,b) => b[1]-a[1]), days: [...days.entries()].sort(([a],[b]) => b.localeCompare(a)), seconds: sessions.reduce((sum, s) => sum + s.listenedSeconds, 0), plays: sessions.filter(s => s.counted).length, imported: activities.length };
}
