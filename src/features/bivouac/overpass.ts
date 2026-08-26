// Bivouac — accès aux données OpenStreetMap via l'API Overpass (gratuite, sans clé).
import type { BBox, LatLng, OsmElement, OsmPt, ParsedOsm } from './types';

/** Miroirs publics, essayés dans l'ordre. */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

// Volontairement restreint : chaque tag en plus alourdit la réponse, et une
// réponse trop grosse fait tomber la requête avant même de revenir.
const ACCESS_HW = 'track|unclassified|tertiary';
const NOISE_HW = 'motorway|trunk|primary|secondary';

const bb = (b: BBox) =>
  `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`;

export interface QueryPart {
  id: 'forest' | 'water' | 'access';
  label: string;
  query: string;
  /** Sans cette partie, la recherche n'a pas de sens. */
  essential: boolean;
}

/**
 * Découpe la collecte en plusieurs requêtes légères plutôt qu'une seule énorme.
 * Trois requêtes courtes passent là où une seule grosse expire, et l'échec de
 * l'une n'emporte pas les autres.
 */
export function buildQueryParts(b: BBox, timeout = 90): QueryPart[] {
  const a = bb(b);
  return [
    {
      id: 'forest', label: 'forêts', essential: true,
      query: `[out:json][timeout:${timeout}];
(
  way["landuse"="forest"](${a});
  way["natural"="wood"](${a});
  relation["landuse"="forest"](${a});
  relation["natural"="wood"](${a});
);
out geom;`,
    },
    {
      id: 'water', label: "cours d'eau", essential: false,
      query: `[out:json][timeout:${timeout}];
(
  way["waterway"~"^(river|stream|canal)$"](${a});
  way["natural"="water"](${a});
  relation["natural"="water"](${a});
  node["natural"="spring"](${a});
);
out geom;`,
    },
    {
      id: 'access', label: 'accès & habitations', essential: false,
      query: `[out:json][timeout:${timeout}];
(
  way["highway"~"^(${ACCESS_HW})$"](${a});
  way["amenity"="parking"](${a});
  way["highway"~"^(${NOISE_HW})$"](${a});
  way["railway"="rail"](${a});
  node["place"~"^(city|town|village|hamlet|isolated_dwelling|farm)$"](${a});
  way["landuse"="residential"](${a});
);
out geom;`,
    },
  ];
}

/** Requête unique équivalente — sert au lien « ouvrir dans Overpass Turbo ». */
export function buildQuery(b: BBox, timeout = 180): string {
  const a = bb(b);
  return `[out:json][timeout:${timeout}];
(
  way["landuse"="forest"](${a});
  way["natural"="wood"](${a});
  relation["landuse"="forest"](${a});
  relation["natural"="wood"](${a});
  way["waterway"~"^(river|stream|canal)$"](${a});
  way["natural"="water"](${a});
  way["highway"~"^(${ACCESS_HW})$"](${a});
  way["highway"~"^(${NOISE_HW})$"](${a});
  node["place"~"^(city|town|village|hamlet|isolated_dwelling|farm)$"](${a});
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

export function emptyOsm(): ParsedOsm {
  return { forests: [], water: [], springs: [], access: [], noise: [], habitatPoints: [], habitatAreas: [] };
}

/** Classe les éléments Overpass bruts par usage. */
export function parseOsm(elements: OsmElement[]): ParsedOsm {
  const out = emptyOsm();

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

// ── erreurs ──────────────────────────────────────────────────────────────────

export type OverpassFailure = 'busy' | 'timeout' | 'network' | 'server';

export class OverpassError extends Error {
  readonly kind: OverpassFailure;
  /** Ce qu'a répondu chaque miroir, pour pouvoir diagnostiquer. */
  readonly details: string[];
  constructor(message: string, kind: OverpassFailure, details: string[] = []) {
    super(message);
    this.name = 'OverpassError';
    this.kind = kind;
    this.details = details;
  }
}

const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

function classifyStatus(status: number, body: string): { kind: OverpassFailure; text: string } {
  if (status === 429) return { kind: 'busy', text: 'saturé (429)' };
  if (status === 504 || /timed out|timeout/i.test(body)) return { kind: 'timeout', text: 'délai dépassé (504)' };
  if (status === 400) return { kind: 'server', text: 'requête refusée (400)' };
  return { kind: 'server', text: `réponse ${status}` };
}

/** Combine le signal d'annulation de l'utilisateur avec un délai maximum. */
function withDeadline(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  try {
    const timer = AbortSignal.timeout(ms);
    if (!signal) return timer;
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timer]);
  } catch { /* API absente : on garde le signal utilisateur seul */ }
  return signal;
}

export interface FetchOpts {
  signal?: AbortSignal;
  mirrors?: string[];
  /** Délai maximum côté navigateur, en ms. */
  deadlineMs?: number;
  onMirror?: (url: string, attempt: number) => void;
}

/**
 * Interroge Overpass en basculant de miroir en miroir.
 * En cas d'échec total, l'erreur porte le détail miroir par miroir : c'est la
 * seule façon de distinguer « serveurs saturés » de « réseau qui bloque ».
 */
export async function fetchOverpass(query: string, opts: FetchOpts = {}): Promise<OsmElement[]> {
  const mirrors = opts.mirrors ?? OVERPASS_MIRRORS;
  const deadline = opts.deadlineMs ?? 150_000;
  const details: string[] = [];
  let worst: OverpassFailure = 'network';

  for (let i = 0; i < mirrors.length; i++) {
    const url = mirrors[i];
    opts.onMirror?.(url, i + 1);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: withDeadline(opts.signal, deadline),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const c = classifyStatus(res.status, body);
        details.push(`${host(url)} : ${c.text}`);
        worst = c.kind;
        continue;
      }
      const json = await res.json() as { elements?: OsmElement[] };
      if (!json || !Array.isArray(json.elements)) {
        details.push(`${host(url)} : réponse illisible`);
        worst = 'server';
        continue;
      }
      return json.elements;
    } catch (e) {
      // Annulation volontaire de l'utilisateur : on ne tente pas les suivants.
      if (opts.signal?.aborted) throw e;
      const isTimeout = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
      details.push(`${host(url)} : ${isTimeout ? 'pas de réponse à temps' : 'connexion impossible'}`);
      if (isTimeout) worst = 'timeout';
    }
  }

  const message = worst === 'timeout'
    ? "Les serveurs OpenStreetMap n'ont pas répondu à temps. C'est presque toujours une zone trop grande : réduis le rayon dans les réglages."
    : worst === 'busy'
      ? 'Les serveurs OpenStreetMap sont saturés en ce moment. Réessaie dans une minute.'
      : "Impossible de joindre OpenStreetMap. Réduis le rayon, et vérifie qu'un bloqueur de pub ou un VPN ne bloque pas la requête.";
  throw new OverpassError(message, worst, details);
}

export interface PingResult { mirror: string; ok: boolean; detail: string; ms: number }

/**
 * Requête minuscule pour savoir si Overpass est joignable tout court.
 * Sépare « le réseau bloque » de « ma requête est trop lourde ».
 */
export async function pingOverpass(signal?: AbortSignal): Promise<PingResult[]> {
  const query = '[out:json][timeout:10];node(1);out;';
  const out: PingResult[] = [];
  for (const url of OVERPASS_MIRRORS) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: withDeadline(signal, 15_000),
      });
      const ms = Date.now() - t0;
      if (res.ok) { await res.text().catch(() => ''); out.push({ mirror: host(url), ok: true, detail: 'joignable', ms }); }
      else out.push({ mirror: host(url), ok: false, detail: classifyStatus(res.status, '').text, ms });
    } catch (e) {
      if (signal?.aborted) throw e;
      const isTimeout = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
      out.push({ mirror: host(url), ok: false, detail: isTimeout ? 'trop lent' : 'connexion bloquée', ms: Date.now() - t0 });
    }
  }
  return out;
}

/** Fusionne les données de plusieurs requêtes partielles. */
export function mergeOsm(parts: ParsedOsm[]): ParsedOsm {
  const out = emptyOsm();
  for (const p of parts) {
    out.forests.push(...p.forests);
    out.water.push(...p.water);
    out.springs.push(...p.springs);
    out.access.push(...p.access);
    out.noise.push(...p.noise);
    out.habitatPoints.push(...p.habitatPoints);
    out.habitatAreas.push(...p.habitatAreas);
  }
  return out;
}
