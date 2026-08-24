// Bivouac — briques d'interface et panneaux plein écran.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Progress, SavedSpot, Spot, Weights } from './types';
import { CRITERIA, PRESETS, scoreColor, showDriveMin, estimateDriveMin } from './criteria';
import { formatDist, walkMin } from './geo';
import { searchPlace, type PlaceHit, driveUrl, satelliteUrl, ignUrl, osmUrl, ondeUrl, coordText } from './places';
import { exportSaved, importSaved, mergeSaved, type Settings, type Origin } from './store';

// ── briques ──────────────────────────────────────────────────────────────────

export function RoundBtn({ onClick, children, active, label, badge }: {
  onClick: () => void; children: React.ReactNode; active?: boolean; label: string; badge?: number;
}) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`relative grid h-11 w-11 place-items-center rounded-full text-lg shadow-lg backdrop-blur transition active:scale-90 ${active ? 'bg-emerald-500 text-white' : 'bg-slate-900/70 text-white'}`}>
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber-400 px-1 text-center text-[10px] font-black text-black">{badge}</span>
      )}
    </button>
  );
}

export function ScoreRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const col = scoreColor(value);
  return (
    <svg width={size} height={size} className="shrink-0" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="#fff" fontSize={size * 0.3} fontWeight="800">{Math.round(value)}</text>
    </svg>
  );
}

function Sheet({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#0b1220] text-white">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-black">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-white/55">{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="Fermer"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 active:scale-90">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      {footer && <div className="border-t border-white/10 p-3">{footer}</div>}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold">{label}</label>
        <div className="shrink-0 text-sm font-bold text-emerald-300">{children}</div>
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-white/45">{hint}</p>}
    </div>
  );
}

const slider = 'mt-2 w-full accent-emerald-400';

// ── progression ──────────────────────────────────────────────────────────────

export function ProgressOverlay({ progress, elapsed, onCancel }: {
  progress: Progress; elapsed: number; onCancel: () => void;
}) {
  const pct = progress.ratio === undefined ? null : Math.round(progress.ratio * 100);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111c2e] p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-400/25 border-t-emerald-400" />
        <p className="text-sm font-bold">{progress.message}</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full bg-emerald-400 ${pct === null ? 'w-1/3 animate-pulse' : 'transition-all'}`}
            style={pct === null ? undefined : { width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-white/45">
          {elapsed > 0 && `${elapsed} s · `}
          {progress.phase === 'download' && 'OpenStreetMap peut mettre 10 à 60 s sur une grande zone.'}
          {progress.phase === 'scan' && 'Analyse locale, rien ne quitte ton téléphone.'}
          {progress.phase === 'refine' && 'Altimétrie et temps de route réels.'}
        </p>
        <button onClick={onCancel} className="mt-4 w-full rounded-xl border border-white/15 py-2.5 text-sm font-semibold active:scale-95">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── point de départ ──────────────────────────────────────────────────────────

export function OriginPanel({ origin, onPick, onPickOnMap, onClose }: {
  origin: Origin; onPick: (o: Origin) => void; onPickOnMap: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    // Nominatim demande de rester sous 1 requête/seconde : on temporise.
    const t = setTimeout(() => {
      if (q.trim().length < 3) { setHits([]); setErr(null); return; }
      setBusy(true); setErr(null);
      searchPlace(q, ctrl.signal)
        .then(setHits)
        .catch((e: unknown) => { if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : 'Recherche impossible.'); })
        .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const visibleHits = q.trim().length >= 3 ? hits : [];

  const useGps = () => {
    if (!navigator.geolocation) { setErr('Géolocalisation indisponible sur cet appareil.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => { setBusy(false); onPick({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Ma position' }); },
      e => { setBusy(false); setErr(e.message || 'Position refusée.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <Sheet title="Point de départ" subtitle={`Actuellement : ${origin.label}`} onClose={onClose}>
      <input value={q} onChange={e => setQ(e.target.value)} autoFocus
        placeholder="Ville, adresse, lieu-dit… (partout dans le monde)"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-emerald-400" />

      <div className="mt-3 flex gap-2">
        <button onClick={useGps} disabled={busy}
          className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-semibold active:scale-95 disabled:opacity-40">📍 Ma position</button>
        <button onClick={onPickOnMap}
          className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-semibold active:scale-95">🗺️ Sur la carte</button>
      </div>

      {busy && <p className="mt-3 text-xs text-white/50">Recherche…</p>}
      {err && <p className="mt-3 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{err}</p>}

      <div className="mt-3 space-y-2">
        {visibleHits.map((h, i) => (
          <button key={i} onClick={() => onPick({ lat: h.lat, lng: h.lng, label: h.label.split(',').slice(0, 2).join(',') })}
            className="w-full rounded-xl border border-white/10 bg-white/[.04] p-3 text-left text-sm active:scale-[.99]">
            {h.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        Recherche fournie par Nominatim (OpenStreetMap). Le point de départ sert à la fois de centre de recherche
        et de référence pour le temps de trajet.
      </p>
    </Sheet>
  );
}

// ── pondérations ─────────────────────────────────────────────────────────────

export function WeightsPanel({ weights, onChange, onClose }: {
  weights: Weights; onChange: (w: Weights) => void; onClose: () => void;
}) {
  const activePreset = PRESETS.find(p => CRITERIA.every(c => (p.weights[c.id] ?? 0) === (weights[c.id] ?? 0)));
  return (
    <Sheet title="Ce qui compte pour vous" subtitle="Le classement se met à jour immédiatement, sans relancer la recherche." onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => onChange({ ...p.weights })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold active:scale-95 ${activePreset?.id === p.id ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200' : 'border-white/15 text-white/75'}`}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 divide-y divide-white/10">
        {CRITERIA.map(c => {
          const w = weights[c.id] ?? 0;
          return (
            <div key={c.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm font-semibold">{c.emoji} {c.label}</label>
                <span className={`shrink-0 text-xs font-bold ${w === 0 ? 'text-white/35' : 'text-emerald-300'}`}>
                  {w === 0 ? 'ignoré' : `poids ${w}`}
                </span>
              </div>
              <input type="range" min={0} max={5} step={1} value={w} className={slider}
                onChange={e => onChange({ ...weights, [c.id]: Number(e.target.value) })} />
              <p className="text-[11px] leading-snug text-white/45">{c.hint}</p>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

// ── liste des résultats ──────────────────────────────────────────────────────

export function ListPanel({ spots, onSelect, onClose, savedIds }: {
  spots: Spot[]; onSelect: (id: string) => void; onClose: () => void; savedIds: Set<string>;
}) {
  return (
    <Sheet title={`${spots.length} coin${spots.length > 1 ? 's' : ''} repéré${spots.length > 1 ? 's' : ''}`}
      subtitle="Classés selon tes critères. Touche un résultat pour le voir sur la carte." onClose={onClose}>
      <div className="space-y-2">
        {spots.map((s, i) => (
          <button key={s.id} onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left active:scale-[.99]">
            <div className="w-5 shrink-0 text-center text-xs font-black text-white/40">{i + 1}</div>
            <ScoreRing value={s.total} size={42} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">
                {formatDist(s.metrics.crowM)} du départ
                <span className="font-normal text-white/50"> · ~{showDriveMin(s.metrics.driveMin ?? estimateDriveMin(s.metrics.crowM))} min</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-white/55">
                💧 {formatDist(s.metrics.dWater)} · 🌲 {formatDist(s.metrics.dEdge)} · 🥾 {walkMin(s.metrics.dAccess)} min
              </div>
            </div>
            {savedIds.has(`${s.lat.toFixed(4)},${s.lng.toFixed(4)}`) && <span className="shrink-0 text-sm">⭐</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ── sélection sauvegardée ────────────────────────────────────────────────────

export function SavedPanel({ saved, onChange, onSelect, onClose }: {
  saved: SavedSpot[]; onChange: (list: SavedSpot[]) => void; onSelect: (s: SavedSpot) => void; onClose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<SavedSpot>) => onChange(saved.map(s => (s.id === id ? { ...s, ...p } : s)));

  const doExport = () => {
    const blob = new Blob([exportSaved(saved)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'spots-bivouac.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = (text: string) => {
    try {
      const list = importSaved(text);
      onChange(mergeSaved(saved, list));
      setMsg(`✓ ${list.length} spot(s) importé(s).`);
      setImportText('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Fichier illisible.'); }
  };

  return (
    <Sheet title="Notre sélection" subtitle={`${saved.length} spot${saved.length > 1 ? 's' : ''} mis de côté`} onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={doExport} disabled={saved.length === 0}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold active:scale-95 disabled:opacity-40">⬇ Exporter</button>
          <button onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold active:scale-95">⬆ Importer un fichier</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(doImport); e.target.value = ''; }} />
          {msg && <span className="text-[11px] text-white/60">{msg}</span>}
        </div>
      }>
      {saved.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-white/50">
          Aucun spot sauvegardé. Touche un point sur la carte puis « Mettre de côté » pour le retrouver ici,
          l'annoter et l'envoyer aux copains.
        </p>
      )}

      <div className="space-y-2">
        {saved.map(s => (
          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
            <div className="flex items-center gap-3">
              <ScoreRing value={s.total} size={38} />
              <button onClick={() => onSelect(s)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-bold">{s.name || coordText(s)}</div>
                <div className="truncate text-[11px] text-white/50">{coordText(s)}</div>
              </button>
              <button onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 active:scale-90">
                {openId === s.id ? '▴' : '▾'}
              </button>
            </div>

            {openId === s.id && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex gap-1.5">
                  {([['todo', '🕐 À explorer'], ['good', '✅ Validé'], ['bad', '❌ Écarté']] as const).map(([v, lbl]) => (
                    <button key={v} onClick={() => patch(s.id, { status: v })}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold active:scale-95 ${s.status === v ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <input value={s.name} onChange={e => patch(s.id, { name: e.target.value })} placeholder="Nom du coin"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <textarea value={s.note} onChange={e => patch(s.id, { note: e.target.value })} rows={2}
                  placeholder="Notes : accès, point d'eau vérifié, terrain plat…"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a href={driveUrl(s)} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold">🚗 Itinéraire</a>
                  <a href={ignUrl(s)} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold">🗺️ IGN</a>
                  <button onClick={() => onChange(saved.filter(x => x.id !== s.id))}
                    className="rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 active:scale-95">🗑 Retirer</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">Coller un partage</p>
        <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={2}
          placeholder="Colle ici le JSON envoyé par un copain…"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-emerald-400" />
        <button onClick={() => doImport(importText)} disabled={!importText.trim()}
          className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold active:scale-95 disabled:opacity-40">Fusionner</button>
      </div>
    </Sheet>
  );
}

// ── réglages ─────────────────────────────────────────────────────────────────

export function SettingsPanel({ settings, onChange, onClose, onRescan, sceneReady }: {
  settings: Settings; onChange: (s: Settings) => void; onClose: () => void;
  onRescan: () => void; sceneReady: boolean;
}) {
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const heavy = settings.radiusKm > 18;

  return (
    <Sheet title="Réglages de la recherche" onClose={onClose}
      footer={sceneReady ? (
        <button onClick={onRescan} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold active:scale-95">
          Relancer l'analyse
        </button>
      ) : undefined}>
      <div className="divide-y divide-white/10">
        <Row label="Rayon de recherche" hint={heavy
          ? '⚠️ Au-delà de 18 km, le téléchargement OpenStreetMap devient long (et peut échouer aux heures de pointe).'
          : 'Zone explorée autour du point de départ.'}>
          {settings.radiusKm} km
        </Row>
        <input type="range" min={3} max={30} step={1} value={settings.radiusKm} className={slider}
          onChange={e => set({ radiusKm: Number(e.target.value) })} />

        <Row label="Finesse du balayage" hint="Distance entre deux points testés. Plus fin = plus précis mais plus lent.">
          {settings.gridStep} m
        </Row>
        <input type="range" min={60} max={400} step={10} value={settings.gridStep} className={slider}
          onChange={e => set({ gridStep: Number(e.target.value) })} />

        <Row label="Écart minimum entre spots" hint="Évite d'obtenir vingt variantes du même endroit.">
          {formatDist(settings.minSeparation)}
        </Row>
        <input type="range" min={200} max={3000} step={100} value={settings.minSeparation} className={slider}
          onChange={e => set({ minSeparation: Number(e.target.value) })} />

        <Row label="Nombre de résultats">{settings.maxResults}</Row>
        <input type="range" min={5} max={80} step={5} value={settings.maxResults} className={slider}
          onChange={e => set({ maxResults: Number(e.target.value) })} />

        <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
          <span>
            <span className="text-sm font-semibold">Uniquement en forêt</span>
            <p className="mt-1 text-[11px] text-white/45">Décoche pour explorer aussi les zones sans arbres (utile en région peu boisée).</p>
          </span>
          <input type="checkbox" checked={settings.requireForest} className="h-5 w-5 shrink-0 accent-emerald-400"
            onChange={e => set({ requireForest: e.target.checked })} />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
          <span>
            <span className="text-sm font-semibold">Affiner les meilleurs spots</span>
            <p className="mt-1 text-[11px] text-white/45">Pente réelle (altimétrie) et temps de route réel pour le haut du classement.</p>
          </span>
          <input type="checkbox" checked={settings.refine} className="h-5 w-5 shrink-0 accent-emerald-400"
            onChange={e => set({ refine: e.target.checked })} />
        </label>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-white/45">D'où viennent les données</p>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-white/60">
          <li><b>OpenStreetMap / Overpass</b> — forêts, cours d'eau, pistes, habitations. Gratuit, sans clé.</li>
          <li><b>Open-Meteo</b> — altimétrie, pour estimer la pente.</li>
          <li><b>OSRM</b> — temps de route réels.</li>
          <li><b>IGN Géoportail</b> — ortho et carte topo, accessibles depuis chaque fiche.</li>
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-white/45">
          L'outil ne dit rien du <b>droit d'accès</b> : forêt privée, réserve, arrêté préfectoral, risque incendie.
          À vérifier avant de partir. Pour savoir si un ruisseau coule encore en été, va voir{' '}
          <a href={ondeUrl()} target="_blank" rel="noreferrer" className="underline">onde.eaufrance.fr</a>.
        </p>
      </div>
    </Sheet>
  );
}

// ── fiche d'un spot ──────────────────────────────────────────────────────────

export function SpotCard({ spot, rank, name, isSaved, onSave, onClose }: {
  spot: Spot; rank: number; name: string | null; isSaved: boolean; onSave: () => void; onClose: () => void;
}) {
  const [openDetail, setOpenDetail] = useState(false);
  const rows = useMemo(
    () => CRITERIA.map(c => ({ c, score: spot.scores[c.id], detail: c.detail(spot.metrics) })),
    [spot],
  );

  return (
    <div className="absolute inset-x-2 bottom-2 z-30 max-h-[62dvh] overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#111c2e]/97 shadow-2xl backdrop-blur-lg">
      <div className="flex items-start gap-3 p-4">
        <ScoreRing value={spot.total} size={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold">
            <span className="text-white/45">#{rank}</span> {name ?? formatDist(spot.metrics.crowM) + ' du départ'}
          </div>
          <div className="mt-0.5 truncate text-xs text-white/55">{coordText(spot)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/70">
            <span>🚗 ~{showDriveMin(spot.metrics.driveMin ?? estimateDriveMin(spot.metrics.crowM))} min</span>
            <span>💧 {formatDist(spot.metrics.dWater)}</span>
            <span>🌲 {formatDist(spot.metrics.dEdge)}</span>
            <span>🥾 {walkMin(spot.metrics.dAccess)} min</span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Fermer"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 active:scale-90">✕</button>
      </div>

      <button onClick={() => setOpenDetail(v => !v)}
        className="flex w-full items-center justify-between px-4 pb-2 text-[11px] font-black uppercase tracking-wider text-white/45">
        <span>Détail des critères</span><span>{openDetail ? '▴' : '▾'}</span>
      </button>

      {openDetail && (
        <div className="space-y-2 px-4 pb-2">
          {rows.map(({ c, score, detail }) => (
            <div key={c.id}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="truncate">{c.emoji} {c.label}</span>
                <span className="shrink-0 text-white/50">{detail}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                {score !== undefined && (
                  <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-2">
        <a href={driveUrl(spot)} target="_blank" rel="noreferrer"
          className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold active:scale-95">🚗 Itinéraire</a>
        <a href={satelliteUrl(spot)} target="_blank" rel="noreferrer"
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold active:scale-95">🛰️ Satellite</a>
        <a href={ignUrl(spot)} target="_blank" rel="noreferrer"
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold active:scale-95">🗺️ IGN</a>
        <a href={osmUrl(spot)} target="_blank" rel="noreferrer"
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold active:scale-95">OSM</a>
        <button onClick={() => navigator.clipboard?.writeText(coordText(spot))}
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold active:scale-95">📋 Coords</button>
        <button onClick={onSave} disabled={isSaved}
          className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black active:scale-95 disabled:opacity-50">
          {isSaved ? '⭐ Gardé' : '⭐ Mettre de côté'}
        </button>
      </div>
    </div>
  );
}
