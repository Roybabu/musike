import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { parseTakeoutHistory } from "../listening/takeout";
import { readTakeoutZip } from "../listening/takeoutZip";
import { activityCount, allSavedSongs, importTakeoutBundle } from "../listening/takeoutStore";
import type { Track } from "../lib/types";
import { usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";

const MAX_JSON = 100 * 1024 * 1024;

/** Imported songs and activity are kept separate from the existing library. */
export function TakeoutSection() {
  const lang = useI18n((s) => s.lang);
  const input = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [songs, setSongs] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pt = lang === "pt-BR";
  useEffect(() => {
    if (Capacitor.getPlatform() === "android") void Promise.all([activityCount(), allSavedSongs()]).then(([n, s]) => { setCount(n); setSongs(s); }).catch(() => setMessage(pt ? "Não foi possível abrir o armazenamento." : "Could not open activity storage."));
  }, [pt]);
  if (Capacitor.getPlatform() !== "android") return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const zip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
      let activities, tracks: Track[] = [], parsedDuplicates = 0, skipped = 0, noHistory = false;
      if (zip) {
        const result = await readTakeoutZip(file);
        activities = result.activities; tracks = result.tracks; parsedDuplicates = result.duplicates; skipped = result.skipped; noHistory = !result.historyFound;
        if (!result.historyFound && !result.libraryFound) throw new Error(result.htmlHistoryFound ? "This ZIP has HTML watch history, which is not supported yet. Export history as JSON." : "No watch-history JSON or YouTube Music library CSV found. Check other Takeout ZIP parts.");
      } else {
        if (file.size > MAX_JSON) throw new Error("The JSON file must be 100 MB or smaller.");
        const result = parseTakeoutHistory(JSON.parse(await file.text()) as unknown);
        activities = result.activities; parsedDuplicates = result.duplicates; skipped = result.skipped;
        if (!activities.length) throw new Error("No valid watch activity was found in this file.");
      }
      const result = await importTakeoutBundle(activities, tracks);
      const [n, stored] = await Promise.all([activityCount(), allSavedSongs()]); setCount(n); setSongs(stored);
      const duplicates = result.duplicates + parsedDuplicates;
      setMessage(pt
        ? `${result.activitiesAdded} atividades e ${result.songsAdded} músicas salvas importadas; ${duplicates} duplicadas; ${skipped} ignoradas.${noHistory ? " Nenhum histórico de exibição JSON foi encontrado neste ZIP." : ""}`
        : `${result.activitiesAdded} watch activities and ${result.songsAdded} saved songs imported; ${duplicates} duplicates; ${skipped} skipped.${noHistory ? " No watch-history JSON was found in this ZIP." : ""}`);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? (pt ? "Não foi possível ler o JSON." : "Could not read the JSON file.") : (error as Error).message);
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const action = "rounded-full bg-surface-1 px-4 py-2 text-sm font-medium ring-1 ring-line disabled:opacity-50";
  return <section className="flex flex-col gap-3">
    <h3 className="text-xs font-medium text-fg-3">{pt ? "Dados do Google Takeout" : "Google Takeout data"}</h3>
    <p className="text-sm text-fg-2">{pt ? "Escolha um ZIP do Takeout ou um JSON de histórico de exibição. Músicas salvas não são contadas como reproduções. O histórico pode incluir vídeos; a duração ou conclusão é desconhecida." : "Choose a Takeout ZIP or watch-history JSON. Saved songs are not counted as plays. History may include videos; listening duration and completion are unknown."}</p>
    <p className="text-xs text-fg-3">{pt ? "Os dados ficam neste dispositivo e são incluídos nos backups do Musike." : "Data stays on this device and is included in Musike backups."}</p>
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className={action}>{busy ? (pt ? "Importando…" : "Importing…") : (pt ? "Importar ZIP ou JSON" : "Import ZIP or JSON")}</button>
    <input ref={input} type="file" accept=".zip,application/zip,application/x-zip-compressed,.json,application/json" className="hidden" aria-label={pt ? "Selecionar ZIP ou JSON" : "Choose ZIP or JSON"} onChange={(event) => void pick(event.target.files?.[0])} />
    {count !== null && <p className="text-xs text-fg-2">{pt ? `${count} atividades e ${songs.length} músicas salvas` : `${count} watch activities and ${songs.length} saved songs`}</p>}
    {songs.length > 0 && <div className="flex flex-col gap-2 rounded-[12px] bg-surface-1 p-3 ring-1 ring-line"><p className="text-sm font-medium">{pt ? "Biblioteca do YouTube Music" : "YouTube Music library"}</p><p className="text-xs text-fg-2">{songs.slice(0, 3).map(s => s.title).join(" · ")}{songs.length > 3 ? " …" : ""}</p><div className="flex gap-2"><button className={action} type="button" onClick={() => usePlayer.getState().playList(songs)}>{pt ? "Tocar" : "Play"}</button><button className={action} type="button" onClick={() => void useLibrary.getState().createPlaylist("YouTube Music library (Takeout)", songs)}>{pt ? "Salvar playlist" : "Save playlist"}</button></div>{songs.length > 500 && <p className="text-xs text-fg-3">{pt ? "A cópia salva contém as primeiras 500 faixas." : "The saved copy contains the first 500 tracks."}</p>}</div>}
    {message && <p role="status" className="text-sm text-fg-2">{message}</p>}
  </section>;
}
