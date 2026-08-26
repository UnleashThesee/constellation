// Bivouac — carte MapLibre (fonds OpenStreetMap libres, sans clé ni compte).
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ParsedOsm, SavedSpot, Spot, LatLng } from './types';
import { osmToGeoJson, circleGeoJson, linksGeoJson, EMPTY_FC } from './geojson';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
/** MNT libre (Terrarium) pour l'ombrage et le relief 3D. */
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Imagerie mondiale Esri : bonne résolution partout, sans clé. */
const SAT_WORLD = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
/** Ortho IGN 20 cm (France) — Géoplateforme, en accès libre. */
const SAT_IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

export type Basemap = 'plan' | 'sat' | 'ign';

type FC = FeatureCollection;
const EMPTY = EMPTY_FC;

function spotsToGeoJson(spots: Spot[]): FC {
  return {
    type: 'FeatureCollection',
    features: spots.map((s, i) => ({
      type: 'Feature' as const,
      properties: { id: s.id, total: s.total, rank: String(i + 1) },
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
    })),
  };
}

function savedToGeoJson(saved: SavedSpot[]): FC {
  return {
    type: 'FeatureCollection',
    features: saved.map(s => ({
      type: 'Feature' as const,
      properties: { id: s.id, status: s.status },
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
    })),
  };
}

const SCORE_COLOR: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'total'],
  30, '#ef4444', 45, '#f97316', 60, '#eab308', 75, '#84cc16', 90, '#22c55e',
];

export interface BivouacMapProps {
  origin: LatLng;
  radiusKm: number;
  osm: ParsedOsm | null;
  spots: Spot[];
  saved: SavedSpot[];
  selectedId: string | null;
  /** Quand actif, un tap sur la carte redéfinit le point de départ. */
  pickMode: boolean;
  relief: boolean;
  basemap: Basemap;
  /** Bascule en vue inclinée avec relief réel. */
  view3d: boolean;
  onSelect: (id: string | null) => void;
  onPick: (p: LatLng) => void;
}

export function BivouacMap({
  origin, radiusKm, osm, spots, saved, selectedId, pickMode, relief, basemap, view3d, onSelect, onPick,
}: BivouacMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const originMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Gardés à jour pour les gestionnaires d'évènements, enregistrés une seule fois
  // à l'initialisation de la carte : ils doivent voir les valeurs courantes.
  const pickRef = useRef(pickMode);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { pickRef.current = pickMode; }, [pickMode]);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // ── init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ref.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: STYLE,
        center: [origin.lng, origin.lat],
        zoom: 10.5,
        attributionControl: { compact: true },
      });
    } catch (e) {
      // Typiquement un appareil sans WebGL. Différé pour ne pas déclencher de
      // rendu en cascade depuis le corps de l'effet.
      const msg = e instanceof Error ? e.message : 'Carte indisponible.';
      queueMicrotask(() => setError(msg));
      return;
    }
    mapRef.current = map;
    // Seul un échec de chargement du fond est fatal. Une fois la carte affichée,
    // les erreurs sont des tuiles manquantes ponctuelles : les remonter ferait
    // disparaître la carte au premier trou de réseau.
    map.on('error', e => {
      const msg = e?.error?.message;
      if (!msg || readyRef.current) return;
      try { if (map.isStyleLoaded()) return; } catch { /* style pas encore prêt */ }
      setError(msg);
    });

    map.on('load', () => {
      // Imagerie posée par-dessus le fond vectoriel : basculer d'un fond à
      // l'autre ne recharge pas le style et ne détruit donc pas les calques.
      map.addSource('sat-world', { type: 'raster', tiles: [SAT_WORLD], tileSize: 256, maxzoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
      map.addLayer({ id: 'sat-world', type: 'raster', source: 'sat-world', layout: { visibility: 'none' } });
      map.addSource('sat-ign', { type: 'raster', tiles: [SAT_IGN], tileSize: 256, maxzoom: 19, attribution: 'IGN — Géoplateforme' });
      map.addLayer({ id: 'sat-ign', type: 'raster', source: 'sat-ign', layout: { visibility: 'none' } });

      map.addSource('zone', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'zone-line', type: 'line', source: 'zone',
        paint: { 'line-color': '#a78bfa', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.8 },
      });

      map.addSource('forests', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'forests-fill', type: 'fill', source: 'forests',
        paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.16 },
      });
      map.addLayer({
        id: 'forests-line', type: 'line', source: 'forests',
        paint: { 'line-color': '#15803d', 'line-width': 0.8, 'line-opacity': 0.5 },
      });

      map.addSource('water', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'water-line', type: 'line', source: 'water',
        paint: { 'line-color': '#38bdf8', 'line-width': 1.8, 'line-opacity': 0.85 },
      });

      map.addSource('saved', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'saved-dot', type: 'circle', source: 'saved',
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'status'], 'good', '#22c55e', 'bad', '#64748b', '#eab308'],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.9,
        },
      });

      // Liaisons du spot sélectionné vers ce qui compte autour de lui.
      map.addSource('links', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'links-line', type: 'line', source: 'links',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'], 'line-width': 2.5,
          'line-dasharray': [2, 1.5], 'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'links-label', type: 'symbol', source: 'links',
        layout: {
          'text-field': ['get', 'label'], 'text-size': 11,
          'text-font': ['Noto Sans Bold'], 'symbol-placement': 'line-center',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#0b1220', 'text-halo-width': 1.6 },
      });

      map.addSource('spots', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'spots-halo', type: 'circle', source: 'spots',
        paint: { 'circle-radius': 16, 'circle-color': SCORE_COLOR, 'circle-opacity': 0.18 },
      });
      map.addLayer({
        id: 'spots-dot', type: 'circle', source: 'spots',
        paint: {
          'circle-radius': 11, 'circle-color': SCORE_COLOR,
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'spots-rank', type: 'symbol', source: 'spots',
        layout: {
          'text-field': ['get', 'rank'], 'text-size': 11,
          'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true,
        },
        paint: { 'text-color': '#0b1220' },
      });

      for (const id of ['spots-dot', 'spots-halo', 'spots-rank']) {
        map.on('click', id, (e) => {
          if (pickRef.current) return;
          const f = e.features?.[0];
          if (f) { e.preventDefault(); onSelectRef.current(String(f.properties?.id)); }
        });
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }

      map.on('click', (e) => {
        if (pickRef.current) { onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }); return; }
        if (e.defaultPrevented) return;
        const hit = map.queryRenderedFeatures(e.point, { layers: ['spots-dot', 'spots-halo', 'spots-rank'] });
        if (hit.length === 0) onSelectRef.current(null);
      });

      readyRef.current = true;
      setReady(true);
    });

    const ro = new ResizeObserver(() => { try { map.resize(); } catch { /* ignore */ } });
    ro.observe(ref.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; originMarker.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── données ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const { forests, water } = osmToGeoJson(osm);
    (map.getSource('forests') as maplibregl.GeoJSONSource | undefined)?.setData(forests);
    (map.getSource('water') as maplibregl.GeoJSONSource | undefined)?.setData(water);
  }, [osm, ready]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    (map.getSource('spots') as maplibregl.GeoJSONSource | undefined)?.setData(spotsToGeoJson(spots));
  }, [spots, ready]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    (map.getSource('saved') as maplibregl.GeoJSONSource | undefined)?.setData(savedToGeoJson(saved));
  }, [saved, ready]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    (map.getSource('zone') as maplibregl.GeoJSONSource | undefined)?.setData(circleGeoJson(origin, radiusKm));
  }, [origin, radiusKm, ready]);

  // marqueur du point de départ
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    if (!originMarker.current) {
      const el = document.createElement('div');
      el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#a78bfa;border:3px solid #fff;box-shadow:0 0 0 4px rgba(167,139,250,.35);';
      el.title = 'Point de départ';
      originMarker.current = new maplibregl.Marker({ element: el }).setLngLat([origin.lng, origin.lat]).addTo(map);
    } else {
      originMarker.current.setLngLat([origin.lng, origin.lat]);
    }
  }, [origin, ready]);

  // mise en avant du spot sélectionné
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const sel = selectedId ?? '__none__';
    map.setPaintProperty('spots-dot', 'circle-radius', ['case', ['==', ['get', 'id'], sel], 15, 11]);
    map.setPaintProperty('spots-dot', 'circle-stroke-color', ['case', ['==', ['get', 'id'], sel], '#0b1220', '#ffffff']);
    map.setPaintProperty('spots-halo', 'circle-radius', ['case', ['==', ['get', 'id'], sel], 30, 16]);
  }, [selectedId, ready]);

  // recentrage sur le spot choisi
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !selectedId) return;
    const s = spots.find(x => x.id === selectedId);
    if (s) map.easeTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 14), duration: 700 });
  }, [selectedId, spots, ready]);

  // fond de carte (plan / satellite monde / ortho IGN)
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    try {
      map.setLayoutProperty('sat-world', 'visibility', basemap === 'sat' ? 'visible' : 'none');
      map.setLayoutProperty('sat-ign', 'visibility', basemap === 'ign' ? 'visible' : 'none');
      // Sur imagerie, la teinte verte des forêts nuit à la lecture : on l'efface.
      map.setPaintProperty('forests-fill', 'fill-opacity', basemap === 'plan' ? 0.16 : 0);
    } catch { /* calques absents */ }
  }, [basemap, ready]);

  // liaisons vers l'eau et l'accès du spot sélectionné
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const src = map.getSource('links') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const s = selectedId ? spots.find(x => x.id === selectedId) : null;
    src.setData(s ? linksGeoJson(s) : EMPTY);
  }, [selectedId, spots, ready]);

  // vue 3D : relief réel + caméra inclinée
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    try {
      if (view3d) {
        if (!map.getSource('dem')) {
          map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 13 });
        }
        map.setTerrain({ source: 'dem', exaggeration: 1.4 });
        map.easeTo({ pitch: 62, duration: 900 });
      } else {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      }
    } catch { /* relief indisponible : la carte reste plate */ }
  }, [view3d, ready]);

  // relief ombré (optionnel)
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    try {
      if (relief) {
        if (!map.getSource('dem')) {
          map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 13 });
        }
        if (!map.getLayer('hillshade')) {
          map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.45 } }, 'forests-fill');
        }
      } else if (map.getLayer('hillshade')) {
        map.removeLayer('hillshade');
      }
    } catch { /* le fond ne supporte pas le relief : sans conséquence */ }
  }, [relief, ready]);

  // cadrage sur la zone après une recherche
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || spots.length === 0) return;
    const b = new maplibregl.LngLatBounds([origin.lng, origin.lat], [origin.lng, origin.lat]);
    for (const s of spots) b.extend([s.lng, s.lat]);
    map.fitBounds(b, { padding: { top: 90, bottom: 190, left: 40, right: 40 }, duration: 800, maxZoom: 13 });
  }, [spots, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  if (error) {
    // Les messages de MapLibre sont parfois du JSON brut : on les traduit.
    const friendly = /webgl/i.test(error)
      ? "Ce navigateur ne peut pas afficher la carte : WebGL est indisponible. Essaie un autre navigateur, ou désactive le mode économie d'énergie / données."
      : error.trimStart().startsWith('{')
        ? "Le fond de carte n'a pas pu être chargé. Vérifie ta connexion."
        : error;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0b1220] p-6 text-center">
        <div className="text-3xl">🗺️</div>
        <p className="text-sm font-semibold text-rose-300">Carte indisponible</p>
        <p className="max-w-xs text-xs leading-relaxed text-slate-400">{friendly}</p>
        <p className="max-w-xs text-[11px] text-slate-500">
          La recherche de spots fonctionne quand même : ouvre la liste 📋 pour voir les résultats.
        </p>
      </div>
    );
  }
  return <div ref={ref} className="h-full w-full" />;
}
