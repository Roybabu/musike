import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { parseTakeoutHistory } from "../listening/takeout";
import { activityCount, importActivities } from "../listening/takeoutStore";

const MAX_BYTES = 100 * 1024 * 1024;

/** Optional import is kept separate from the existing music library. */
export function TakeoutSection() {
  const lang = useI18n((s) => s.lang);
  const input = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pt = lang === "pt-BR";
  useEffect(() => {
    if (Capacitor.getPlatform() === "android") void activityCount().then(setCount).catch(() => setMessage(pt ? "Não foi possível abrir o armazenamento." : "Could not open activity storage."));
  }, [pt]);
  if (Capacitor.getPlatform() !== "android") return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      if (file.size > MAX_BYTES) throw new Error(pt ? "O arquivo deve ter no máximo 100 MB." : "The file must be 100 MB or smaller.");
      const parsed = parseTakeoutHistory(JSON.parse(await file.text()) as unknown);
      if (!parsed.activities.length) throw new Error(pt ? "Nenhuma atividade válida foi encontrada neste arquivo." : "No valid watch activity was found in this file.");
      const result = await importActivities(parsed.activities);
      setCount(await activityCount());
      const duplicates = result.duplicates + parsed.duplicates;
      setMessage(pt
        ? `${result.added} atividades importadas; ${duplicates} duplicadas; ${parsed.skipped} ignoradas.`
        : `${result.added} activities imported; ${duplicates} duplicates; ${parsed.skipped} skipped.`);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? (pt ? "Não foi possível ler o JSON." : "Could not read the JSON file.") : (error as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return <section className="flex flex-col gap-3">
    <h3 className="text-xs font-medium text-fg-3">{pt ? "Histórico do Google Takeout" : "Google Takeout history"}</h3>
    <p className="text-sm text-fg-2">{pt ? "Escolha o arquivo JSON de histórico de exibição extraído do Google Takeout. Ele pode incluir vídeos além de músicas. A duração ou conclusão de cada reprodução é desconhecida." : "Choose the watch-history JSON file extracted from Google Takeout. It may include videos as well as music. Listening duration and completion are unknown."}</p>
    <p className="text-xs text-fg-3">{pt ? "Os dados ficam neste dispositivo, separados da biblioteca e do backup atual do Musike." : "Activity stays on this device, separate from your library and the current Musike backup."}</p>
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex h-11 items-center justify-center rounded-full bg-surface-1 px-4 text-sm font-medium ring-1 ring-line disabled:opacity-50">{busy ? (pt ? "Importando…" : "Importing…") : (pt ? "Importar histórico JSON" : "Import history JSON")}</button>
    <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label={pt ? "Selecionar histórico JSON" : "Choose history JSON"} onChange={(event) => void pick(event.target.files?.[0])} />
    {count !== null && <p className="text-xs text-fg-2">{pt ? `${count} atividades armazenadas` : `${count} stored activities`}</p>}
    {message && <p role="status" className="text-sm text-fg-2">{message}</p>}
  </section>;
}
