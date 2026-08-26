// Bivouac — moteur de recherche : indexation, balayage de la grille, classement.
import type { LatLng, Metrics, ParsedOsm, Progress, SearchParams, Spot, Surroundings } from './types';
import {
  makeProj, projX, projY, unprojLat, unprojLng, projectLine, ringBounds,
  buildSegIndex, buildPtIndex, buildPolyIndex, nearestSegDist, nearestPtDist, pointInPolyIndex,
  nearestSegPoint, nearestPtPoint, bearingDeg,
  type Proj, type SegIndex, type PtIndex, type PolyIndex, type PolyGroup,
} from './geo';
import { scoreMetrics } from './criteria';

/** Plafonds de recherche : au-delà, les scores sont de toute façon saturés. */
const CAP = { water: 3000, swim: 4000, edge: 2500, access: 4000, habitat: 3000, noise: 3000 };

/** Nombre maximal de points de grille : au-delà on élargit le pas. */
const MAX_GRID_POINTS = 160_000;

export interface SceneStats {
  forests: number; waterLines: number; swimLines: number; springs: number;
  accessLines: number; noiseLines: number; habitat: number;
}

export interface Scene {
  proj: Proj;
  origin: LatLng;
  forests: PolyIndex;
  forestEdges: SegIndex;
  water: SegIndex;
  swim: SegIndex;
  springs: PtIndex;
  access: SegIndex;
  noise: SegIndex;
  habitatPts: PtIndex;
  habitatEdges: SegIndex;
  stats: SceneStats;
}

/** Projette les données OSM et construit tous les index spatiaux. */
export function buildScene(osm: ParsedOsm, origin: LatLng): Scene {
  const proj = makeProj(origin);

  const forestGroups: PolyGroup[] = [];
  const forestRings: Float64Array[] = [];
  for (const rings of osm.forests) {
    const projected = rings.map(r => projectLine(r, proj)).filter(r => r.length >= 6);
    if (projected.length === 0) continue;
    forestGroups.push(ringBounds(projected));
    for (const r of projected) forestRings.push(r);
  }

  const waterLines = osm.water.map(l => projectLine(l, proj));
  const swimLines = osm.swim.map(l => projectLine(l, proj));
  const accessLines = osm.access.map(l => projectLine(l, proj));
  const noiseLines = osm.noise.map(l => projectLine(l, proj));
  const habitatRings = osm.habitatAreas.map(l => projectLine(l, proj));

  return {
    proj, origin,
    forests: buildPolyIndex(forestGroups, 1000),
    forestEdges: buildSegIndex(forestRings, 400),
    water: buildSegIndex(waterLines, 400),
    swim: buildSegIndex(swimLines, 500),
    springs: buildPtIndex(osm.springs, proj, 800),
    access: buildSegIndex(accessLines, 300),
    noise: buildSegIndex(noiseLines, 600),
    habitatPts: buildPtIndex(osm.habitatPoints, proj, 800),
    habitatEdges: buildSegIndex(habitatRings, 500),
    stats: {
      forests: osm.forests.length,
      waterLines: osm.water.length,
      swimLines: osm.swim.length,
      springs: osm.springs.length,
      accessLines: osm.access.length,
      noiseLines: osm.noise.length,
      habitat: osm.habitatPoints.length + osm.habitatAreas.length,
    },
  };
}

/** Mesures brutes en un point du plan local. */
export function metricsAt(scene: Scene, x: number, y: number, insideForest: boolean): Metrics {
  const dWaterLine = nearestSegDist(scene.water, x, y, CAP.water);
  const dSpring = nearestPtDist(scene.springs, x, y, CAP.water);
  const dHabA = nearestSegDist(scene.habitatEdges, x, y, CAP.habitat);
  const dHabP = nearestPtDist(scene.habitatPts, x, y, CAP.habitat);
  return {
    dWater: Math.min(dWaterLine, dSpring),
    dSwim: nearestSegDist(scene.swim, x, y, CAP.swim),
    dEdge: insideForest ? nearestSegDist(scene.forestEdges, x, y, CAP.edge) : 0,
    dAccess: nearestSegDist(scene.access, x, y, CAP.access),
    dHabitat: Math.min(dHabA, dHabP),
    dNoise: nearestSegDist(scene.noise, x, y, CAP.noise),
    crowM: Math.sqrt(x * x + y * y),
  };
}

const tick = () => new Promise<void>(r => setTimeout(r, 0));

/** Ajuste le pas de grille pour rester sous le plafond de points. */
export function resolveStep(radiusKm: number, requested: number): number {
  const side = radiusKm * 2000;
  let step = Math.max(40, requested);
  while ((side / step) ** 2 > MAX_GRID_POINTS) step *= 1.25;
  return Math.round(step);
}

export interface ScanOptions {
  requireForest: boolean;
  /** Écarte d'office les points trop loin d'une eau baignable. */
  maxSwimM?: number | null;
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
}

/**
 * Balaie la zone, note chaque point candidat, puis retient les meilleurs en les
 * espaçant (sinon on obtient 50 variantes du même endroit).
 */
export async function scan(scene: Scene, params: SearchParams, opts: ScanOptions): Promise<Spot[]> {
  const r = params.radiusKm * 1000;
  const step = resolveStep(params.radiusKm, params.gridStep);
  const ctx = { radiusKm: params.radiusKm };
  const rows = Math.floor((2 * r) / step) + 1;

  interface Cand { x: number; y: number; m: Metrics; total: number }
  const cands: Cand[] = [];

  let row = 0;
  for (let y = -r; y <= r; y += step, row++) {
    for (let x = -r; x <= r; x += step) {
      if (x * x + y * y > r * r) continue;
      const inside = pointInPolyIndex(scene.forests, x, y);
      if (opts.requireForest && !inside) continue;
      const m = metricsAt(scene, x, y, inside);
      if (opts.maxSwimM != null && m.dSwim > opts.maxSwimM) continue;
      const { total } = scoreMetrics(m, params.weights, ctx);
      cands.push({ x, y, m, total });
    }
    if (row % 12 === 0) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      opts.onProgress?.({
        phase: 'scan',
        ratio: Math.min(1, row / rows),
        message: `Analyse du terrain… ${cands.length.toLocaleString('fr-FR')} points étudiés`,
      });
      await tick();
    }
  }

  opts.onProgress?.({ phase: 'rank', message: 'Sélection des meilleurs coins…' });
  await tick();

  cands.sort((a, b) => b.total - a.total);

  // Suppression des quasi-doublons : on garde le meilleur de chaque secteur.
  const sep2 = params.minSeparation ** 2;
  const kept: Cand[] = [];
  for (const c of cands) {
    if (kept.length >= params.maxResults) break;
    let ok = true;
    for (const k of kept) {
      const dx = k.x - c.x, dy = k.y - c.y;
      if (dx * dx + dy * dy < sep2) { ok = false; break; }
    }
    if (ok) kept.push(c);
  }

  return kept.map((c, i): Spot => {
    const { scores, total } = scoreMetrics(c.m, params.weights, ctx);
    return {
      id: `spot-${i}`,
      lat: unprojLat(scene.proj, c.y),
      lng: unprojLng(scene.proj, c.x),
      metrics: c.m,
      around: surroundingsAt(scene, c.x, c.y),
      scores,
      total,
    };
  });
}

/**
 * Décrit ce qui entoure un point : où se trouve l'eau, la lisière, l'accès.
 * Réservé aux spots retenus — c'est plus coûteux que la simple distance, et
 * c'est ce qui permet de dire « rivière à 180 m au nord-est » plutôt qu'un
 * simple nombre, et de tracer les liaisons sur la carte.
 */
export function surroundingsAt(scene: Scene, x: number, y: number): Surroundings {
  const out: Surroundings = {};
  const put = (hit: { dist: number; x: number; y: number } | null): Surroundings['water'] => {
    if (!hit) return undefined;
    return {
      point: { lat: unprojLat(scene.proj, hit.y), lng: unprojLng(scene.proj, hit.x) },
      dist: hit.dist,
      bearing: bearingDeg(x, y, hit.x, hit.y),
    };
  };

  // L'eau la plus proche peut être une source ponctuelle plutôt qu'un tracé.
  const wLine = nearestSegPoint(scene.water, x, y, CAP.water);
  const wSpring = nearestPtPoint(scene.springs, x, y, CAP.water);
  const w = !wLine ? wSpring : !wSpring ? wLine : (wSpring.dist < wLine.dist ? wSpring : wLine);
  out.water = put(w);
  out.swim = put(nearestSegPoint(scene.swim, x, y, CAP.swim));
  out.access = put(nearestSegPoint(scene.access, x, y, CAP.access));
  out.edge = put(nearestSegPoint(scene.forestEdges, x, y, CAP.edge));

  const hArea = nearestSegPoint(scene.habitatEdges, x, y, CAP.habitat);
  const hPt = nearestPtPoint(scene.habitatPts, x, y, CAP.habitat);
  const h = !hArea ? hPt : !hPt ? hArea : (hPt.dist < hArea.dist ? hPt : hArea);
  out.habitat = put(h);

  return out;
}

/** Recalcule les scores sans refaire le balayage (changement de pondération). */
export function rescore(spots: Spot[], params: SearchParams): Spot[] {
  const ctx = { radiusKm: params.radiusKm };
  return spots
    .map(s => ({ ...s, ...scoreMetrics(s.metrics, params.weights, ctx) }))
    .sort((a, b) => b.total - a.total);
}

/** Coordonnées locales d'un point géographique (utile pour la carte). */
export function toLocal(scene: Scene, p: LatLng): { x: number; y: number } {
  return { x: projX(scene.proj, p.lng), y: projY(scene.proj, p.lat) };
}
