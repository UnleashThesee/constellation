// Bivouac — trouver des coins sauvages où dormir, à partir des données OSM.
// L'écran est la carte ; tout le reste flotte par-dessus.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, ParsedOsm, Progress, SavedSpot, SearchParams, Spot } from './types';
import { bboxAround, haversine } from './geo';
import { buildQueryParts, fetchOverpass, parseOsm, mergeOsm, pingOverpass, OverpassError, type PingResult } from './overpass';
import { buildScene, scan, rescore, type Scene } from './engine';
import { refineSpots } from './refine';
import { reverseName } from './places';
import { BivouacMap, type Basemap } from './BivouacMap';
import {
  RoundBtn, ProgressOverlay, OriginPanel, WeightsPanel, ListPanel, SavedPanel, SettingsPanel, SpotCard,
} from './BivouacPanels';
import {
  loadOrigin, saveOrigin, loadWeights, saveWeights, loadSettings, saveSettings,
  loadSaved, saveSaved, type Origin, type Settings,
} from './store';

type PanelId = 'origin' | 'weights' | 'list' | 'saved' | 'settings' | null;

const savedKey = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

export function BivouacApp() {
  const [origin, setOrigin] = useState<Origin>(loadOrigin);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [weights, setWeights] = useState(loadWeights);
  const [saved, setSaved] = useState<SavedSpot[]>(loadSaved);

  const [osm, setOsm] = useState<ParsedOsm | null>(null);
  const [rawSpots, setRawSpots] = useState<Spot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [ping, setPing] = useState<PingResult[] | null>(null);
  const [pinging, setPinging] = useState(false);

  const [panel, setPanel] = useState<PanelId>(null);
  const [pickMode, setPickMode] = useState(false);
  const [relief, setRelief] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('plan');
  const [view3d, setView3d] = useState(false);

  const [scene, setScene] = useState<Scene | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(0);

  // persistance
  useEffect(() => { saveOrigin(origin); }, [origin]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { saveWeights(weights); }, [weights]);
  useEffect(() => { saveSaved(saved); }, [saved]);

  // chronomètre pendant la recherche
  const searching = progress !== null;
  useEffect(() => {
    if (!searching) return;
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [searching]);

  const params: SearchParams = useMemo(() => ({
    origin, radiusKm: settings.radiusKm, gridStep: settings.gridStep,
    minSeparation: settings.minSeparation, maxResults: settings.maxResults, weights,
  }), [origin, settings, weights]);

  // Le changement de pondération reclasse instantanément, sans rien recalculer.
  const spots = useMemo(() => rescore(rawSpots, params), [rawSpots, params]);
  const selected = selectedId ? spots.find(s => s.id === selectedId) ?? null : null;
  const selectedRank = selected ? spots.findIndex(s => s.id === selected.id) + 1 : 0;
  const savedKeys = useMemo(() => new Set(saved.map(savedKey)), [saved]);

  // Nom lisible du spot ouvert (géocodage inverse, best effort).
  useEffect(() => {
    if (!selected || names[selected.id] !== undefined) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      reverseName(selected, ctrl.signal)
        .then(n => { if (n) setNames(p => ({ ...p, [selected.id]: n })); })
        .catch(() => { /* sans conséquence */ });
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [selected, names]);

  /** Balayage + affinage à partir d'une scène déjà indexée. */
  const analyse = useCallback(async (scene: Scene, p: SearchParams, signal: AbortSignal) => {
    const found = await scan(scene, p, {
      requireForest: settings.requireForest,
      onProgress: setProgress,
      signal,
    });

    if (found.length === 0) {
      setRawSpots([]);
      setError(settings.requireForest
        ? "Aucun coin boisé trouvé dans ce rayon. Agrandis la zone, ou décoche « Uniquement en forêt » dans les réglages."
        : 'Aucun point exploitable dans ce rayon. Essaie un rayon plus large.');
      return;
    }

    if (!settings.refine) { setRawSpots(found); return; }

    setProgress({ phase: 'refine', message: 'Pente et temps de route réels…' });
    const r = await refineSpots(found, p.origin, 30, signal);
    setRawSpots(r.spots);
    setNotice(r.notes.length ? r.notes.join(' · ') : null);
  }, [settings.requireForest, settings.refine]);

  /** Recherche complète : téléchargement OSM puis analyse. */
  const runSearch = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startedAt.current = Date.now(); setElapsed(0);
    setError(null); setNotice(null); setSelectedId(null); setPanel(null);

    try {
      const bbox = bboxAround(origin, settings.radiusKm);
      const parts = buildQueryParts(bbox);
      const collected: ParsedOsm[] = [];
      const skipped: string[] = [];

      // Trois requêtes courtes plutôt qu'une énorme : une seule grosse requête
      // expire avant de revenir dès que la zone dépasse quelques kilomètres.
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const step = `${i + 1}/${parts.length}`;
        try {
          const elements = await fetchOverpass(part.query, {
            signal: ctrl.signal,
            onMirror: (_url, attempt) => setProgress({
              phase: 'download',
              ratio: i / parts.length,
              message: `Téléchargement ${step} : ${part.label}${attempt > 1 ? ` (miroir ${attempt})` : ''}…`,
            }),
          });
          if (ctrl.signal.aborted) return;
          collected.push(parseOsm(elements));
        } catch (e) {
          if (ctrl.signal.aborted) return;
          // Une couche secondaire manquante dégrade le résultat sans l'annuler.
          if (part.essential) throw e;
          skipped.push(part.label);
        }
      }

      setProgress({ phase: 'parse', message: 'Lecture des données…' });
      await new Promise(r => setTimeout(r, 0));
      const parsed = mergeOsm(collected);
      setOsm(parsed);
      if (skipped.length) {
        setNotice(`Données incomplètes : ${skipped.join(' et ')} n'ont pas pu être téléchargés. Les critères correspondants sont faussés.`);
      }

      if (parsed.forests.length === 0 && settings.requireForest) {
        setRawSpots([]);
        setError("OpenStreetMap ne recense aucune forêt dans ce rayon. Agrandis la zone, ou décoche « Uniquement en forêt ».");
        return;
      }

      setProgress({ phase: 'index', message: 'Indexation du terrain…' });
      await new Promise(r => setTimeout(r, 0));
      const scene = buildScene(parsed, origin);
      setScene(scene);

      await analyse(scene, params, ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      if (e instanceof OverpassError) { setError(e.message); setErrorDetails(e.details); }
      else { setError(e instanceof Error ? e.message : 'Une erreur inattendue est survenue.'); setErrorDetails([]); }
    } finally {
      if (abortRef.current === ctrl) { setProgress(null); abortRef.current = null; }
    }
  }, [origin, settings.radiusKm, settings.requireForest, params, analyse]);

  /** Re-balayage sans réseau (la scène est déjà en mémoire). */
  const rescan = useCallback(async () => {
    if (!scene) { void runSearch(); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startedAt.current = Date.now(); setElapsed(0);
    setError(null); setSelectedId(null); setPanel(null);
    try {
      await analyse(scene, params, ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError(e instanceof Error ? e.message : 'Erreur pendant l\'analyse.');
    } finally {
      if (abortRef.current === ctrl) { setProgress(null); abortRef.current = null; }
    }
  }, [scene, analyse, params, runSearch]);

  const cancel = () => { abortRef.current?.abort(); abortRef.current = null; setProgress(null); };

  const setOriginAndReset = (o: Origin) => {
    setOrigin(o);
    setScene(null);            // la scène est indexée autour de l'ancien départ
    setOsm(null); setRawSpots([]); setSelectedId(null); setPanel(null); setPickMode(false);
  };

  const saveSpot = (s: Spot) => {
    if (savedKeys.has(savedKey(s))) return;
    const entry: SavedSpot = {
      id: `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      lat: s.lat, lng: s.lng, name: names[s.id] ?? '', note: '',
      status: 'todo', total: s.total, metrics: s.metrics, savedAt: Date.now(),
    };
    setSaved(prev => [entry, ...prev]);
  };

  const focusSaved = (s: SavedSpot) => {
    setPanel(null);
    const near = spots.find(x => haversine(x, s) < 60);
    if (near) setSelectedId(near.id);
  };

  const hasResults = spots.length > 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b1220] text-white" style={{ colorScheme: 'dark' }}>
      <div className="absolute inset-0">
        <BivouacMap
          origin={origin} radiusKm={settings.radiusKm} osm={osm} spots={spots} saved={saved}
          selectedId={selectedId} pickMode={pickMode} relief={relief} basemap={basemap} view3d={view3d}
          onSelect={setSelectedId}
          onPick={p => setOriginAndReset({ ...p, label: 'Point choisi' })}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />

      {/* barre haute */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <button onClick={() => setPanel('origin')}
            className="max-w-[62vw] truncate rounded-full bg-slate-900/70 px-3 py-2 text-left text-sm font-bold shadow-lg backdrop-blur active:scale-95">
            📍 {origin.label} <span className="font-normal text-white/50">· {settings.radiusKm} km</span>
          </button>
          {hasResults && (
            <button onClick={() => setPanel('list')}
              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-white shadow-lg active:scale-95">
              {spots.length} coins trouvés
            </button>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <RoundBtn onClick={() => setPanel('list')} label="Liste des résultats">📋</RoundBtn>
          <RoundBtn onClick={() => setPanel('weights')} label="Mes critères">⚖️</RoundBtn>
          <RoundBtn onClick={() => setPanel('saved')} label="Notre sélection" badge={saved.length}>⭐</RoundBtn>
          <RoundBtn onClick={() => setRelief(v => !v)} active={relief} label="Relief">⛰️</RoundBtn>
          <RoundBtn onClick={() => setPanel('settings')} label="Réglages">⚙️</RoundBtn>
        </div>
      </div>

      {/* fond de carte + vue 3D, discrets en bas à gauche */}
      <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-2">
        <div className="flex gap-1 rounded-full bg-slate-900/75 p-1 backdrop-blur">
          {([['plan', '🗺️', 'Plan'], ['sat', '🛰️', 'Satellite'], ['ign', '🇫🇷', 'IGN 20 cm (France)']] as const).map(([v, icon, title]) => (
            <button key={v} onClick={() => setBasemap(v)} title={title} aria-label={title}
              className={`rounded-full px-2.5 py-1 text-sm ${basemap === v ? 'bg-emerald-500' : ''}`}>{icon}</button>
          ))}
        </div>
        <button onClick={() => setView3d(v => !v)} aria-label="Vue 3D"
          className={`self-start rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur active:scale-95 ${view3d ? 'bg-emerald-500' : 'bg-slate-900/75'}`}>
          {view3d ? '3D ✓' : '3D'}
        </button>
      </div>

      {/* mode « placer le départ » */}
      {pickMode && (
        <div className="absolute inset-x-3 top-20 z-30 flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-3 text-sm backdrop-blur">
          <span className="flex-1">Touche la carte pour placer ton point de départ.</span>
          <button onClick={() => setPickMode(false)} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">Annuler</button>
        </div>
      )}

      {/* message d'erreur / d'information */}
      {(error || notice) && !progress && (
        <div className={`absolute inset-x-3 ${hasResults ? 'top-20' : 'bottom-28'} z-30 rounded-2xl border p-3 text-sm backdrop-blur ${error ? 'border-rose-400/40 bg-rose-500/15' : 'border-amber-400/40 bg-amber-500/15'}`}>
          <div className="flex items-start gap-2">
            <span className="flex-1 leading-snug">{error ?? notice}</span>
            <button onClick={() => { setError(null); setNotice(null); }} aria-label="Fermer"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-xs">✕</button>
          </div>
          {error && errorDetails.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-white/60">
              {errorDetails.map((d, i) => <li key={i}>· {d}</li>)}
            </ul>
          )}
          {error && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => void runSearch()} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold active:scale-95">
                Réessayer
              </button>
              {settings.radiusKm > 6 && (
                <button onClick={() => { setSettings({ ...settings, radiusKm: 6 }); setError(null); }}
                  className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold active:scale-95">
                  Réduire à 6 km
                </button>
              )}
              <button onClick={() => { setPinging(true); setPing(null); pingOverpass().then(setPing).catch(() => setPing([])).finally(() => setPinging(false)); }}
                disabled={pinging}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold active:scale-95 disabled:opacity-40">
                {pinging ? 'Test…' : '🔍 Tester la connexion'}
              </button>
            </div>
          )}
          {ping && (
            <div className="mt-2 rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed">
              {ping.map(p => (
                <div key={p.mirror} className={p.ok ? 'text-emerald-300' : 'text-rose-300'}>
                  {p.ok ? '✓' : '✗'} {p.mirror} — {p.detail} ({p.ms} ms)
                </div>
              ))}
              <p className="mt-1 text-white/60">
                {ping.some(p => p.ok)
                  ? "Les serveurs répondent : c'est donc la zone demandée qui est trop grande. Réduis le rayon."
                  : "Aucun serveur ne répond : un bloqueur de pub, un VPN ou le réseau bloque les requêtes. Essaie en 4G, ou dans un autre navigateur."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* écran d'accueil */}
      {!hasResults && !progress && !error && (
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-3xl border border-white/10 bg-[#111c2e]/95 p-4 shadow-2xl backdrop-blur-lg">
          <h1 className="text-lg font-black">🌲 Où bivouaquer ?</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-white/65">
            L'outil balaie la forêt autour de <b>{origin.label}</b> et note chaque coin : eau à proximité,
            profondeur de forêt, portage depuis la voiture, isolement, calme, terrain plat et temps de route.
          </p>
          <button onClick={() => void runSearch()}
            className="mt-3 w-full rounded-2xl bg-emerald-500 py-3.5 text-base font-black shadow-lg active:scale-95">
            Chercher des spots
          </button>
          <p className="mt-2 text-center text-[11px] text-white/40">
            Données OpenStreetMap · gratuit · rien n'est envoyé nulle part
          </p>
        </div>
      )}

      {/* relance discrète quand on a déjà des résultats */}
      {hasResults && !selected && !progress && (
        <button onClick={() => void runSearch()}
          className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur active:scale-95">
          ↻ Relancer la recherche
        </button>
      )}

      {selected && (
        <SpotCard
          spot={selected} rank={selectedRank} name={names[selected.id] ?? null}
          isSaved={savedKeys.has(savedKey(selected))}
          onSave={() => saveSpot(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {progress && <ProgressOverlay progress={progress} elapsed={elapsed} onCancel={cancel} />}

      {panel === 'origin' && (
        <OriginPanel origin={origin} onClose={() => setPanel(null)}
          onPick={setOriginAndReset}
          onPickOnMap={() => { setPanel(null); setPickMode(true); }} />
      )}
      {panel === 'weights' && (
        <WeightsPanel weights={weights} onChange={setWeights} onClose={() => setPanel(null)} />
      )}
      {panel === 'list' && (
        <ListPanel spots={spots} savedIds={savedKeys} onClose={() => setPanel(null)}
          onSelect={id => { setSelectedId(id); setPanel(null); }} />
      )}
      {panel === 'saved' && (
        <SavedPanel saved={saved} onChange={setSaved} onSelect={focusSaved} onClose={() => setPanel(null)} />
      )}
      {panel === 'settings' && (
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setPanel(null)}
          sceneReady={!!scene} onRescan={() => void rescan()} />
      )}
    </div>
  );
}
