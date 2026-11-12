import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { useYouTube, type YouTubePlaylist } from "../youtube/sync";
import { TrackList } from "./TrackList";

const Plugin = registerPlugin<{ loadPlaylist(options: { id: string }): Promise<{ playlist: YouTubePlaylist }> }>("MusikeYouTube");

/** Loads the actual playlist requested, never substitutes an unrelated recommendation mix. */
export function SharedYouTubePlaylist({ id, isMix }: { id: string; isMix: boolean }) {
  const connected = useYouTube((s) => s.connected);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const lang = useI18n((s) => s.lang); const pt = lang === "pt-BR";
  const [playlist, setPlaylist] = useState<YouTubePlaylist | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setPlaylist(null);
    if (!connected || Capacitor.getPlatform() !== "android") { setState("idle"); return; }
    setState("loading");
    void Plugin.loadPlaylist({ id }).then(({ playlist: value }) => {
      if (!active) return;
      setPlaylist(value); setState("done");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [id, connected, retry]);
  if (Capacitor.getPlatform() !== "android") return null;
  const button = "rounded-full bg-surface-3 px-4 py-2 text-sm disabled:opacity-50";
  return <section className="mt-3 rounded-[16px] bg-surface-2 p-4 ring-1 ring-line" aria-live="polite">
    <h2 className="font-semibold">{isMix ? (pt ? "Mix do YouTube" : "YouTube Mix") : (pt ? "Playlist do YouTube" : "YouTube playlist")}</h2>
    {!connected && <p className="mt-2 text-sm text-fg-2">{pt ? "Conecte o Google nas configurações para abrir esta lista." : "Connect Google in Settings to open this list."} <button type="button" className="underline" onClick={() => setSettingsOpen(true)}>{pt ? "Abrir configurações" : "Open Settings"}</button></p>}
    {state === "loading" && <p className="mt-2 text-sm text-fg-2">{pt ? "Carregando faixas…" : "Loading tracks…"}</p>}
    {state === "error" && <div className="mt-2 text-sm text-fg-2"><p>{isMix ? (pt ? "Não foi possível abrir este mix. Alguns mixes personalizados não são acessíveis pela API do YouTube." : "Could not open this mix. Some personalized mixes are not accessible through the YouTube API.") : (pt ? "Não foi possível abrir esta playlist. Verifique o link, acesso à conta e conexão." : "Could not open this playlist. Check the link, account access, and connection.")}</p><button className={button} type="button" onClick={() => setRetry(n => n + 1)}>{pt ? "Tentar novamente" : "Try again"}</button></div>}
    {state === "done" && playlist && <><p className="mt-2 text-xs text-fg-2">{playlist.tracks.length} {pt ? "faixas disponíveis" : "available tracks"}</p>
      {playlist.tracks.length === 0 && <p className="mt-2 text-sm text-fg-2">{isMix ? (pt ? "O YouTube não retornou faixas para este mix." : "YouTube returned no tracks for this mix.") : (pt ? "O YouTube não retornou faixas para esta playlist." : "YouTube returned no tracks for this playlist.")}</p>}
      {playlist.tracks.length > 0 && <><div className="my-3 flex flex-wrap gap-2"><button className={button} type="button" onClick={() => usePlayer.getState().playList(playlist.tracks)}>{pt ? "Tocar tudo" : "Play all"}</button><button className={button} type="button" onClick={() => void useLibrary.getState().createPlaylist(isMix ? "YouTube Mix" : "YouTube playlist", playlist.tracks)}>{pt ? "Salvar cópia" : "Save copy"}</button></div>{playlist.tracks.length > 500 && <p className="text-xs text-fg-3">{pt ? "A cópia salva contém as primeiras 500 faixas." : "The saved copy contains the first 500 tracks."}</p>}<TrackList tracks={playlist.tracks} showAlbum={false} /></>}
    </>}
  </section>;
}
