// Fête de la Musique — interface mobile-first (onglets Live / Carte / Programme).
import { useMemo, useState } from 'react';
import type { Stage } from './types';
import {
  haversine, walkingMinutes, formatDistance, statusOf, msUntilStart, msUntilEnd,
  formatDuration, formatHM, type Status,
} from './geo';
import { useNow, useGeolocation } from './hooks';
import { loadProgram, saveProgram, resetProgram, loadKey, saveKey, parseProgram, exportProgram } from './store';
import { directionsUrl } from './maps';
import { FeteMap } from './FeteMap';
import { MapLibreMap } from './MapLibreMap';

// ── Identité visuelle par genre ──────────────────────────────────────────────
const GENRES: Record<string, { emoji: string; color: string }> = {
  'Grand public': { emoji: '🎤', color: '#f472b6' },
  'Électro': { emoji: '🎧', color: '#22d3ee' },
  'Jazz': { emoji: '🎷', color: '#fbbf24' },
  'Métal': { emoji: '🤘', color: '#fb7185' },
  'Rap': { emoji: '🎙️', color: '#a78bfa' },
  'Chanson française': { emoji: '🎶', color: '#f9a8d4' },
  'Programmation variée': { emoji: '🎵', color: '#93c5fd' },
  'Acoustique / Rue': { emoji: '🥁', color: '#34d399' },
};
const gstyle = (g?: string) => GENRES[g ?? ''] ?? { emoji: '🎵', color: '#c084fc' };

type Tab = 'live' | 'map' | 'prog';

export function FeteApp() {
  const now = useNow(1000);
  const { state: geo, enable: enableGeo } = useGeolocation();
  const [program, setProgram] = useState<Stage[]>(() => loadProgram());
  const [apiKey, setApiKey] = useState<string>(() => loadKey());
  const [tab, setTab] = useState<Tab>('live');
  const [sort, setSort] = useState<'distance' | 'heure'>('heure');
  const [mapProvider, setMapProvider] = useState<'libre' | 'google'>('libre');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);

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

  const genres = useMemo(() => [...new Set(program.map(s => s.genre).filter(Boolean) as string[])], [program]);

  const filtered = useMemo(() => {
    let arr = program.filter(s =>
      (!genreFilter || s.genre === genreFilter) &&
      (!query.trim() || `${s.name} ${s.locationName} ${s.genre ?? ''}`.toLowerCase().includes(query.toLowerCase())));
    arr = [...arr];
    if (sort === 'distance' && userPos) arr.sort((a, b) => (distById[a.id] ?? Infinity) - (distById[b.id] ?? Infinity));
    else arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return arr;
  }, [program, genreFilter, query, sort, userPos, distById]);

  const goToMap = (id: string) => { setFocusId(id); setTab('map'); };

  const Dist = ({ id }: { id: string }) => userPos && distById[id] !== undefined
    ? <span className="whitespace-nowrap text-white/55">· {formatDistance(distById[id])} · 🚶 {walkingMinutes(distById[id])} min</span>
    : null;

  const clock = new Date(now);

  return (
    <div className="flex h-dvh flex-col bg-[#0e0618] text-white" style={{ colorScheme: 'dark' }}>
      {/* halo festif */}
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(217,70,239,.28),rgba(124,58,237,.12)_45%,transparent_75%)]" />

      {/* En-tête */}
      <header className="z-20 flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate text-[17px] font-black tracking-tight">
            <span className="text-xl">🎶</span> Fête de la Musique
          </div>
          <div className="text-[11px] text-fuchsia-200/70">Dijon · {clock.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · {clock.toLocaleTimeString('fr-FR')}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            {live.length}
          </span>
          <button onClick={() => setSettingsOpen(true)} aria-label="Réglages"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-base active:scale-95">⚙</button>
        </div>
      </header>

      {/* Contenu */}
      <main className="relative min-h-0 flex-1">
        {/* ── LIVE ── */}
        {tab === 'live' && (
          <div className="h-full overflow-y-auto px-4 pb-28 pt-1">
            {geo.status !== 'ok' && (
              <button onClick={enableGeo} className="mb-3 w-full rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-3 text-left text-sm font-semibold text-fuchsia-100 active:scale-[.99]">
                📍 Activer ma position <span className="font-normal text-fuchsia-200/70">— distances & tri par proximité</span>
                {geo.status === 'error' && <div className="text-xs font-normal text-rose-300">{geo.message}</div>}
                {geo.status === 'loading' && <div className="text-xs font-normal text-white/50">Localisation…</div>}
              </button>
            )}

            <h2 className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> En ce moment
            </h2>
            {live.length === 0
              ? <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-white/60">Aucun concert en cours. Reviens un peu plus tard 🎉</div>
              : <div className="grid gap-3">{live.map(s => {
                  const g = gstyle(s.genre);
                  const tot = new Date(s.end).getTime() - new Date(s.start).getTime();
                  const pct = Math.max(0, Math.min(100, ((now - new Date(s.start).getTime()) / tot) * 100));
                  return (
                    <div key={s.id} className="overflow-hidden rounded-2xl border bg-white/[.04] p-4"
                      style={{ borderColor: g.color + '55', boxShadow: `inset 3px 0 0 ${g.color}` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-extrabold leading-tight">{s.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: g.color }}>
                            <span>{g.emoji} {s.genre}</span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-white/60">📍 {s.locationName}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">live</span>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-white/70">
                        <span>fin dans <b className="text-white">{formatDuration(msUntilEnd(s, now))}</b> · {formatHM(s.end)}</span>
                        <Dist id={s.id} />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => goToMap(s.id)} className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-semibold active:scale-95">📍 Carte</button>
                        <a href={directionsUrl(s.lat, s.lng, s.name)} target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-white/10 py-2 text-center text-sm font-semibold active:scale-95">🚶 Y aller</a>
                      </div>
                    </div>
                  );
                })}</div>}

            <h2 className="mb-2 mt-5 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-amber-300">▸ Bientôt</h2>
            {upcoming.length === 0
              ? <div className="text-sm text-white/50">Plus de concerts à venir aujourd'hui.</div>
              : <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">{upcoming.slice(0, 8).map(s => {
                  const g = gstyle(s.genre);
                  return (
                    <button key={s.id} onClick={() => goToMap(s.id)} className="w-44 shrink-0 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left active:scale-95">
                      <div className="text-lg">{g.emoji}</div>
                      <div className="mt-1 truncate text-sm font-bold">{s.name}</div>
                      <div className="truncate text-[11px] text-white/55">{s.locationName}</div>
                      <div className="mt-2 text-xs">dans <b style={{ color: g.color }}>{formatDuration(msUntilStart(s, now))}</b></div>
                      <div className="text-[11px] text-white/45">{formatHM(s.start)} <Dist id={s.id} /></div>
                    </button>
                  );
                })}</div>}

            <p className="mt-5 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200/90">
              ⚠️ Programme d'exemple/approximatif. Colle le vrai dans ⚙ Réglages.
            </p>
          </div>
        )}

        {/* ── CARTE ── */}
        {tab === 'map' && (
          <div className="relative h-full">
            {mapProvider === 'google' && apiKey
              ? <FeteMap apiKey={apiKey} stages={program} statusById={statusById} userPos={userPos} focusId={focusId} onSelect={goToMap} />
              : <MapLibreMap stages={program} statusById={statusById} userPos={userPos} focusId={focusId} onSelect={setFocusId} />}
            <div className="pointer-events-auto absolute left-3 top-3 flex gap-1 rounded-full bg-black/60 p-1 backdrop-blur">
              <button onClick={() => setMapProvider('libre')} className={`rounded-full px-3 py-1 text-xs font-semibold ${mapProvider === 'libre' ? 'bg-fuchsia-500 text-white' : 'text-white/70'}`}>3D libre</button>
              <button onClick={() => setMapProvider('google')} disabled={!apiKey} title={apiKey ? '' : 'Clé Google requise'} className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${mapProvider === 'google' ? 'bg-fuchsia-500 text-white' : 'text-white/70'}`}>Google</button>
            </div>
            {geo.status !== 'ok' && (
              <button onClick={enableGeo} className="absolute bottom-24 right-3 grid h-11 w-11 place-items-center rounded-full bg-fuchsia-500 text-lg shadow-lg active:scale-95" aria-label="Ma position">📍</button>
            )}
          </div>
        )}

        {/* ── PROGRAMME ── */}
        {tab === 'prog' && (
          <div className="h-full overflow-y-auto px-4 pb-28 pt-1">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un groupe, un lieu…"
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-white/40 focus:border-fuchsia-400" />
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
              <Chip active={!genreFilter} onClick={() => setGenreFilter(null)} label="Tout" />
              {genres.map(g => <Chip key={g} active={genreFilter === g} onClick={() => setGenreFilter(genreFilter === g ? null : g)} label={`${gstyle(g).emoji} ${g}`} color={gstyle(g).color} />)}
            </div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-white/50">{filtered.length} concert{filtered.length > 1 ? 's' : ''}</span>
              <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
                {(['heure', 'distance'] as const).map(m => (
                  <button key={m} onClick={() => setSort(m)} disabled={m === 'distance' && !userPos}
                    className={`rounded px-2 py-1 font-semibold disabled:opacity-40 ${sort === m ? 'bg-fuchsia-500 text-white' : 'text-white/70'}`}>{m === 'heure' ? '🕐 Heure' : '📍 Proche'}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {filtered.map(s => {
                const g = gstyle(s.genre); const st = statusById[s.id];
                return (
                  <div key={s.id} className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-2.5 ${st === 'past' ? 'opacity-55' : ''}`}>
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg" style={{ background: g.color + '22' }}>{g.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{s.name}</div>
                      <div className="truncate text-[11px] text-white/55">{s.locationName} · {formatHM(s.start)}–{formatHM(s.end)} <Dist id={s.id} /></div>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: (st === 'live' ? '#22c55e' : st === 'upcoming' ? '#f59e0b' : '#6b7280') + '22', color: st === 'live' ? '#22c55e' : st === 'upcoming' ? '#f59e0b' : '#9ca3af' }}>
                      {st === 'live' ? 'live' : st === 'upcoming' ? formatHM(s.start) : 'fini'}
                    </span>
                    <button onClick={() => goToMap(s.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 active:scale-95" aria-label="Carte">📍</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Navigation basse */}
      <nav className="z-20 mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] mt-1 flex w-[min(440px,calc(100%-1.5rem))] items-center justify-around rounded-2xl border border-white/10 bg-white/[.06] p-1.5 backdrop-blur-lg">
        {([['live', '🔴', 'Live'], ['map', '🗺️', 'Carte'], ['prog', '📋', 'Programme']] as const).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition active:scale-95 ${tab === t ? 'bg-fuchsia-500 text-white' : 'text-white/60'}`}>
            <span className="text-base">{icon}</span>{label}
          </button>
        ))}
      </nav>

      {settingsOpen && (
        <SettingsModal
          apiKey={apiKey} setApiKey={setApiKey} program={program} setProgram={setProgram}
          onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${active ? 'text-white' : 'border-white/10 text-white/70'}`}
      style={active ? { background: (color ?? '#d946ef') + '33', borderColor: (color ?? '#d946ef') } : {}}>{label}</button>
  );
}

function SettingsModal({ apiKey, setApiKey, program, setProgram, onClose }: {
  apiKey: string; setApiKey: (v: string) => void;
  program: Stage[]; setProgram: (p: Stage[]) => void; onClose: () => void;
}) {
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const doExport = () => {
    const blob = new Blob([exportProgram(program)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'programme-fete-musique.json'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-lg overflow-auto rounded-t-3xl border border-white/10 bg-[#1a0f29] p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">Réglages</h3>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">✕</button>
        </div>
        <label className="mb-1 block text-sm font-semibold">Clé API Google Maps <span className="font-normal text-white/40">(facultatif)</span></label>
        <div className="flex gap-2">
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza…" type="password"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-400" />
          <button onClick={() => { saveKey(apiKey); setMsg('Clé enregistrée.'); }} className="rounded-xl bg-fuchsia-500 px-3 text-sm font-bold active:scale-95">OK</button>
        </div>
        <p className="mt-1 text-[11px] text-white/45">La carte « 3D libre » fonctionne sans clé. La clé ne sert qu'au mode Google.</p>

        <div className="mt-5 mb-1 flex items-center justify-between">
          <label className="text-sm font-semibold">Programme</label>
          <div className="flex gap-2">
            <button onClick={doExport} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs active:scale-95">⬇ Exporter</button>
            <button onClick={() => { const p = resetProgram(); setProgram(p); setMsg('Exemple rechargé.'); }} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs active:scale-95">↺ Exemple</button>
          </div>
        </div>
        <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4}
          placeholder='Colle le vrai programme JSON : [{ "name": "...", "locationName": "...", "lat": 47.32, "lng": 5.04, "start": "2026-06-21T17:00:00", "end": "2026-06-21T22:30:00", "genre": "..." }]'
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-fuchsia-400" />
        <div className="mt-2 flex items-center gap-3">
          <button onClick={() => { try { const p = parseProgram(importText); setProgram(p); saveProgram(p); setMsg(`✓ ${p.length} groupes importés.`); setImportText(''); } catch (e) { setMsg(e instanceof Error ? e.message : 'JSON invalide.'); } }}
            disabled={!importText.trim()} className="rounded-xl bg-fuchsia-500 px-4 py-2.5 text-sm font-bold active:scale-95 disabled:opacity-40">Importer</button>
          {msg && <span className="text-xs text-white/70">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
