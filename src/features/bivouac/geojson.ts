// Bivouac — conversion des données OSM analysées en GeoJSON pour la carte.
import type { FeatureCollection } from 'geojson';
import type { LatLng, ParsedOsm } from './types';

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
