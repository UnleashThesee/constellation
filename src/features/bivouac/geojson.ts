// Bivouac — conversion des données OSM analysées en GeoJSON pour la carte.
import type { FeatureCollection } from 'geojson';
import type { LatLng, ParsedOsm, Spot, Surroundings } from './types';

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

export function osmToGeoJson(osm: ParsedOsm | null): { forests: FeatureCollection; water: FeatureCollection } {
  if (!osm) return { forests: EMPTY_FC, water: EMPTY_FC };
  return {
    forests: {
      type: 'FeatureCollection',
      features: osm.forests.map(rings => ({
        type: 'Feature' as const, properties: {},
        geometry: { type: 'Polygon' as const, coordinates: rings.map(r => r.map(p => [p.lng, p.lat])) },
      })),
    },
    water: {
      type: 'FeatureCollection',
      features: osm.water.map(line => ({
        type: 'Feature' as const, properties: {},
        geometry: { type: 'LineString' as const, coordinates: line.map(p => [p.lng, p.lat]) },
      })),
    },
  };
}

/**
 * Traits reliant un spot à ce qui l'entoure : c'est la lecture visuelle de
 * l'analyse spatiale — on voit d'un coup d'œil où descendre se baigner et par
 * où arriver, au lieu de lire des distances.
 */
export function linksGeoJson(spot: Spot): FeatureCollection {
  const a = spot.around;
  if (!a) return EMPTY_FC;
  const from: [number, number] = [spot.lng, spot.lat];
  const legs: { key: keyof Surroundings; color: string; label: string }[] = [
    { key: 'swim', color: '#38bdf8', label: '🏊' },
    { key: 'water', color: '#7dd3fc', label: '💧' },
    { key: 'access', color: '#fbbf24', label: '🚗' },
  ];
  const features: FeatureCollection['features'] = [];
  for (const leg of legs) {
    const hit = a[leg.key];
    if (!hit) continue;
    // L'eau utilitaire est masquée si elle se confond avec la baignade.
    if (leg.key === 'water' && a.swim && Math.abs(a.swim.dist - hit.dist) < 40) continue;
    const m = Math.round(hit.dist);
    features.push({
      type: 'Feature',
      properties: { color: leg.color, label: `${leg.label} ${m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'}` },
      geometry: { type: 'LineString', coordinates: [from, [hit.point.lng, hit.point.lat]] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Cercle géodésique approché, pour matérialiser la zone de recherche. */
export function circleGeoJson(center: LatLng, radiusKm: number): FeatureCollection {
  const pts: [number, number][] = [];
  const latR = radiusKm / 110.574;
  const lngR = radiusKm / (111.320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }],
  };
}
