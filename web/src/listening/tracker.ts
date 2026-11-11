import type { Track } from "../lib/types";
import { saveSessions, type ListeningSession } from "./takeoutStore.ts";

/** Only measured media progress during a playing interval counts. Seeks/buffering reset the baseline. */
export class ListeningTracker {
  private current: ListeningSession | null = null;
  private baseline: { position: number; at: number } | null = null;
  private lastSaved = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly save: (sessions: ListeningSession[]) => Promise<void>;
  constructor(save: (sessions: ListeningSession[]) => Promise<void> = saveSessions) { this.save = save; }
  start(track: Track, at = Date.now()) {
    this.flush();
    this.current = { id: crypto.randomUUID(), track: { ...track }, startedAt: new Date(at).toISOString(), listenedSeconds: 0, counted: false };
    this.baseline = null;
    this.lastSaved = at;
  }
  sample(position: number, at = Date.now()) {
    if (!this.current || !Number.isFinite(position)) return;
    if (this.baseline) {
      const elapsed = Math.max(0, (at - this.baseline.at) / 1000);
      const progress = position - this.baseline.position;
      // A large position jump is a seek, not listening; allow small timing jitter.
      if (progress > 0 && progress <= elapsed + 1) this.current.listenedSeconds += Math.min(progress, elapsed);
      const threshold = this.current.track.duration > 0 ? Math.min(30, this.current.track.duration / 2) : 30;
      this.current.counted = this.current.listenedSeconds >= threshold;
    }
    this.baseline = { position, at };
    if (at - this.lastSaved >= 5000) { this.persist(); this.lastSaved = at; }
  }
  pause(position?: number, at = Date.now()) {
    if (position !== undefined) this.sample(position, at);
    this.baseline = null;
    this.persist();
  }
  resetBaseline() { this.baseline = null; }
  flush() { this.pause(); this.current = null; }
  private persist() {
    if (!this.current || this.current.listenedSeconds <= 0) return;
    const copy: ListeningSession = { ...this.current, track: { ...this.current.track } };
    this.writes = this.writes.then(() => this.save([copy])).catch((error) => { console.error("Could not save listening session", error); });
  }
}
