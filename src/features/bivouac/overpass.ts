// Bivouac — accès aux données OpenStreetMap via l'API Overpass (gratuite, sans clé).
import type { BBox, LatLng, OsmElement, OsmPt, ParsedOsm } from './types';

/** Miroirs publics, essayés dans l'ordre. */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const ACCESS_HW = 'track|unclassified|residential|service|tertiary';
const NOISE_HW = 'motorway|trunk|primary|secondary|motorway_link|trunk_link';

/** Construit la requête Overpass QL pour une emprise donnée. */
export function buildQuery(b: BBox, timeout = 180): string {
  const bb = `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`;
  return `[out:json][timeout:${timeout}];
(
  way["landuse"="forest"](${bb});
  way["natural"="wood"](${bb});
  relation["landuse"="forest"](${bb});
  relation["natural"="wood"](${bb});
  way["natural"="water"](${bb});
  way["waterway"~"^(river|stream|canal)$"](${bb});
  relation["natural"="water"](${bb});
  node["natural"="spring"](${bb});
  way["highway"~"^(${ACCESS_HW})$"](${bb});
  way["amenity"="parking"](${bb});
  way["highway"~"^(${NOISE_HW})$"](${bb});
  way["railway"="rail"](${bb});
  node["place"~"^(city|town|village|hamlet|isolated_dwelling|farm)$"](${bb});
  way["landuse"="residential"](${bb});
);
out geom;`;
}

const pt = (p: OsmPt): LatLng => ({ lat: p.lat, lng: p.lon });

/** Recolle des tronçons en anneaux fermés (membres de multipolygones). */
export function stitchRings(lines: LatLng[][]): LatLng[][] {
  const k = (p: LatLng) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`;
  const closed = (l: LatLng[]) => l.length >= 4 && k(l[0]) === k(l[l.length - 1]);
  const open: LatLng[][] = [];
  const rings: LatLng[][] = [];

  for (const line of lines) {
    if (line.length < 2) continue;
    let cur = line.slice();
    for (;;) {
      if (closed(cur)) break;
      let merged = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i];
        if (k(o[o.length - 1]) === k(cur[0])) { cur = o.concat(cur.slice(1)); open.splice(i, 1); merged = true; break; }
        if (k(o[o.length - 1]) === k(cur[cur.length - 1])) { cur = o.concat(cur.slice().reverse().slice(1)); open.splice(i, 1); merged = true; break; }
        if (k(o[0]) === k(cur[cur.length - 1])) { cur = cur.concat(o.slice(1)); open.splice(i, 1); merged = true; break; }
        if (k(o[0]) === k(cur[0])) { cur = cur.slice().reverse().concat(o.slice(1)); open.splice(i, 1); merged = true; break; }
      }
      if (!merged) break;
    }
    if (closed(cur)) rings.push(cur); else open.push(cur);
  }
  // Ce qui n'a pas pu être refermé (tronçon coupé par l'emprise) est fermé d'office.
  for (const o of open) if (o.length >= 3) rings.push(o.concat([o[0]]));
  return rings;
}

function wayGeom(el: OsmElement): LatLng[] | null {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return null;
  return el.geometry.map(pt);
}

/** Classe les éléments Overpass bruts par usage. */
export function parseOsm(elements: OsmElement[]): ParsedOsm {
  const out: ParsedOsm = {
    forests: [], water: [], springs: [], access: [], noise: [], habitatPoints: [], habitatAreas: [],
  };

  for (const el of elements) {
    const tags = el.tags ?? {};

    if (el.type === 'node') {
      if (tags.natural === 'spring') out.springs.push({ lat: el.lat, lng: el.lon });
      else if (tags.place) out.habitatPoints.push({ lat: el.lat, lng: el.lon });
      continue;
    }

    const isForest = tags.landuse === 'forest' || tags.natural === 'wood';
    const isWaterArea = tags.natural === 'water';

    if (el.type === 'relation') {
      const parts = (el.members ?? [])
        .filter(m => m.type === 'way' && m.geometry && m.geometry.length >= 2)
        .map(m => m.geometry!.map(pt));
      if (parts.length === 0) continue;
      const rings = stitchRings(parts);
      if (rings.length === 0) continue;
      if (isForest) out.forests.push(rings);
      else if (isWaterArea) for (const r of rings) out.water.push(r);
      continue;
    }

    const g = wayGeom(el);
    if (!g) continue;

    if (isForest) { out.forests.push([g]); continue; }
    if (isWaterArea) { out.water.push(g); continue; }
    if (tags.waterway === 'river' || tags.waterway === 'stream' || tags.waterway === 'canal') { out.water.push(g); continue; }
    if (tags.landuse === 'residential') { out.habitatAreas.push(g); continue; }
    if (tags.amenity === 'parking') { out.access.push(g); continue; }
    if (tags.railway === 'rail') { out.noise.push(g); continue; }
    if (tags.highway) {
      if (new RegExp(`^(${NOISE_HW})$`).test(tags.highway)) out.noise.push(g);
      else if (new RegExp(`^(${ACCESS_HW})$`).test(tags.highway)) out.access.push(g);
    }
  }
  return out;
}

export type OverpassFailure = 'busy' | 'timeout' | 'network' | 'server';

export class OverpassError extends Error {
  readonly kind: OverpassFailure;
  constructor(message: string, kind: OverpassFailure) {
    super(message);
    this.name = 'OverpassError';
    this.kind = kind;
  }
}

function classifyFailure(status: number, body: string): OverpassError {
  if (status === 429) return new OverpassError('Serveur Overpass saturé (trop de requêtes). Réessaie dans un instant ou change de miroir.', 'busy');
  if (status === 504 || /timed out|timeout/i.test(body)) return new OverpassError("La requête a dépassé le temps imparti : réduis le rayon de recherche.", 'timeout');
  return new OverpassError(`Overpass a répondu ${status}.`, 'server');
}

export interface FetchOpts {
  signal?: AbortSignal;
  mirrors?: string[];
  onMirror?: (url: string, attempt: number) => void;
}

/** Interroge Overpass en basculant de miroir en miroir en cas d'échec. */
export async function fetchOverpass(query: string, opts: FetchOpts = {}): Promise<OsmElement[]> {
  const mirrors = opts.mirrors ?? OVERPASS_MIRRORS;
  let last: unknown = null;

  for (let i = 0; i < mirrors.length; i++) {
    const url = mirrors[i];
    opts.onMirror?.(url, i + 1);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: opts.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw classifyFailure(res.status, body);
      }
      const json = await res.json() as { elements?: OsmElement[] };
      if (!json || !Array.isArray(json.elements)) throw new OverpassError('Réponse Overpass illisible.', 'server');
      return json.elements;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      last = e;
      // on tente le miroir suivant
    }
  }
  if (last instanceof OverpassError) throw last;
  throw new OverpassError(
    "Impossible de joindre OpenStreetMap. Vérifie ta connexion (les serveurs Overpass sont parfois saturés le soir).",
    'network',
  );
}
