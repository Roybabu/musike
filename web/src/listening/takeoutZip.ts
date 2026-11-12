import { Inflate } from "fflate";
import { parseTakeoutHistory, type TakeoutActivity } from "./takeout.ts";
import type { Track } from "../lib/types";

const MAX_HISTORY = 100 * 1024 * 1024;
const MAX_LIBRARY = 10 * 1024 * 1024;
const MAX_DIRECTORY = 16 * 1024 * 1024;
const CHUNK = 64 * 1024;
const decoder = new TextDecoder();
type Entry = { path: string; method: number; flags: number; compressed: number; size: number; offset: number; kind: "history" | "library" };
export type TakeoutZipResult = { activities: TakeoutActivity[]; tracks: Track[]; historyFound: boolean; libraryFound: boolean; htmlHistoryFound: boolean; duplicates: number; skipped: number };

/** Read only targeted entries by their central directory offsets; never extract unrelated files. */
export async function readTakeoutZip(blob: Blob): Promise<TakeoutZipResult> {
  if (blob.size < 22 || blob.size > 0xffffffff) throw new Error("ZIP is empty or too large (maximum 4 GB).");
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  const t = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let e = tail.length - 22;
  while (e >= 0 && !(t.getUint32(e, true) === 0x06054b50 && e + 22 + t.getUint16(e + 20, true) === tail.length)) e--;
  if (e < 0) throw new Error("This is not a complete ZIP archive.");
  const disk = t.getUint16(e + 4, true), dirDisk = t.getUint16(e + 6, true);
  const entries = t.getUint16(e + 10, true), size = t.getUint32(e + 12, true), offset = t.getUint32(e + 16, true);
  if (disk || dirDisk || entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new Error("Split or ZIP64 archives are not supported; select a smaller Takeout ZIP.");
  if (size > MAX_DIRECTORY || offset + size > tailStart + e) throw new Error("Invalid ZIP directory.");
  const buf = new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer());
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0; const selected: Entry[] = []; let htmlHistoryFound = false;
  for (let i = 0; i < entries; i++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), compressed = v.getUint32(p + 20, true), original = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const end = p + 46 + nl + el + cl; if (end > buf.length) throw new Error("Invalid ZIP directory.");
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nl)).replace(/\\/g, "/");
    const lower = name.toLowerCase();
    if (/(^|\/)watch-history\.html$/.test(lower)) htmlHistoryFound = true;
    const kind = /(^|\/)watch-history\.json$/.test(lower) ? "history" : /(^|\/)music library songs\.csv$/.test(lower) ? "library" : null;
    if (kind) {
      if (name.split('/').includes('..') || flags & 1 || ![0, 8].includes(method) || [compressed, original, local].includes(0xffffffff)) throw new Error("Unsupported or unsafe ZIP entry.");
      if (original > (kind === "history" ? MAX_HISTORY : MAX_LIBRARY)) throw new Error("Takeout history or library file is too large.");
      selected.push({ path: name, method, flags, compressed, size: original, offset: local, kind });
      if (selected.length > 20) throw new Error("Too many matching files in ZIP.");
    }
    p = end;
  }
  const result: TakeoutZipResult = { activities: [], tracks: [], historyFound: false, libraryFound: false, htmlHistoryFound, duplicates: 0, skipped: 0 };
  let outputTotal = 0;
  for (const entry of selected) {
    if (entry.offset + 30 > offset) throw new Error("Invalid ZIP entry.");
    const h = new DataView(await blob.slice(entry.offset, entry.offset + 30).arrayBuffer());
    if (h.getUint32(0, true) !== 0x04034b50 || h.getUint16(8, true) !== entry.method || (h.getUint16(6, true) & 1)) throw new Error("Invalid ZIP entry.");
    const start = entry.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    if (start + entry.compressed > offset) throw new Error("Truncated ZIP entry.");
    const chunks: Uint8Array[] = []; let produced = 0;
    const emit = (chunk: Uint8Array) => { produced += chunk.length; outputTotal += chunk.length; if (produced > entry.size || outputTotal > MAX_HISTORY + MAX_LIBRARY) throw new Error("Decompressed Takeout data is too large."); chunks.push(chunk); };
    const inflate = entry.method === 8 ? new Inflate((chunk) => emit(chunk)) : null;
    for (let n = 0; n < entry.compressed; n += CHUNK) {
      const bytes = new Uint8Array(await blob.slice(start + n, start + Math.min(n + CHUNK, entry.compressed)).arrayBuffer());
      if (inflate) inflate.push(bytes, n + CHUNK >= entry.compressed); else emit(bytes);
    }
    if (produced !== entry.size) throw new Error("Truncated ZIP entry.");
    const bytes = new Uint8Array(produced); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const text = decoder.decode(bytes);
    if (entry.kind === "history") {
      result.historyFound = true;
      const parsed = parseTakeoutHistory(JSON.parse(text) as unknown);
      result.activities.push(...parsed.activities); result.skipped += parsed.skipped; result.duplicates += parsed.duplicates;
    } else {
      result.libraryFound = true; result.tracks.push(...parseMusicLibrary(text));
    }
  }
  return result;
}

/** CSV quoting permits commas, newlines, and doubled quotes inside fields. */
export function parseMusicLibrary(text: string): Track[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (quoted) throw new Error("Invalid music library CSV.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift()?.map((s) => s.trim().toLowerCase()) ?? [];
  const id = headers.indexOf("video id"), title = headers.indexOf("song title"), artist = headers.indexOf("artist name 1"), album = headers.indexOf("album title");
  if (id < 0 || title < 0) throw new Error("Unsupported music library CSV.");
  const seen = new Set<string>(); const tracks: Track[] = [];
  for (const values of rows) {
    const video = (values[id] ?? "").trim(); if (!/^[\w-]{11}$/.test(video) || seen.has(video)) continue;
    seen.add(video); tracks.push({ id: video, title: (values[title] || "Untitled").slice(0, 300), artist: (values[artist] || "").slice(0, 300), album: (values[album] || "").slice(0, 300) || undefined, duration: 0, thumb: "", art: "", kind: "song" });
  }
  return tracks;
}
