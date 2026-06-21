// Fête de la Musique — interface 100 % carte : la carte occupe tout l'écran,
// tout le reste est en petits éléments flottants par-dessus.
import { useMemo, useState } from 'react';
import type { Stage } from './types';
import {
  haversine, walkingMinutes, formatDistance, statusOf, msUntilStart, msUntilEnd,
  msSinceStart, durationMs, formatDuration, formatHM, type Status,
} from './geo';
import { useNow, useGeolocation } from './hooks';
import {
  loadProgram, saveProgram, resetProgram, loadKey, saveKey, parseProgram, exportProgram,
  loadPresence, savePresence, userId, PRESENCE_COLORS, type PresenceConfig,
} from './store';
import { usePresence } from './presence';
import { directionsUrl } from './maps';
import { FeteMap } from './FeteMap';
import { MapLibreMap } from './MapLibreMap';
import type { PinData } from './pin';

const ME_ID = userId();

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
const statusColor = (s: Status) => s === 'live' ? '#22c55e' : s === 'upcoming' ? '#f59e0b' : '#9ca3af';

function RoundBtn({ onClick, children, active, badge, label }: { onClick: () => void; children: React.ReactNode; active?: boolean; badge?: string | number; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={`relative grid h-11 w-11 place-items-center rounded-full text-lg shadow-lg backdrop-blur transition active:scale-90 ${active ? 'bg-fuchsia-500' : 'bg-black/55'}`}>
      {children}
      {badge !== undefined && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-emerald-500 px-1 text-center text-[10px] font-black text-black">{badge}</span>}
    </button>
  );
}

export function FeteApp() {
  const now = useNow(1000);
  const { state: geo, enable: enableGeo } = useGeolocation();
  const [program, setProgram] = useState<Stage[]>(() => loadProgram());
  const [apiKey, setApiKey] = useState<string>(() => loadKey());
  const [mapProvider, setMapProvider] = useState<'libre' | 'google'>('libre');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceConfig>(() => loadPresence());

  const userPos = geo.status === 'ok' ? geo.point : undefined;
  const { peers, connected } = usePresence(presence, { id: ME_ID }, userPos);

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

  // Un seul marqueur PAR LIEU : on montre le set en cours, sinon le prochain.
  const { mapStages, mapPins } = useMemo(() => {
    const byVenue = new Map<string, Stage[]>();
    for (const s of program) {
      const k = `${s.locationName}@${s.lat},${s.lng}`;
      const arr = byVenue.get(k); if (arr) arr.push(s); else byVenue.set(k, [s]);
    }
    const reps: Stage[] = []; const pins: Record<string, PinData> = {};
    for (const acts of byVenue.values()) {
      const sorted = [...acts].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      const rep = sorted.find(s => statusById[s.id] === 'live') ?? sorted.find(s => statusById[s.id] === 'upcoming') ?? sorted[sorted.length - 1];
      reps.push(rep);
      const g = gstyle(rep.genre); const st = statusById[rep.id];
      const walk = userPos && distById[rep.id] !== undefined ? ` · 🚶${walkingMinutes(distById[rep.id])}min` : '';
      pins[rep.id] = { color: g.color, emoji: g.emoji, name: rep.name, sub: `${formatHM(rep.start)}–${formatHM(rep.end)}${walk}`, live: st === 'live', dim: st === 'past', selected: acts.some(a => a.id === focusId) };
    }
    return { mapStages: reps, mapPins: pins };
  }, [program, statusById, distById, userPos, focusId]);

  const live = useMemo(() => program.filter(s => statusById[s.id] === 'live').sort((a, b) => msUntilEnd(a, now) - msUntilEnd(b, now)), [program, statusById, now]);
  const upcoming = useMemo(() => program.filter(s => statusById[s.id] === 'upcoming').sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [program, statusById]);
  const selected = focusId ? program.find(s => s.id === focusId) : undefined;
  const lineupAt = (loc: string) => program.filter(s => s.locationName === loc).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  // la carte n'a qu'un marqueur par lieu : on recentre sur le marqueur du même lieu
  const mapFocusId = useMemo(() => {
    if (!selected) return null;
    const rep = mapStages.find(s => s.locationName === selected.locationName);
    return rep ? rep.id : focusId;
  }, [selected, mapStages, focusId]);

  const Dist = ({ id }: { id: string }) => userPos && distById[id] !== undefined
    ? <span className="whitespace-nowrap text-white/55">· {formatDistance(distById[id])} · 🚶 {walkingMinutes(distById[id])} min</span> : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0e0618] text-white" style={{ colorScheme: 'dark' }}>
      {/* CARTE plein écran (toujours montée → jamais redimensionnée → pas d'écran noir) */}
      <div className="absolute inset-0">
        {mapProvider === 'google' && apiKey
          ? <FeteMap apiKey={apiKey} stages={mapStages} pinData={mapPins} userPos={userPos} focusId={mapFocusId} onSelect={setFocusId} others={peers} />
          : <MapLibreMap stages={mapStages} pinData={mapPins} userPos={userPos} focusId={mapFocusId} onSelect={setFocusId} others={peers} />}
      </div>

      {/* dégradé haut pour la lisibilité des contrôles */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />

      {/* Barre flottante haute */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="flex flex-col items-start gap-2">
          <div className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-black backdrop-blur">🎶 {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
          {live.length > 0 && (
            <button onClick={() => setFocusId(live[0].id)} className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-black shadow-lg active:scale-95">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-black/70" /></span>
              {live.length} en direct
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <RoundBtn onClick={() => setListOpen(true)} label="Programme">📋</RoundBtn>
          <RoundBtn onClick={() => setSettingsOpen(true)} label="Se voir" active={presence.enabled} badge={presence.enabled ? (connected ? peers.length + 1 : '…') : undefined}>👥</RoundBtn>
          <RoundBtn onClick={enableGeo} active={geo.status === 'ok'} label="Ma position">📍</RoundBtn>
          <RoundBtn onClick={() => setSettingsOpen(true)} label="Réglages">⚙</RoundBtn>
        </div>
      </div>

      {/* Toggle fond de carte (discret, bas-gauche) */}
      <div className="absolute bottom-3 left-3 flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur">
        <button onClick={() => setMapProvider('libre')} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${mapProvider === 'libre' ? 'bg-fuchsia-500 text-white' : 'text-white/70'}`}>3D</button>
        <button onClick={() => setMapProvider('google')} disabled={!apiKey} className={`rounded-full px-2.5 py-1 text-[11px] font-bold disabled:opacity-40 ${mapProvider === 'google' ? 'bg-fuchsia-500 text-white' : 'text-white/70'}`}>Google</button>
      </div>

      {/* Puce « prochain » discrète quand rien n'est sélectionné ni en direct */}
      {!selected && live.length === 0 && upcoming[0] && (
        <button onClick={() => setFocusId(upcoming[0].id)} className="absolute bottom-3 right-3 max-w-[70%] truncate rounded-full bg-black/60 px-3 py-2 text-xs font-semibold backdrop-blur active:scale-95">
          ▸ {formatHM(upcoming[0].start)} {gstyle(upcoming[0].genre).emoji} {upcoming[0].name}
        </button>
      )}

      {/* Fiche d'une scène (petite, en bas, dismissable) */}
      {selected && (() => {
        const g = gstyle(selected.genre); const st = statusById[selected.id];
        const dur = durationMs(selected); const pct = dur > 0 ? Math.min(100, (msSinceStart(selected, now) / dur) * 100) : 0;
        const lu = lineupAt(selected.locationName);
        return (
          <div className="absolute inset-x-2 bottom-2 z-20 max-h-[52dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#160c24]/95 p-3 shadow-2xl backdrop-blur-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold leading-tight">{selected.name}</div>
                <div className="mt-0.5 text-sm" style={{ color: g.color }}>{g.emoji} {selected.genre}</div>
                <div className="truncate text-xs text-white/60">📍 {selected.locationName} <Dist id={selected.id} /></div>
              </div>
              <button onClick={() => setFocusId(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 active:scale-90" aria-label="Fermer">✕</button>
            </div>

            <div className="mt-2 rounded-xl bg-white/5 p-2.5">
              {st === 'live' && <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color }} /></div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div><div className="text-[9px] uppercase text-white/45">commencé</div><div className="text-[13px] font-bold">il y a {formatDuration(msSinceStart(selected, now))}</div></div>
                  <div><div className="text-[9px] uppercase text-white/45">fin dans</div><div className="text-[13px] font-bold" style={{ color: g.color }}>{formatDuration(msUntilEnd(selected, now))}</div></div>
                  <div><div className="text-[9px] uppercase text-white/45">durée</div><div className="text-[13px] font-bold">{formatDuration(dur)}</div></div>
                </div>
              </>}
              {st === 'upcoming' && <div className="text-center text-sm">commence <b style={{ color: g.color }}>dans {formatDuration(msUntilStart(selected, now))}</b> · à {formatHM(selected.start)} · durée {formatDuration(dur)}</div>}
              {st === 'past' && <div className="text-center text-sm text-white/50">Terminé ({formatHM(selected.start)}–{formatHM(selected.end)})</div>}
            </div>

            {lu.length > 1 && (() => {
              // « ensuite » = le 1er set à venir sur cette scène (celui qui enchaîne)
              const nextId = lu.find(s2 => statusById[s2.id] === 'upcoming')?.id;
              return (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-white/55">Programme de la scène — qui enchaîne</div>
                  <div className="space-y-0.5">{lu.map(s2 => {
                    const cur = s2.id === selected.id; const st2 = statusById[s2.id]; const isNext = s2.id === nextId;
                    return <div key={s2.id} className={`flex items-center gap-2 rounded px-2 py-1 text-[13px] ${cur ? 'bg-white/10' : ''} ${st2 === 'past' ? 'opacity-55' : ''}`}>
                      <span className="w-20 shrink-0 text-white/55">{formatHM(s2.start)}–{formatHM(s2.end)}</span>
                      <span className={`flex-1 truncate ${st2 === 'live' ? 'font-bold' : ''}`}>{s2.name}</span>
                      {st2 === 'live' && <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-400">▶ en cours</span>}
                      {isNext && <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300">⏭ ensuite · dans {formatDuration(msUntilStart(s2, now))}</span>}
                    </div>;
                  })}</div>
                </div>
              );
            })()}

            <a href={directionsUrl(selected.lat, selected.lng, selected.name)} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl bg-fuchsia-500 py-2.5 text-center text-sm font-bold active:scale-95">🚶 M'y emmener</a>
          </div>
        );
      })()}

      {listOpen && <ProgrammeOverlay program={program} statusById={statusById} distById={distById} userPos={!!userPos} now={now}
        onPick={(id) => { setFocusId(id); setListOpen(false); }} onClose={() => setListOpen(false)} />}

      {settingsOpen && <SettingsModal apiKey={apiKey} setApiKey={setApiKey} program={program} setProgram={setProgram}
        presence={presence} onPresence={(c) => { setPresence(c); savePresence(c); }} connected={connected} peerCount={peers.length}
        onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ── Liste du programme (plein écran, à la demande) ───────────────────────────
function ProgrammeOverlay({ program, statusById, distById, userPos, now, onPick, onClose }: {
  program: Stage[]; statusById: Record<string, Status>; distById: Record<string, number>; userPos: boolean; now: number;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<'heure' | 'distance'>('heure');
  const genres = useMemo(() => [...new Set(program.map(s => s.genre).filter(Boolean) as string[])], [program]);
  const filtered = useMemo(() => {
    let arr = program.filter(s => (!genreFilter || s.genre === genreFilter) &&
      (!query.trim() || `${s.name} ${s.locationName} ${s.genre ?? ''}`.toLowerCase().includes(query.toLowerCase())));
    arr = [...arr];
    if (sort === 'distance' && userPos) arr.sort((a, b) => (distById[a.id] ?? Infinity) - (distById[b.id] ?? Infinity));
    else arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return arr;
  }, [program, genreFilter, query, sort, userPos, distById]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#0e0618]">
      <div className="flex items-center gap-2 p-3">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un groupe, un lieu…" autoFocus
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-white/40 focus:border-fuchsia-400" />
        <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10">✕</button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2">
        <Chip active={!genreFilter} onClick={() => setGenreFilter(null)} label="Tout" />
        {genres.map(g => <Chip key={g} active={genreFilter === g} onClick={() => setGenreFilter(genreFilter === g ? null : g)} label={`${gstyle(g).emoji} ${g}`} color={gstyle(g).color} />)}
      </div>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs text-white/50">{filtered.length} concert{filtered.length > 1 ? 's' : ''}</span>
        <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
          {(['heure', 'distance'] as const).map(m => (
            <button key={m} onClick={() => setSort(m)} disabled={m === 'distance' && !userPos}
              className={`rounded px-2 py-1 font-semibold disabled:opacity-40 ${sort === m ? 'bg-fuchsia-500 text-white' : 'text-white/70'}`}>{m === 'heure' ? '🕐 Heure' : '📍 Proche'}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.map(s => {
          const g = gstyle(s.genre); const st = statusById[s.id];
          return (
            <button key={s.id} onClick={() => onPick(s.id)} className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-2.5 text-left active:scale-[.99] ${st === 'past' ? 'opacity-55' : ''}`}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg" style={{ background: g.color + '22' }}>{g.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{s.name}</div>
                <div className="truncate text-[11px] text-white/55">{s.locationName} · {formatHM(s.start)}–{formatHM(s.end)}{userPos && distById[s.id] !== undefined ? ` · 🚶${walkingMinutes(distById[s.id])}min` : ''}</div>
              </div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: statusColor(st) + '22', color: statusColor(st) }}>
                {st === 'live' ? 'live' : st === 'upcoming' ? `dans ${formatDuration(msUntilStart(s, now))}` : 'fini'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${active ? 'text-white' : 'border-white/10 text-white/70'}`}
      style={active ? { background: (color ?? '#d946ef') + '33', borderColor: (color ?? '#d946ef') } : {}}>{label}</button>
  );
}

function SettingsModal({ apiKey, setApiKey, program, setProgram, presence, onPresence, connected, peerCount, onClose }: {
  apiKey: string; setApiKey: (v: string) => void;
  program: Stage[]; setProgram: (p: Stage[]) => void;
  presence: PresenceConfig; onPresence: (c: PresenceConfig) => void;
  connected: boolean; peerCount: number;
  onClose: () => void;
}) {
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pr, setPr] = useState<PresenceConfig>(presence);
  const setP = (patch: Partial<PresenceConfig>) => setPr(v => ({ ...v, ...patch }));
  const doExport = () => {
    const blob = new Blob([exportProgram(program)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'programme-fete-musique.json'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-lg overflow-auto rounded-t-3xl border border-white/10 bg-[#1a0f29] p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">Réglages</h3>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">✕</button>
        </div>

        {/* Se voir entre amis (simple) */}
        <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-3">
          <div className="flex items-center justify-between">
            <label className="text-base font-bold">👥 Se voir entre amis</label>
            <span className="text-xs" style={{ color: pr.enabled ? (connected ? '#34d399' : '#fbbf24') : '#9ca3af' }}>
              {!pr.enabled ? 'désactivé' : connected ? `● en ligne · ${peerCount} ami${peerCount > 1 ? 's' : ''}` : 'connexion…'}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-white/55">Gratuit, sans compte. Mets ton prénom et le <b>même code</b> que tes amis : vous apparaissez sur la carte.</p>
          <input value={pr.name} onChange={e => setP({ name: e.target.value })} placeholder="Ton prénom"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-400" />
          <div className="mt-2 flex gap-2">
            <input value={pr.room} onChange={e => setP({ room: e.target.value })} placeholder="Code du groupe (ex. lespotes21)"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-400" />
            <button onClick={() => setP({ room: Math.random().toString(36).slice(2, 8) })} className="shrink-0 rounded-xl border border-white/10 px-3 text-xs active:scale-95">🎲</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-white/50">Ta couleur :</span>
            {PRESENCE_COLORS.map(c => <button key={c} onClick={() => setP({ color: c })} className={`h-7 w-7 rounded-full ${pr.color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} aria-label="couleur" />)}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {!pr.enabled
              ? <button onClick={() => { const c = { ...pr, enabled: true }; setPr(c); onPresence(c); }} disabled={!pr.name.trim() || !pr.room.trim()} className="flex-1 rounded-xl bg-fuchsia-500 py-2.5 text-sm font-bold active:scale-95 disabled:opacity-40">Rejoindre le groupe</button>
              : <>
                  <button onClick={() => { navigator.clipboard?.writeText(pr.room).then(() => setMsg('Code copié !')).catch(() => {}); }} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-semibold active:scale-95">📋 Partager « {pr.room} »</button>
                  <button onClick={() => { const c = { ...pr, enabled: false }; setPr(c); onPresence(c); }} className="rounded-xl border border-white/10 px-3 py-2 text-xs active:scale-95">Quitter</button>
                </>}
          </div>
        </div>

        <label className="mt-5 mb-1 block text-sm font-semibold">Clé API Google Maps <span className="font-normal text-white/40">(facultatif)</span></label>
        <div className="flex gap-2">
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza…" type="password"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-400" />
          <button onClick={() => { saveKey(apiKey); setMsg('Clé enregistrée.'); }} className="rounded-xl bg-fuchsia-500 px-3 text-sm font-bold active:scale-95">OK</button>
        </div>
        <p className="mt-1 text-[11px] text-white/45">La carte 3D libre marche sans clé. La clé ne sert qu'au mode Google.</p>

        <div className="mt-5 mb-1 flex items-center justify-between">
          <label className="text-sm font-semibold">Programme</label>
          <div className="flex gap-2">
            <button onClick={doExport} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs active:scale-95">⬇ Exporter</button>
            <button onClick={() => { const p = resetProgram(); setProgram(p); setMsg('Exemple rechargé.'); }} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs active:scale-95">↺ Exemple</button>
          </div>
        </div>
        <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={3}
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
