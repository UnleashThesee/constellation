// Fête de la Musique — carte 3D LIBRE (MapLibre + OpenStreetMap, sans clé, gratuite).
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Stage, GeoPoint } from './types';
import type { Peer } from './presence';
import { buildPin, type PinData } from './pin';

// Fond de carte vectoriel libre (OpenStreetMap), sans clé ni compte.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function friendPin(color: string, name: string): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  d.innerHTML = `
    <div style="background:rgba(0,0,0,.7);color:${color};font:700 10px/1.1 system-ui;padding:2px 6px;border-radius:6px;white-space:nowrap;">${name}</div>
    <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 3px ${color}55;margin-top:2px;"></div>`;
  return d;
}

export function MapLibreMap({ stages, pinData, userPos, focusId, onSelect, others = [] }: {
  stages: Stage[];
  pinData: Record<string, PinData>;
  userPos?: GeoPoint;
  focusId?: string | null;
  onSelect: (id: string) => void;
  others?: Peer[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const userMarker = useRef<Marker | null>(null);
  const peerMarkers = useRef<Record<string, Marker>>({});
  const sigRef = useRef('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // init carte (une fois)
  useEffect(() => {
    if (!ref.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: STYLE,
        center: stages[0] ? [stages[0].lng, stages[0].lat] : [5.0398, 47.3221],
        zoom: 15, pitch: 52, bearing: -12,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Carte indisponible.'); return; }
    map.on('error', (e) => { if (e?.error?.message) setError(e.error.message); });
    map.on('load', () => {
      // bâtiments en 3D (relief)
      try {
        if (map.getSource('openmaptiles')) {
          map.addLayer({
            id: 'fete-3d', source: 'openmaptiles', 'source-layer': 'building',
            type: 'fill-extrusion', minzoom: 14,
            paint: {
              'fill-extrusion-color': '#4a3d5c',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.85,
            },
          });
        }
      } catch { /* style sans couche bâtiments : on garde la 2D inclinée */ }
      setReady(true);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markers.current = {}; userMarker.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // marqueurs des scènes (recréés seulement quand le contenu change)
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const sig = stages.map(s => `${s.id},${s.lat},${s.lng}`).join('|') + '#' + JSON.stringify(pinData);
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    for (const m of Object.values(markers.current)) m.remove();
    markers.current = {};
    for (const s of stages) {
      const d = pinData[s.id]; if (!d) continue;
      const el = buildPin(d);
      el.addEventListener('click', () => onSelect(s.id));
      markers.current[s.id] = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([s.lng, s.lat]).addTo(map);
    }
  }, [stages, pinData, ready, onSelect]);

  // position utilisateur
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    if (userMarker.current) { userMarker.current.remove(); userMarker.current = null; }
    if (!userPos) return;
    const dot = document.createElement('div');
    dot.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.35);';
    userMarker.current = new maplibregl.Marker({ element: dot }).setLngLat([userPos.lng, userPos.lat]).addTo(map);
  }, [userPos, ready]);

  // autres participants (positions partagées) — recréation propre à chaque sync
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    for (const m of Object.values(peerMarkers.current)) m.remove();
    peerMarkers.current = {};
    for (const p of others) {
      if (p.lat === undefined || p.lng === undefined) continue;
      peerMarkers.current[p.id] = new maplibregl.Marker({ element: friendPin(p.color, p.name), anchor: 'bottom' })
        .setLngLat([p.lng, p.lat]).addTo(map);
    }
  }, [others, ready]);

  // focus sur une scène
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !focusId) return;
    const s = stages.find(x => x.id === focusId);
    if (s) map.flyTo({ center: [s.lng, s.lat], zoom: 17, pitch: 55, duration: 800 });
  }, [focusId, ready, stages]);

  if (error) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
        <p className="text-sm font-semibold text-rose-300">Carte indisponible</p>
        <p className="max-w-xs text-xs text-slate-400">{error}</p>
      </div>
    );
  }
  return <div ref={ref} className="h-full min-h-[340px] w-full overflow-hidden rounded-2xl border border-white/10" />;
}
