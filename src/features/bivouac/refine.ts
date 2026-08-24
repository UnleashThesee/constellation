// Bivouac — affinage des meilleurs spots : pente réelle (altimétrie) et temps
// de route réel. Les deux services sont gratuits et sans clé, et les deux
// échecs sont sans gravité : on garde alors l'estimation.
import type { LatLng, Spot } from './types';

const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const OSRM_URL = 'https://router.project-osrm.org/table/v1/driving';

/** Écart d'échantillonnage : au-dessus de la résolution du MNT (~90 m). */
export const SAMPLE_M = 120;

/**
 * Pente en % à partir de 4 altitudes cardinales espacées de 2·d.
 * Gradient central classique : plus robuste qu'une simple différence.
 */
export function slopeFromSamples(north: number, south: number, east: number, west: number, d: number): number {
  const dzdy = (north - south) / (2 * d);
  const dzdx = (east - west) / (2 * d);
  return Math.hypot(dzdx, dzdy) * 100;
}

/** Décale un point de (dx, dy) mètres. */
function offset(p: LatLng, dx: number, dy: number): LatLng {
  const dLat = dy / 111320;
  const dLng = dx / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Récupère la pente de chaque spot. 5 points par spot (centre + 4 cardinaux),
 * 100 points maxi par requête → 20 spots par appel.
 */
export async function fetchSlopes(spots: Spot[], signal?: AbortSignal): Promise<Map<string, { slopePct: number; elevation: number }>> {
  const out = new Map<string, { slopePct: number; elevation: number }>();

  for (const group of chunk(spots, 20)) {
    const pts: LatLng[] = [];
    for (const s of group) {
      const c = { lat: s.lat, lng: s.lng };
      pts.push(c,
        offset(c, 0, SAMPLE_M), offset(c, 0, -SAMPLE_M),
        offset(c, SAMPLE_M, 0), offset(c, -SAMPLE_M, 0));
    }
    const url = `${ELEVATION_URL}?latitude=${pts.map(p => p.lat.toFixed(5)).join(',')}` +
      `&longitude=${pts.map(p => p.lng.toFixed(5)).join(',')}`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Altimétrie indisponible (${res.status}).`);
    const json = await res.json() as { elevation?: number[] };
    const el = json.elevation;
    if (!Array.isArray(el) || el.length < group.length * 5) throw new Error('Réponse altimétrique incomplète.');

    group.forEach((s, i) => {
      const [c, n, sth, e, w] = el.slice(i * 5, i * 5 + 5);
      if ([c, n, sth, e, w].some(v => typeof v !== 'number')) return;
      out.set(s.id, { slopePct: slopeFromSamples(n, sth, e, w, SAMPLE_M), elevation: c });
    });
  }
  return out;
}

/** Temps de route réels depuis l'origine, via le serveur public OSRM. */
export async function fetchDriveTimes(spots: Spot[], origin: LatLng, signal?: AbortSignal): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  for (const group of chunk(spots, 60)) {
    const coords = [origin, ...group.map(s => ({ lat: s.lat, lng: s.lng }))]
      .map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
    const res = await fetch(`${OSRM_URL}/${coords}?sources=0&annotations=duration`, { signal });
    if (!res.ok) throw new Error(`Calcul d'itinéraire indisponible (${res.status}).`);
    const json = await res.json() as { code?: string; durations?: (number | null)[][] };
    if (json.code !== 'Ok' || !json.durations?.[0]) throw new Error("Réponse d'itinéraire illisible.");
    const row = json.durations[0];
    group.forEach((s, i) => {
      const sec = row[i + 1];
      if (typeof sec === 'number' && isFinite(sec)) out.set(s.id, sec / 60);
    });
  }
  return out;
}

export interface RefineResult {
  spots: Spot[];
  slopeOk: boolean;
  driveOk: boolean;
  notes: string[];
}

/**
 * Affine les `limit` premiers spots. Chaque service est tenté indépendamment :
 * si l'un tombe, l'autre bénéficie quand même au résultat.
 */
export async function refineSpots(
  spots: Spot[], origin: LatLng, limit = 30, signal?: AbortSignal,
): Promise<RefineResult> {
  const head = spots.slice(0, limit);
  const notes: string[] = [];

  const [slopes, drives] = await Promise.all([
    fetchSlopes(head, signal).catch((e: unknown) => {
      if (!signal?.aborted) notes.push(`Pente non mesurée : ${e instanceof Error ? e.message : 'service indisponible'}`);
      return null;
    }),
    fetchDriveTimes(head, origin, signal).catch((e: unknown) => {
      if (!signal?.aborted) notes.push(`Trajets estimés : ${e instanceof Error ? e.message : 'service indisponible'}`);
      return null;
    }),
  ]);

  const updated = spots.map(s => {
    const sl = slopes?.get(s.id);
    const dr = drives?.get(s.id);
    if (!sl && dr === undefined) return s;
    return {
      ...s,
      metrics: {
        ...s.metrics,
        ...(sl ? { slopePct: sl.slopePct } : {}),
        ...(dr !== undefined ? { driveMin: dr } : {}),
      },
    };
  });

  return { spots: updated, slopeOk: !!slopes, driveOk: !!drives, notes };
}
