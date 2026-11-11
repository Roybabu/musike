import { Capacitor } from "@capacitor/core";
import { useI18n } from "../i18n";
import { useYouTube } from "../youtube/sync";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../player/player";

export function YouTubeSection() {
  const s = useYouTube();
  const pt = useI18n((x) => x.lang) === "pt-BR";
  if (Capacitor.getPlatform() !== "android") return null;
  const button = "rounded-full bg-surface-3 px-4 py-2 text-sm disabled:opacity-50";
  return <section className="flex flex-col gap-3">
    <h3 className="text-xs font-medium text-fg-3">YouTube</h3>
    <p className="text-sm text-fg-2">{pt ? "Conecte sua conta para ver suas playlists do YouTube. O acesso é opcional." : "Connect your account to see your YouTube playlists. Connecting is optional."}</p>
    <div className="flex flex-wrap gap-2">
      {!s.connected ? <button className={button} disabled={s.busy} onClick={() => void s.connect()}>{pt ? "Conectar Google" : "Connect Google"}</button> : <>
        <button className={button} disabled={s.busy} onClick={() => void s.sync()}>{s.busy ? (pt ? "Sincronizando…" : "Syncing…") : (pt ? "Sincronizar agora" : "Sync Now")}</button>
        {s.error && <button className={button} disabled={s.busy} onClick={() => void s.connect()}>{pt ? "Reconectar" : "Reconnect"}</button>}
        <button className={button} disabled={s.busy} onClick={() => void s.disconnect()}>{pt ? "Desconectar" : "Disconnect"}</button>
      </>}
    </div>
    {s.error && <><p role="alert" className="text-sm text-danger">{s.error}</p>{s.connected && <div className="text-xs text-fg-2"><button className={button} onClick={() => void s.forget()}>{pt ? "Remover deste dispositivo" : "Remove from this device"}</button><p>{pt ? "Se a revogação falhar, remova também o acesso nas permissões da Conta Google." : "If revocation fails, also remove access in your Google Account permissions."}</p></div>}</>}
    {s.connected && s.lastSync && <p className="text-xs text-fg-3">{pt ? "Última sincronização" : "Last sync"}: {new Date(s.lastSync).toLocaleString()}</p>}
    {s.connected && s.lastSync && s.playlists.length === 0 && <p className="text-sm text-fg-2">{pt ? "Nenhuma playlist encontrada." : "No playlists found."}</p>}
    {s.playlists.map((p) => <div key={p.id} className="rounded-[12px] bg-surface-1 p-3 ring-1 ring-line">
      <p className="text-sm font-medium">{p.name}</p><p className="text-xs text-fg-3">YouTube · {p.tracks.length} {pt ? "faixas" : "tracks"}</p>
      <div className="mt-2 flex gap-2"><button className={button} disabled={!p.tracks.length} onClick={() => usePlayer.getState().playList(p.tracks)}>{pt ? "Tocar" : "Play"}</button><button className={button} disabled={!p.tracks.length} onClick={() => void useLibrary.getState().createPlaylist(p.name, p.tracks)}>{pt ? "Salvar cópia" : "Save copy"}</button></div>
    </div>)}
  </section>;
}
