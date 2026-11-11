import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { insights } from "../listening/insights";
import { allActivities, allSessions } from "../listening/takeoutStore";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../player/player";

export function InsightsSection() {
  const lang = useI18n((s) => s.lang);
  const pt = lang === "pt-BR";
  const [data, setData] = useState<ReturnType<typeof insights> | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    void Promise.all([allActivities(), allSessions()]).then(([a, s]) => setData(insights(a, s))).catch(() => setError(true));
  }, []);
  if (Capacitor.getPlatform() !== "android") return null;
  const makePlaylist = async () => {
    if (!data?.songs.length) return;
    setBusy(true);
    try { await useLibrary.getState().createPlaylist(pt ? "Minhas músicas favoritas" : "My listening mix", data.songs.slice(0, 50).map((s) => s.track)); }
    finally { setBusy(false); }
  };
  return <section className="flex flex-col gap-3">
    <h3 className="text-xs font-medium text-fg-3">{pt ? "Estatísticas de escuta" : "Listening insights"}</h3>
    {error && <p role="alert" className="text-sm text-danger">{pt ? "Não foi possível carregar os dados." : "Could not load listening data."}</p>}
    {data && <div className="flex flex-col gap-3 rounded-[16px] bg-surface-1 p-4 ring-1 ring-line text-sm">
      <p>{pt ? "Tempo no Musike" : "Musike listening time"}: <strong>{(data.seconds / 3600).toFixed(2)} h</strong> · {pt ? "Reproduções" : "Plays"}: <strong>{data.plays}</strong></p>
      <p className="text-fg-2">{pt ? "Atividades do Takeout" : "Takeout activity"}: {data.imported}. {pt ? "O histórico importado pode incluir vídeos e não informa tempo de escuta." : "Imported history may include videos and does not include listening time."}</p>
      <p className="text-xs text-fg-3">{pt ? "Uma reprodução conta após 30 segundos ou metade de uma faixa mais curta." : "A play counts after 30 seconds or half of a shorter track."}</p>
      {data.songs.length > 0 && <><h4 className="font-semibold">{pt ? "Mais ouvidas" : "Top tracks"}</h4><ol className="list-decimal pl-5">{data.songs.slice(0,5).map((s) => <li key={s.track.id}>{s.track.title} {s.track.artist && `— ${s.track.artist}`} <span className="text-fg-3">({s.plays} {pt ? "no Musike" : "Musike"}, {s.imported} Takeout)</span></li>)}</ol>
      <div className="flex gap-2"><button type="button" className="rounded-full bg-accent px-4 py-2 text-accent-ink" onClick={() => usePlayer.getState().playList(data.songs.slice(0,50).map((s) => s.track))}>{pt ? "Tocar mix" : "Play mix"}</button><button type="button" disabled={busy} className="rounded-full bg-surface-3 px-4 py-2" onClick={() => void makePlaylist()}>{pt ? "Salvar mix" : "Save mix"}</button></div></>}
      {data.artists.length > 0 && <p><strong>{pt ? "Artistas" : "Top artists"}:</strong> {data.artists.slice(0,5).map(([name,n]) => `${name} (${n})`).join(", ")}</p>}
      {data.days.length > 0 && <><h4 className="font-semibold">{pt ? "Atividade recente" : "Recent activity"}</h4>{data.days.slice(0,7).map(([date,d]) => <p key={date} className="text-fg-2">{date}: {d.plays} {pt ? "reproduções" : "plays"}, {(d.seconds / 60).toFixed(0)} min · {d.imported} Takeout</p>)}</>}
    </div>}
  </section>;
}
