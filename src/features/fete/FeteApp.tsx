// Fête de la Musique — page live (carte + groupes + distances + comptes à rebours).
import { useMemo, useRef, useState } from 'react';
import type { Stage } from './types';
import {
  haversine, walkingMinutes, formatDistance, statusOf, msUntilStart, msUntilEnd,
  formatDuration, formatHM, STATUS_COLOR, STATUS_LABEL, type Status,
} from './geo';
import { useNow, useGeolocation } from './hooks';
import { loadProgram, saveProgram, resetProgram, loadKey, saveKey, parseProgram, exportProgram } from './store';
import { directionsUrl } from './maps';
import { FeteMap } from './FeteMap';
import { MapLibreMap } from './MapLibreMap';

function StatusBadge({ s }: { s: Status }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: STATUS_COLOR[s] + '22', color: STATUS_COLOR[s] }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
      {STATUS_LABEL[s]}
    </span>
  );
}

export function FeteApp({ onExit }: { onExit?: () => void }) {
  const now = useNow(1000);
  const { state: geo, enable: enableGeo } = useGeolocation();
  const [program, setProgram] = useState<Stage[]>(() => loadProgram());
  const [apiKey, setApiKey] = useState<string>(() => loadKey());
  const [sort, setSort] = useState<'distance' | 'heure'>('heure');
  const [mapProvider, setMapProvider] = useState<'libre' | 'google'>('libre');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const mapAnchor = useRef<HTMLDivElement>(null);

  const userPos = geo.status === 'ok' ? geo.point : undefined;

  const statusById = useMemo(() => {
    const m: Record<string, Status> = {};
    for (const s of program) m[s.id] = statusOf(s, now);
    return m;
  }, [program, now]);

  const distById = useMemo(() => {
    const m: Record<string, number> = {};
    if (userPos) for (const s of program) m[s.id] = haversine(userPos, { lat: s.lat, lng: s.lng });
    return m;
  }, [program, userPos]);

  const live = useMemo(() => program.filter(s => statusById[s.id] === 'live')
    .sort((a, b) => msUntilEnd(a, now) - msUntilEnd(b, now)), [program, statusById, now]);

  const upcoming = useMemo(() => program.filter(s => statusById[s.id] === 'upcoming')
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [program, statusById]);

  const sortedAll = useMemo(() => {
    const arr = [...program];
    if (sort === 'distance' && userPos) arr.sort((a, b) => (distById[a.id] ?? Infinity) - (distById[b.id] ?? Infinity));
    else arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return arr;
  }, [program, sort, userPos, distById]);

  const focusOnMap = (id: string) => { setFocusId(id); mapAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  const saveImport = () => {
    try {
      const p = parseProgram(importText);
      setProgram(p); saveProgram(p); setImportMsg(`✓ ${p.length} groupes importés.`); setImportText('');
    } catch (e) { setImportMsg(e instanceof Error ? e.message : 'JSON invalide.'); }
  };
  const doExport = () => {
    const blob = new Blob([exportProgram(program)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'programme-fete-musique.json'; a.click(); URL.revokeObjectURL(url);
  };

  const clock = new Date(now);
  const Dist = ({ id }: { id: string }) => {
    if (!userPos || distById[id] === undefined) return null;
    return <span className="text-slate-400">· {formatDistance(distById[id])} · 🚶 {walkingMinutes(distById[id])} min</span>;
  };

  return (
    <div className="min-h-screen bg-[#140a1f] text-slate-100" style={{ colorScheme: 'dark' }}>
      {/* En-tête */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#140a1f]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-black">🎵 Fête de la Musique · Dijon</div>
            <div className="text-xs text-slate-400">{live.length} concert{live.length > 1 ? 's' : ''} en ce moment · {clock.toLocaleTimeString('fr-FR')}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setShowSettings(v => !v)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">⚙ Réglages</button>
            {onExit && <button onClick={onExit} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">✕</button>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5">
        {/* Réglages */}
        {showSettings && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-white">Clé API Google Maps</label>
              <div className="flex gap-2">
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza…" type="password"
                  className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />
                <button onClick={() => saveKey(apiKey)} className="rounded-lg bg-fuchsia-500 px-3 py-2 text-sm font-bold text-white hover:bg-fuchsia-400">Enregistrer</button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Stockée uniquement dans ton navigateur. Nécessaire pour la carte 3D. Le reste fonctionne sans.</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-semibold text-white">Programme</label>
                <div className="flex gap-2">
                  <button onClick={doExport} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5">⬇ Exporter</button>
                  <button onClick={() => { const p = resetProgram(); setProgram(p); setImportMsg('Programme d\'exemple rechargé.'); }} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5">↺ Exemple</button>
                </div>
              </div>
              <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4}
                placeholder='Colle ici le vrai programme en JSON : [{ "name": "...", "locationName": "...", "lat": 47.32, "lng": 5.04, "start": "2026-06-21T18:00:00", "end": "2026-06-21T19:30:00", "genre": "..." }]'
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-fuchsia-400" />
              <div className="mt-1 flex items-center gap-3">
                <button onClick={saveImport} disabled={!importText.trim()} className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-fuchsia-400 disabled:opacity-40">Importer le programme</button>
                {importMsg && <span className="text-xs text-slate-300">{importMsg}</span>}
              </div>
            </div>
          </section>
        )}

        {/* Bandeau exemple */}
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          ⚠️ Programme d'<b>exemple</b> (vrais lieux, groupes/horaires fictifs). Colle le vrai dans ⚙ Réglages.
        </div>

        {/* Localisation */}
        {geo.status !== 'ok' && (
          <button onClick={enableGeo} className="w-full rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-3 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-500/15">
            📍 Activer ma position pour voir les distances et trier par proximité
            {geo.status === 'error' && <span className="block text-xs font-normal text-rose-300">{geo.message}</span>}
            {geo.status === 'loading' && <span className="block text-xs font-normal text-slate-400">Localisation…</span>}
          </button>
        )}

        {/* En ce moment */}
        <section>
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-emerald-300">● En ce moment ({live.length})</h2>
          {live.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">Aucun concert en cours pour l'instant.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {live.map(s => (
                <div key={s.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-white">{s.name}</div>
                      <div className="text-xs text-slate-300">{s.genre ? `${s.genre} · ` : ''}{s.locationName}</div>
                    </div>
                    <StatusBadge s="live" />
                  </div>
                  <div className="mt-2 text-xs text-slate-300">Se termine dans <b className="text-emerald-300">{formatDuration(msUntilEnd(s, now))}</b> (à {formatHM(s.end)}) <Dist id={s.id} /></div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => focusOnMap(s.id)} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15">📍 Sur la carte</button>
                    <a href={directionsUrl(s.lat, s.lng, s.name)} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15">🚶 Itinéraire</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Bientôt */}
        <section>
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-amber-300">▸ Bientôt</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcoming.slice(0, 6).map(s => (
              <div key={s.id} className="w-56 shrink-0 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="truncate font-bold text-white">{s.name}</div>
                <div className="truncate text-xs text-slate-400">{s.genre ? `${s.genre} · ` : ''}{s.locationName}</div>
                <div className="mt-2 text-xs text-slate-300">Commence dans <b className="text-amber-300">{formatDuration(msUntilStart(s, now))}</b></div>
                <div className="text-[11px] text-slate-500">à {formatHM(s.start)} <Dist id={s.id} /></div>
                <button onClick={() => focusOnMap(s.id)} className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15">📍 Carte</button>
              </div>
            ))}
            {upcoming.length === 0 && <div className="text-sm text-slate-400">Plus de concerts à venir aujourd'hui.</div>}
          </div>
        </section>

        {/* Carte */}
        <section ref={mapAnchor}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-fuchsia-300">🗺️ Carte</h2>
            <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
              <button onClick={() => setMapProvider('libre')}
                className={`rounded px-2 py-1 font-semibold ${mapProvider === 'libre' ? 'bg-fuchsia-500 text-white' : 'text-slate-300'}`}>3D libre · gratuit</button>
              <button onClick={() => setMapProvider('google')} disabled={!apiKey} title={apiKey ? '' : 'Ajoute une clé Google dans les réglages'}
                className={`rounded px-2 py-1 font-semibold disabled:opacity-40 ${mapProvider === 'google' ? 'bg-fuchsia-500 text-white' : 'text-slate-300'}`}>Google 3D · clé</button>
            </div>
          </div>
          <div className="h-[60vh]">
            {mapProvider === 'google' && apiKey
              ? <FeteMap apiKey={apiKey} stages={program} statusById={statusById} userPos={userPos} focusId={focusId} onSelect={setFocusId} />
              : <MapLibreMap stages={program} statusById={statusById} userPos={userPos} focusId={focusId} onSelect={setFocusId} />}
          </div>
        </section>

        {/* Annuaire complet */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">Tous les groupes ({program.length})</h2>
            <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
              {(['heure', 'distance'] as const).map(m => (
                <button key={m} onClick={() => setSort(m)} disabled={m === 'distance' && !userPos}
                  className={`rounded px-2 py-1 font-semibold disabled:opacity-40 ${sort === m ? 'bg-fuchsia-500 text-white' : 'text-slate-300'}`}>
                  {m === 'heure' ? 'Par heure' : 'Par distance'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {sortedAll.map(s => {
              const st = statusById[s.id];
              return (
                <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${st === 'past' ? 'border-white/5 bg-black/10 opacity-60' : 'border-white/10 bg-black/20'}`}>
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-sm font-black text-white">{formatHM(s.start)}</div>
                    <div className="text-[10px] text-slate-500">{formatHM(s.end)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{s.name}</div>
                    <div className="truncate text-xs text-slate-400">{s.genre ? `${s.genre} · ` : ''}{s.locationName} <Dist id={s.id} /></div>
                  </div>
                  <StatusBadge s={st} />
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => focusOnMap(s.id)} title="Voir sur la carte" className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/15">📍</button>
                    <a href={directionsUrl(s.lat, s.lng, s.name)} target="_blank" rel="noreferrer" title="Itinéraire" className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/15">🚶</a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="py-6 text-center text-xs text-slate-600">Fête de la Musique · {new Date(now).toLocaleDateString('fr-FR')} · données stockées dans ton navigateur.</footer>
      </div>
    </div>
  );
}
