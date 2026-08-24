// Bivouac — recherche de lieux (Nominatim) et liens vers les outils externes.
import type { LatLng } from './types';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export interface PlaceHit { label: string; lat: number; lng: number }

interface NominatimHit { display_name?: string; name?: string; lat?: string; lon?: string }

/** Recherche d'adresse / de lieu (mondial : l'outil n'est pas limité à la France). */
export async function searchPlace(query: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&addressdetails=0`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Recherche indisponible (${res.status}).`);
  const json = await res.json() as NominatimHit[];
  return (Array.isArray(json) ? json : [])
    .filter(h => h.lat && h.lon)
    .map(h => ({ label: h.display_name ?? h.name ?? q, lat: parseFloat(h.lat!), lng: parseFloat(h.lon!) }));
}

interface ReverseHit { display_name?: string; address?: Record<string, string> }

/** Nom lisible d'un point (« Forêt de Velours, Côte-d'Or »). */
export async function reverseName(p: LatLng, signal?: AbortSignal): Promise<string | null> {
  const url = `${NOMINATIM}/reverse?lat=${p.lat.toFixed(6)}&lon=${p.lng.toFixed(6)}&format=jsonv2&zoom=14`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json() as ReverseHit;
  const a = json.address ?? {};
  const parts = [
    a.forest ?? a.wood ?? a.natural ?? a.hamlet ?? a.village ?? a.town ?? a.municipality,
    a.county ?? a.state,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : (json.display_name?.split(',').slice(0, 2).join(',') ?? null);
}

// ── Liens externes ───────────────────────────────────────────────────────────

/** Itinéraire voiture dans Google Maps. */
export const driveUrl = (p: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&travelmode=driving`;

/** Vue satellite Google (repérer les clairières et l'accès réel). */
export const satelliteUrl = (p: LatLng) =>
  `https://www.google.com/maps/@?api=1&map_action=map&center=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&zoom=17&basemap=satellite`;

/** Géoportail IGN : ortho + cartes topo, la référence pour le terrain en France. */
export const ignUrl = (p: LatLng) =>
  `https://www.geoportail.gouv.fr/carte?c=${p.lng.toFixed(6)},${p.lat.toFixed(6)}&z=17` +
  `&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)` +
  `&l1=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2::GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2(0.6)&permalink=yes`;

/** OpenStreetMap centré sur le point. */
export const osmUrl = (p: LatLng) =>
  `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lng.toFixed(6)}#map=16/${p.lat.toFixed(5)}/${p.lng.toFixed(5)}`;

/** ONDE : savoir si les petits cours d'eau du secteur coulent encore en été. */
export const ondeUrl = () => 'https://onde.eaufrance.fr/';

/** Coordonnées prêtes à coller (GPS, partage). */
export const coordText = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** Ouvre la zone dans Overpass Turbo pour creuser les données OSM à la main. */
export function overpassTurboUrl(query: string, p: LatLng): string {
  return `https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&C=${p.lat.toFixed(5)};${p.lng.toFixed(5)};13`;
}
