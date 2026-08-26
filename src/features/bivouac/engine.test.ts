import { describe, it, expect } from 'vitest';
import type { LatLng, OsmElement, ParsedOsm, SearchParams } from './types';
import { makeProj, unprojLat, unprojLng, haversine } from './geo';
import { parseOsm, stitchRings, buildQuery, buildQueryParts, mergeOsm, emptyOsm, isSwimmable } from './overpass';
import { describeSpot } from './describe';
import { asc, desc, band, scoreMetrics, defaultWeights, estimateDriveMin, CRITERIA } from './criteria';
import { buildScene, scan, rescore, resolveStep, metricsAt } from './engine';

const ORIGIN: LatLng = { lat: 47.32, lng: 5.04 };
const proj = makeProj(ORIGIN);
/** Point géographique à (dx, dy) mètres du départ. */
const at = (dx: number, dy: number): LatLng => ({ lat: unprojLat(proj, dy), lng: unprojLng(proj, dx) });

// ── Scène synthétique : une forêt carrée de 4 km traversée par un ruisseau ────
function syntheticOsm(): ParsedOsm {
  const forest = [at(-2000, -2000), at(2000, -2000), at(2000, 2000), at(-2000, 2000), at(-2000, -2000)];
  return {
    forests: [[forest]],
    water: [[at(-2500, 500), at(2500, 500)]],           // rivière est-ouest
    swim: [[at(-2500, 500), at(2500, 500)]],            // …et on peut s'y baigner
    springs: [],
    access: [[at(-2500, -2200), at(2500, -2200)]],      // piste au sud de la forêt
    noise: [[at(6000, -6000), at(6000, 6000)]],         // grand axe très à l'est
    habitatPoints: [at(5000, 5000)],
    habitatAreas: [],
  };
}

const params = (over: Partial<SearchParams> = {}): SearchParams => ({
  origin: ORIGIN, radiusKm: 3, gridStep: 200, minSeparation: 600, maxResults: 20,
  weights: defaultWeights(), ...over,
});

describe('courbes de notation', () => {
  it('asc / desc bornent bien entre 0 et 100', () => {
    expect(asc(0, 0, 100)).toBe(0);
    expect(asc(100, 0, 100)).toBe(100);
    expect(asc(-50, 0, 100)).toBe(0);
    expect(asc(999, 0, 100)).toBe(100);
    expect(desc(0, 0, 100)).toBe(100);
    expect(desc(100, 0, 100)).toBe(0);
  });

  it('band fait un plateau puis redescend des deux côtés', () => {
    expect(band(200, 0, 100, 300, 1000)).toBe(100);
    expect(band(100, 0, 100, 300, 1000)).toBe(100);
    expect(band(300, 0, 100, 300, 1000)).toBe(100);
    expect(band(50, 0, 100, 300, 1000)).toBeCloseTo(50, 6);
    expect(band(1000, 0, 100, 300, 1000)).toBe(0);
    expect(band(0, 0, 100, 300, 1000)).toBe(0);
  });

  it('protège contre les bornes dégénérées', () => {
    expect(asc(5, 10, 10)).toBe(50);
    expect(desc(5, 10, 10)).toBe(50);
  });

  it('estime un trajet voiture strictement croissant avec la distance', () => {
    expect(estimateDriveMin(0)).toBe(0);
    expect(estimateDriveMin(2000)).toBeGreaterThan(estimateDriveMin(1000));
    expect(estimateDriveMin(30000)).toBeGreaterThan(estimateDriveMin(5000));
  });

  it('départage encore deux spots proches sur un petit rayon', () => {
    const near = { dWater: 200, dSwim: 250, dEdge: 500, dAccess: 400, dHabitat: 2000, dNoise: 2000, crowM: 800 };
    const far = { ...near, crowM: 2200 };
    const w = { ...defaultWeights(), drive: 10 };
    expect(scoreMetrics(near, w, { radiusKm: 3 }).scores.drive)
      .toBeGreaterThan(scoreMetrics(far, w, { radiusKm: 3 }).scores.drive);
  });
});

describe('scoreMetrics', () => {
  const base = { dWater: 200, dSwim: 250, dEdge: 500, dAccess: 400, dHabitat: 2000, dNoise: 2000, crowM: 8000 };

  it('donne un excellent score à un spot idéal', () => {
    const { total } = scoreMetrics(base, defaultWeights(), { radiusKm: 15 });
    expect(total).toBeGreaterThan(85);
  });

  it('ignore la pente tant qu\'elle n\'est pas mesurée', () => {
    const { scores } = scoreMetrics(base, defaultWeights(), { radiusKm: 15 });
    expect(scores.flat).toBeUndefined();
    const withSlope = scoreMetrics({ ...base, slopePct: 3 }, defaultWeights(), { radiusKm: 15 });
    expect(withSlope.scores.flat).toBe(100);
  });

  it('respecte les pondérations (poids nul = critère écarté du total)', () => {
    const far = { ...base, dWater: 3000 };
    const withWater = scoreMetrics(far, defaultWeights(), { radiusKm: 15 }).total;
    const without = scoreMetrics(far, { ...defaultWeights(), water: 0 }, { radiusKm: 15 }).total;
    expect(without).toBeGreaterThan(withWater);
  });

  it('renvoie 0 si tous les poids sont nuls', () => {
    const zero = Object.fromEntries(CRITERIA.map(c => [c.id, 0]));
    expect(scoreMetrics(base, zero, { radiusKm: 15 }).total).toBe(0);
  });
});

describe('parseOsm', () => {
  it('classe chaque type d\'élément dans la bonne catégorie', () => {
    const g = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 47.3 + i * 0.001, lon: 5 + i * 0.001 }));
    const els: OsmElement[] = [
      { type: 'way', id: 1, tags: { landuse: 'forest' }, geometry: g(5) },
      { type: 'way', id: 2, tags: { natural: 'wood' }, geometry: g(4) },
      { type: 'way', id: 3, tags: { waterway: 'stream' }, geometry: g(3) },
      { type: 'way', id: 4, tags: { natural: 'water' }, geometry: g(5) },
      { type: 'way', id: 5, tags: { highway: 'track' }, geometry: g(3) },
      { type: 'way', id: 6, tags: { highway: 'primary' }, geometry: g(3) },
      { type: 'way', id: 7, tags: { railway: 'rail' }, geometry: g(3) },
      { type: 'way', id: 8, tags: { landuse: 'residential' }, geometry: g(4) },
      { type: 'way', id: 9, tags: { amenity: 'parking' }, geometry: g(4) },
      { type: 'node', id: 10, lat: 47.3, lon: 5, tags: { natural: 'spring' } },
      { type: 'node', id: 11, lat: 47.4, lon: 5.1, tags: { place: 'hamlet' } },
      { type: 'way', id: 12, tags: { highway: 'footway' }, geometry: g(3) }, // ignoré
    ];
    const p = parseOsm(els);
    expect(p.forests).toHaveLength(2);
    expect(p.water).toHaveLength(2);       // ruisseau + contour du plan d'eau
    expect(p.access).toHaveLength(2);      // piste + parking
    expect(p.noise).toHaveLength(2);       // primaire + voie ferrée
    expect(p.springs).toHaveLength(1);
    expect(p.habitatPoints).toHaveLength(1);
    expect(p.habitatAreas).toHaveLength(1);
  });

  it('reconstruit un multipolygone découpé en plusieurs tronçons', () => {
    const els: OsmElement[] = [{
      type: 'relation', id: 20, tags: { landuse: 'forest' },
      members: [
        { type: 'way', role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] },
        { type: 'way', role: 'outer', geometry: [{ lat: 0, lon: 1 }, { lat: 1, lon: 1 }] },
        { type: 'way', role: 'outer', geometry: [{ lat: 1, lon: 1 }, { lat: 0, lon: 0 }] },
      ],
    }];
    const p = parseOsm(els);
    expect(p.forests).toHaveLength(1);
    expect(p.forests[0]).toHaveLength(1);          // un seul anneau recollé
    expect(p.forests[0][0].length).toBeGreaterThanOrEqual(4);
  });

  it('ignore les éléments sans géométrie', () => {
    expect(parseOsm([{ type: 'way', id: 1, tags: { landuse: 'forest' } }]).forests).toHaveLength(0);
  });
});

describe('stitchRings', () => {
  it('referme un anneau donné dans le désordre et à l\'envers', () => {
    const rings = stitchRings([
      [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }],
      [{ lat: 1, lng: 1 }, { lat: 0, lng: 1 }],  // sens inverse
      [{ lat: 1, lng: 1 }, { lat: 0, lng: 0 }],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
  });
});

describe('construction des requêtes', () => {
  const BB = { south: 47.1, west: 4.9, north: 47.5, east: 5.2 };

  it('injecte l\'emprise et reste une requête Overpass valide', () => {
    const q = buildQuery(BB);
    expect(q).toContain('[out:json]');
    expect(q).toContain('47.10000,4.90000,47.50000,5.20000');
    expect(q).toContain('out geom;');
    expect(q.match(/\(/g)!.length).toBe(q.match(/\)/g)!.length);
  });

  it('découpe en parties dont une seule est indispensable', () => {
    const parts = buildQueryParts(BB);
    expect(parts).toHaveLength(3);
    expect(parts.filter(p => p.essential).map(p => p.id)).toEqual(['forest']);
    for (const p of parts) {
      expect(p.query).toContain('[out:json]');
      expect(p.query).toContain('47.10000,4.90000,47.50000,5.20000');
      expect(p.query).toContain('out geom;');
      expect(p.query.match(/\(/g)!.length).toBe(p.query.match(/\)/g)!.length);
    }
  });

  it('couvre entre les trois parties tout ce que parseOsm sait classer', () => {
    const all = buildQueryParts(BB).map(p => p.query).join('\n');
    for (const tag of ['landuse"="forest', 'natural"="wood', 'waterway', 'natural"="spring',
      'amenity"="parking', 'railway"="rail', 'place', 'landuse"="residential']) {
      expect(all).toContain(tag);
    }
  });
});

describe('mergeOsm', () => {
  it('concatène les couches de plusieurs requêtes partielles', () => {
    const a = { ...emptyOsm(), forests: [[[{ lat: 0, lng: 0 }]]] };
    const b = { ...emptyOsm(), springs: [{ lat: 1, lng: 1 }] };
    const m = mergeOsm([a, b]);
    expect(m.forests).toHaveLength(1);
    expect(m.springs).toHaveLength(1);
    expect(m.water).toHaveLength(0);
  });

  it('rend une structure vide exploitable', () => {
    const m = mergeOsm([]);
    expect(m.forests).toEqual([]);
    expect(m.habitatPoints).toEqual([]);
  });
});

describe('resolveStep', () => {
  it('respecte le pas demandé quand la zone est petite', () => {
    expect(resolveStep(3, 200)).toBe(200);
  });
  it('élargit le pas pour les grandes zones', () => {
    const step = resolveStep(40, 50);
    expect(step).toBeGreaterThan(50);
    expect((80000 / step) ** 2).toBeLessThanOrEqual(160_000);
  });
});

describe('moteur de bout en bout', () => {
  const scene = buildScene(syntheticOsm(), ORIGIN);

  it('indexe correctement la scène', () => {
    expect(scene.stats.forests).toBe(1);
    expect(scene.stats.waterLines).toBe(1);
  });

  it('mesure des distances cohérentes au centre de la forêt', () => {
    const m = metricsAt(scene, 0, 500, true);
    expect(m.dWater).toBeLessThan(5);          // sur le ruisseau
    expect(m.dEdge).toBeCloseTo(1500, -1);     // bord nord à 1500 m
    expect(m.dAccess).toBeCloseTo(2700, -1);   // piste au sud
  });

  it('ne retient que des points en forêt et bien espacés', async () => {
    const p = params();
    const spots = await scan(scene, p, { requireForest: true });
    expect(spots.length).toBeGreaterThan(3);
    for (const s of spots) {
      expect(s.metrics.dEdge).toBeGreaterThan(0);
      expect(haversine(ORIGIN, s)).toBeLessThanOrEqual(p.radiusKm * 1000 + 1);
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(haversine(spots[i], spots[j])).toBeGreaterThan(p.minSeparation - 1);
      }
    }
  });

  it('classe en tête un spot profond et proche de l\'eau', async () => {
    const spots = await scan(scene, params(), { requireForest: true });
    const best = spots[0];
    expect(best.metrics.dWater).toBeLessThan(500);
    expect(best.metrics.dEdge).toBeGreaterThan(700);
    expect(best.total).toBeGreaterThanOrEqual(spots[spots.length - 1].total);
  });

  it('sort de la forêt quand on lève la contrainte', async () => {
    const wide = params({ maxResults: 60, minSeparation: 400 });
    const inside = await scan(scene, wide, { requireForest: true });
    const anywhere = await scan(scene, wide, { requireForest: false });
    expect(anywhere.length).toBeGreaterThanOrEqual(inside.length);
    // hors forêt la profondeur est nulle par construction
    expect(metricsAt(scene, 3000, 0, false).dEdge).toBe(0);
  });

  it('rapporte sa progression et peut être annulé', async () => {
    const seen: string[] = [];
    await scan(scene, params(), { requireForest: true, onProgress: p => seen.push(p.phase) });
    expect(seen).toContain('scan');
    expect(seen).toContain('rank');

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(scan(scene, params({ radiusKm: 3 }), { requireForest: true, signal: ctrl.signal }))
      .rejects.toThrow();
  });

  it('reclasse sans rebalayer quand les poids changent', async () => {
    const spots = await scan(scene, params(), { requireForest: true });
    const drivePriority = rescore(spots, params({ weights: { ...defaultWeights(), drive: 10, water: 0, depth: 0 } }));
    expect(drivePriority).toHaveLength(spots.length);
    // le premier doit désormais être parmi les plus proches du départ
    const closest = Math.min(...spots.map(s => s.metrics.crowM));
    expect(drivePriority[0].metrics.crowM).toBeLessThan(closest * 1.6 + 300);
    for (let i = 1; i < drivePriority.length; i++) {
      expect(drivePriority[i - 1].total).toBeGreaterThanOrEqual(drivePriority[i].total);
    }
  });
});

describe('classification de l\'eau baignable', () => {
  it('retient les rivières, écarte ruisseaux et canaux', () => {
    expect(isSwimmable({ waterway: 'river' })).toBe(true);
    expect(isSwimmable({ waterway: 'stream' })).toBe(false);
    expect(isSwimmable({ waterway: 'canal' })).toBe(false);
  });

  it('retient les plans d\'eau assez grands, écarte les mares', () => {
    // ~300 m de côté ≈ 9 ha
    const big = [at(0, 0), at(300, 0), at(300, 300), at(0, 300), at(0, 0)];
    // ~40 m de côté ≈ 0,16 ha
    const small = [at(0, 0), at(40, 0), at(40, 40), at(0, 40), at(0, 0)];
    expect(isSwimmable({ natural: 'water' }, big)).toBe(true);
    expect(isSwimmable({ natural: 'water' }, small)).toBe(false);
    expect(isSwimmable({ natural: 'water', water: 'pond' }, big)).toBe(false);
  });

  it('sépare bien les deux couches au parsing', () => {
    const g = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 47.3 + i * 0.001, lon: 5 + i * 0.001 }));
    const p = parseOsm([
      { type: 'way', id: 1, tags: { waterway: 'river' }, geometry: g(3) },
      { type: 'way', id: 2, tags: { waterway: 'stream' }, geometry: g(3) },
    ]);
    expect(p.water).toHaveLength(2);
    expect(p.swim).toHaveLength(1);
  });
});

describe('description du lieu', () => {
  const scene = buildScene(syntheticOsm(), ORIGIN);

  it('situe la baignade avec une direction lisible', async () => {
    const spots = await scan(scene, params(), { requireForest: true });
    const s = spots[0];
    expect(s.around?.swim).toBeDefined();
    const phrases = describeSpot(s).map(d => d.text).join(' ');
    expect(phrases).toMatch(/[Bb]aignade|baignable/);
    expect(phrases).toMatch(/nord|sud|est|ouest/);
  });

  it('signale franchement l\'absence de baignade', () => {
    const dry = { dWater: 2000, dSwim: 4000, dEdge: 500, dAccess: 400, dHabitat: 2000, dNoise: 2000, crowM: 5000 };
    const spot = { id: 'x', lat: 0, lng: 0, metrics: dry, scores: {}, total: 50 };
    expect(describeSpot(spot).some(d => d.tone === 'warn' && /baignable/.test(d.text))).toBe(true);
  });
});
