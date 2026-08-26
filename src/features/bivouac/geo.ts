// Bivouac — géométrie & index spatiaux.
// Tout le calcul lourd se fait en mètres dans un repère plan local (projection
// équirectangulaire autour du point de départ) : sur 30 km l'erreur est
// négligeable devant la précision recherchée, et ça rend les maths triviales.
import type { LatLng, BBox } from './types';

const R = 6371008.8; // rayon terrestre moyen (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance orthodromique en mètres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ── Projection plane locale ──────────────────────────────────────────────────
export interface Proj { lat0: number; lng0: number; kx: number; ky: number }

export function makeProj(origin: LatLng): Proj {
  const ky = (Math.PI / 180) * R;                       // m par degré de latitude
  const kx = ky * Math.cos(rad(origin.lat));            // m par degré de longitude
  return { lat0: origin.lat, lng0: origin.lng, kx, ky };
}

export const projX = (p: Proj, lng: number) => (lng - p.lng0) * p.kx;
export const projY = (p: Proj, lat: number) => (lat - p.lat0) * p.ky;
export const unprojLng = (p: Proj, x: number) => p.lng0 + x / p.kx;
export const unprojLat = (p: Proj, y: number) => p.lat0 + y / p.ky;

/** BBox géographique couvrant un disque de `radiusKm` autour de `origin`. */
export function bboxAround(origin: LatLng, radiusKm: number): BBox {
  const dLat = (radiusKm * 1000) / ((Math.PI / 180) * R);
  const cos = Math.max(0.01, Math.cos(rad(origin.lat)));
  const dLng = dLat / cos;
  return {
    south: origin.lat - dLat, north: origin.lat + dLat,
    west: origin.lng - dLng, east: origin.lng + dLng,
  };
}

// ── Primitives ───────────────────────────────────────────────────────────────

/** Distance au carré d'un point au segment [ax,ay]–[bx,by]. */
export function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = 0;
  if (len > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/**
 * Test d'appartenance à un anneau (lancer de rayon). `ring` est un tableau plat
 * [x0,y0,x1,y1,…]. Renvoie true si le point est à l'intérieur.
 */
export function pointInRing(px: number, py: number, ring: Float64Array): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i], yi = ring[2 * i + 1];
    const xj = ring[2 * j], yj = ring[2 * j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── Index spatial de segments ────────────────────────────────────────────────
// Grille uniforme : chaque segment est référencé dans toutes les cellules que
// sa bbox touche. Les requêtes explorent des anneaux de cellules croissants et
// s'arrêtent dès qu'aucune cellule plus lointaine ne peut faire mieux.

export interface SegIndex {
  cell: number;
  /** Segments à plat : [ax,ay,bx,by, …]. */
  segs: Float64Array;
  count: number;
  buckets: Map<number, number[]>;
  minX: number; minY: number;
  empty: boolean;
}

const key = (ix: number, iy: number) => ix * 4194304 + iy; // 2^22, largement suffisant

export function buildSegIndex(lines: Float64Array[], cell = 400): SegIndex {
  let total = 0;
  for (const l of lines) total += Math.max(0, l.length / 2 - 1);
  const segs = new Float64Array(total * 4);
  let n = 0;
  for (const l of lines) {
    const pts = l.length / 2;
    for (let i = 0; i + 1 < pts; i++) {
      segs[4 * n] = l[2 * i]; segs[4 * n + 1] = l[2 * i + 1];
      segs[4 * n + 2] = l[2 * i + 2]; segs[4 * n + 3] = l[2 * i + 3];
      n++;
    }
  }
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const ax = segs[4 * i], ay = segs[4 * i + 1], bx = segs[4 * i + 2], by = segs[4 * i + 3];
    const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
    const y0 = Math.floor(Math.min(ay, by) / cell), y1 = Math.floor(Math.max(ay, by) / cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = key(ix, iy);
        const b = buckets.get(k);
        if (b) b.push(i); else buckets.set(k, [i]);
      }
    }
  }
  return { cell, segs, count: n, buckets, minX: 0, minY: 0, empty: n === 0 };
}

/**
 * Distance au segment le plus proche, bornée par `maxDist`.
 * Renvoie `maxDist` si rien n'est trouvé dans le rayon (valeur « au moins »).
 */
export function nearestSegDist(ix: SegIndex, px: number, py: number, maxDist: number): number {
  if (ix.empty) return maxDist;
  const cell = ix.cell;
  const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
  const maxRing = Math.ceil(maxDist / cell);
  let best = maxDist * maxDist;
  for (let r = 0; r <= maxRing; r++) {
    // Toute cellule de l'anneau r est à ≥ (r-1)*cell : on peut couper.
    const floorDist = (r - 1) * cell;
    if (r > 0 && floorDist > 0 && floorDist * floorDist > best) break;
    for (let ixx = cx - r; ixx <= cx + r; ixx++) {
      for (let iyy = cy - r; iyy <= cy + r; iyy++) {
        // uniquement le bord de l'anneau (l'intérieur a déjà été vu)
        if (r > 0 && Math.abs(ixx - cx) !== r && Math.abs(iyy - cy) !== r) continue;
        const b = ix.buckets.get(key(ixx, iyy));
        if (!b) continue;
        for (let t = 0; t < b.length; t++) {
          const i = b[t];
          const d = distSqToSegment(px, py, ix.segs[4 * i], ix.segs[4 * i + 1], ix.segs[4 * i + 2], ix.segs[4 * i + 3]);
          if (d < best) best = d;
        }
      }
    }
  }
  return Math.sqrt(best);
}

// ── Index spatial de points ──────────────────────────────────────────────────
export interface PtIndex { cell: number; xs: Float64Array; ys: Float64Array; buckets: Map<number, number[]>; empty: boolean }

export function buildPtIndex(pts: LatLng[], proj: Proj, cell = 800): PtIndex {
  const xs = new Float64Array(pts.length), ys = new Float64Array(pts.length);
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < pts.length; i++) {
    const x = projX(proj, pts[i].lng), y = projY(proj, pts[i].lat);
    xs[i] = x; ys[i] = y;
    const k = key(Math.floor(x / cell), Math.floor(y / cell));
    const b = buckets.get(k);
    if (b) b.push(i); else buckets.set(k, [i]);
  }
  return { cell, xs, ys, buckets, empty: pts.length === 0 };
}

export function nearestPtDist(ix: PtIndex, px: number, py: number, maxDist: number): number {
  if (ix.empty) return maxDist;
  const cell = ix.cell;
  const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
  const maxRing = Math.ceil(maxDist / cell);
  let best = maxDist * maxDist;
  for (let r = 0; r <= maxRing; r++) {
    const floorDist = (r - 1) * cell;
    if (r > 0 && floorDist > 0 && floorDist * floorDist > best) break;
    for (let ixx = cx - r; ixx <= cx + r; ixx++) {
      for (let iyy = cy - r; iyy <= cy + r; iyy++) {
        if (r > 0 && Math.abs(ixx - cx) !== r && Math.abs(iyy - cy) !== r) continue;
        const b = ix.buckets.get(key(ixx, iyy));
        if (!b) continue;
        for (let t = 0; t < b.length; t++) {
          const i = b[t];
          const dx = ix.xs[i] - px, dy = ix.ys[i] - py;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
    }
  }
  return Math.sqrt(best);
}

// ── Index de polygones (forêts) ──────────────────────────────────────────────
export interface PolyGroup { rings: Float64Array[]; minX: number; minY: number; maxX: number; maxY: number }
export interface PolyIndex { cell: number; groups: PolyGroup[]; buckets: Map<number, number[]> }

export function buildPolyIndex(groups: PolyGroup[], cell = 1000): PolyIndex {
  const buckets = new Map<number, number[]>();
  for (let g = 0; g < groups.length; g++) {
    const q = groups[g];
    const x0 = Math.floor(q.minX / cell), x1 = Math.floor(q.maxX / cell);
    const y0 = Math.floor(q.minY / cell), y1 = Math.floor(q.maxY / cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = key(ix, iy);
        const b = buckets.get(k);
        if (b) b.push(g); else buckets.set(k, [g]);
      }
    }
  }
  return { cell, groups, buckets };
}

/** true si le point tombe dans une des forêts (trous pris en compte). */
export function pointInPolyIndex(ix: PolyIndex, px: number, py: number): boolean {
  const b = ix.buckets.get(key(Math.floor(px / ix.cell), Math.floor(py / ix.cell)));
  if (!b) return false;
  for (let t = 0; t < b.length; t++) {
    const g = ix.groups[b[t]];
    if (px < g.minX || px > g.maxX || py < g.minY || py > g.maxY) continue;
    // règle pair/impair sur les anneaux du MÊME groupe → les trous s'excluent
    let inside = false;
    for (const ring of g.rings) if (pointInRing(px, py, ring)) inside = !inside;
    if (inside) return true;
  }
  return false;
}

/** Convertit une polyligne lat/lng en tableau plat projeté [x0,y0,x1,y1,…]. */
export function projectLine(line: LatLng[], proj: Proj): Float64Array {
  const out = new Float64Array(line.length * 2);
  for (let i = 0; i < line.length; i++) {
    out[2 * i] = projX(proj, line[i].lng);
    out[2 * i + 1] = projY(proj, line[i].lat);
  }
  return out;
}

export function ringBounds(rings: Float64Array[]): PolyGroup {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < minX) minX = r[i];
      if (r[i] > maxX) maxX = r[i];
      if (r[i + 1] < minY) minY = r[i + 1];
      if (r[i + 1] > maxY) maxY = r[i + 1];
    }
  }
  return { rings, minX, minY, maxX, maxY };
}

// ── Formatage ────────────────────────────────────────────────────────────────
export function formatDist(m: number): string {
  if (!isFinite(m)) return '—';
  if (m >= 10000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 10) * 10} m`;
}

/** Temps de marche (4,5 km/h) en minutes, avec majoration de détour. */
export function walkMin(m: number): number {
  return Math.max(1, Math.round((m * 1.25) / 75));
}

// ── Requêtes « point le plus proche » ────────────────────────────────────────
// Les distances seules ne suffisent pas à décrire un lieu : pour dire « rivière
// à 180 m au nord-est » et tracer le trait sur la carte, il faut le point.

export interface NearestHit { dist: number; x: number; y: number }

/** Point du segment [a,b] le plus proche de (px,py). */
export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { x: number; y: number; d2: number } {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = 0;
  if (len > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const x = ax + t * dx, y = ay + t * dy;
  const qx = x - px, qy = y - py;
  return { x, y, d2: qx * qx + qy * qy };
}

/** Comme nearestSegDist, mais renvoie aussi la position du point trouvé. */
export function nearestSegPoint(ix: SegIndex, px: number, py: number, maxDist: number): NearestHit | null {
  if (ix.empty) return null;
  const cell = ix.cell;
  const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
  const maxRing = Math.ceil(maxDist / cell);
  let best = maxDist * maxDist;
  let bx = 0, by = 0, found = false;
  for (let r = 0; r <= maxRing; r++) {
    const floorDist = (r - 1) * cell;
    if (r > 0 && floorDist > 0 && floorDist * floorDist > best) break;
    for (let ixx = cx - r; ixx <= cx + r; ixx++) {
      for (let iyy = cy - r; iyy <= cy + r; iyy++) {
        if (r > 0 && Math.abs(ixx - cx) !== r && Math.abs(iyy - cy) !== r) continue;
        const b = ix.buckets.get(key(ixx, iyy));
        if (!b) continue;
        for (let t = 0; t < b.length; t++) {
          const i = b[t];
          const c = closestOnSegment(px, py, ix.segs[4 * i], ix.segs[4 * i + 1], ix.segs[4 * i + 2], ix.segs[4 * i + 3]);
          if (c.d2 < best) { best = c.d2; bx = c.x; by = c.y; found = true; }
        }
      }
    }
  }
  return found ? { dist: Math.sqrt(best), x: bx, y: by } : null;
}

/** Idem pour un index de points. */
export function nearestPtPoint(ix: PtIndex, px: number, py: number, maxDist: number): NearestHit | null {
  if (ix.empty) return null;
  const cell = ix.cell;
  const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
  const maxRing = Math.ceil(maxDist / cell);
  let best = maxDist * maxDist;
  let bx = 0, by = 0, found = false;
  for (let r = 0; r <= maxRing; r++) {
    const floorDist = (r - 1) * cell;
    if (r > 0 && floorDist > 0 && floorDist * floorDist > best) break;
    for (let ixx = cx - r; ixx <= cx + r; ixx++) {
      for (let iyy = cy - r; iyy <= cy + r; iyy++) {
        if (r > 0 && Math.abs(ixx - cx) !== r && Math.abs(iyy - cy) !== r) continue;
        const b = ix.buckets.get(key(ixx, iyy));
        if (!b) continue;
        for (let t = 0; t < b.length; t++) {
          const i = b[t];
          const dx = ix.xs[i] - px, dy = ix.ys[i] - py;
          const d = dx * dx + dy * dy;
          if (d < best) { best = d; bx = ix.xs[i]; by = ix.ys[i]; found = true; }
        }
      }
    }
  }
  return found ? { dist: Math.sqrt(best), x: bx, y: by } : null;
}

/** Cap en degrés depuis le nord, sens horaire. */
export function bearingDeg(fromX: number, fromY: number, toX: number, toY: number): number {
  return (Math.atan2(toX - fromX, toY - fromY) * (180 / Math.PI) + 360) % 360;
}

const COMPASS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];

/** Direction en toutes lettres (« nord-est »). */
export function compass(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/** Aire approximative d'un anneau lat/lng, en m². */
export function ringAreaM2(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0].lat;
  const kx = Math.cos(rad(lat0)) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng * kx, yi = ring[i].lat * ky;
    const xj = ring[j].lng * kx, yj = ring[j].lat * ky;
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}
