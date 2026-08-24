import { describe, it, expect } from 'vitest';
import {
  haversine, makeProj, projX, projY, unprojLat, unprojLng, bboxAround,
  distSqToSegment, pointInRing, buildSegIndex, nearestSegDist,
  buildPtIndex, nearestPtDist, buildPolyIndex, pointInPolyIndex, ringBounds,
  projectLine, formatDist, walkMin,
} from './geo';

/** PRNG déterministe pour que les tests aléatoires soient reproductibles. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('haversine', () => {
  it('mesure une distance connue (Dijon → Beaune ≈ 37 km)', () => {
    const d = haversine({ lat: 47.3220, lng: 5.0415 }, { lat: 47.0221, lng: 4.8383 });
    expect(d).toBeGreaterThan(35_000);
    expect(d).toBeLessThan(39_000);
  });

  it('vaut 0 pour un point sur lui-même', () => {
    expect(haversine({ lat: 47.3, lng: 5 }, { lat: 47.3, lng: 5 })).toBe(0);
  });
});

describe('projection locale', () => {
  const origin = { lat: 47.3220, lng: 5.0415 };
  const proj = makeProj(origin);

  it('fait un aller-retour sans perte', () => {
    const p = { lat: 47.41, lng: 5.19 };
    const x = projX(proj, p.lng), y = projY(proj, p.lat);
    expect(unprojLat(proj, y)).toBeCloseTo(p.lat, 9);
    expect(unprojLng(proj, x)).toBeCloseTo(p.lng, 9);
  });

  it("reste cohérente avec la distance réelle sur 20 km (< 0,5 % d'écart)", () => {
    const p = { lat: 47.45, lng: 5.18 };
    const x = projX(proj, p.lng), y = projY(proj, p.lat);
    const planar = Math.hypot(x, y);
    const real = haversine(origin, p);
    expect(Math.abs(planar - real) / real).toBeLessThan(0.005);
  });

  it('produit une bbox qui contient bien le disque demandé', () => {
    const b = bboxAround(origin, 10);
    expect(haversine(origin, { lat: b.north, lng: origin.lng })).toBeGreaterThan(9_900);
    expect(haversine(origin, { lat: origin.lat, lng: b.east })).toBeGreaterThan(9_900);
  });
});

describe('distSqToSegment', () => {
  it('projette sur le segment quand la perpendiculaire tombe dedans', () => {
    expect(Math.sqrt(distSqToSegment(5, 3, 0, 0, 10, 0))).toBeCloseTo(3, 9);
  });
  it("retombe sur l'extrémité quand on est au-delà", () => {
    expect(Math.sqrt(distSqToSegment(-4, 0, 0, 0, 10, 0))).toBeCloseTo(4, 9);
    expect(Math.sqrt(distSqToSegment(14, 0, 0, 0, 10, 0))).toBeCloseTo(4, 9);
  });
  it('gère un segment dégénéré (deux points confondus)', () => {
    expect(Math.sqrt(distSqToSegment(3, 4, 0, 0, 0, 0))).toBeCloseTo(5, 9);
  });
});

describe('pointInRing', () => {
  const square = new Float64Array([0, 0, 10, 0, 10, 10, 0, 10, 0, 0]);
  it('détecte intérieur et extérieur', () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(15, 5, square)).toBe(false);
    expect(pointInRing(-1, -1, square)).toBe(false);
  });
});

describe('index de segments', () => {
  it('donne le même résultat que la force brute', () => {
    const rnd = lcg(42);
    const lines: Float64Array[] = [];
    const flat: number[][] = [];
    for (let i = 0; i < 120; i++) {
      const n = 2 + Math.floor(rnd() * 5);
      const arr: number[] = [];
      let x = (rnd() - 0.5) * 8000, y = (rnd() - 0.5) * 8000;
      for (let j = 0; j < n; j++) {
        arr.push(x, y);
        x += (rnd() - 0.5) * 900; y += (rnd() - 0.5) * 900;
      }
      lines.push(new Float64Array(arr));
      flat.push(arr);
    }
    const ix = buildSegIndex(lines, 400);
    const MAX = 3000;

    const brute = (px: number, py: number) => {
      let best = MAX * MAX;
      for (const arr of flat) {
        for (let i = 0; i + 3 < arr.length; i += 2) {
          const d = distSqToSegment(px, py, arr[i], arr[i + 1], arr[i + 2], arr[i + 3]);
          if (d < best) best = d;
        }
      }
      return Math.sqrt(best);
    };

    for (let t = 0; t < 250; t++) {
      const px = (rnd() - 0.5) * 9000, py = (rnd() - 0.5) * 9000;
      expect(nearestSegDist(ix, px, py, MAX)).toBeCloseTo(brute(px, py), 6);
    }
  });

  it('renvoie le plafond quand il n\'y a aucun segment', () => {
    const ix = buildSegIndex([], 400);
    expect(nearestSegDist(ix, 0, 0, 1234)).toBe(1234);
  });
});

describe('index de points', () => {
  it('donne le même résultat que la force brute', () => {
    const rnd = lcg(7);
    const proj = makeProj({ lat: 47.32, lng: 5.04 });
    const pts = Array.from({ length: 300 }, () => ({
      lat: 47.32 + (rnd() - 0.5) * 0.14,
      lng: 5.04 + (rnd() - 0.5) * 0.2,
    }));
    const ix = buildPtIndex(pts, proj, 800);
    const MAX = 4000;
    const xs = pts.map(p => projX(proj, p.lng));
    const ys = pts.map(p => projY(proj, p.lat));

    for (let t = 0; t < 200; t++) {
      const px = (rnd() - 0.5) * 12000, py = (rnd() - 0.5) * 12000;
      let best = MAX * MAX;
      for (let i = 0; i < xs.length; i++) {
        const d = (xs[i] - px) ** 2 + (ys[i] - py) ** 2;
        if (d < best) best = d;
      }
      expect(nearestPtDist(ix, px, py, MAX)).toBeCloseTo(Math.sqrt(best), 6);
    }
  });
});

describe('index de polygones', () => {
  const outer = new Float64Array([0, 0, 1000, 0, 1000, 1000, 0, 1000, 0, 0]);
  const hole = new Float64Array([400, 400, 600, 400, 600, 600, 400, 600, 400, 400]);

  it('gère les trous (règle pair/impair sur un même groupe)', () => {
    const ix = buildPolyIndex([ringBounds([outer, hole])], 500);
    expect(pointInPolyIndex(ix, 200, 200)).toBe(true);   // dans la forêt
    expect(pointInPolyIndex(ix, 500, 500)).toBe(false);  // dans la clairière
    expect(pointInPolyIndex(ix, 1500, 500)).toBe(false); // dehors
  });

  it("n'annule pas deux forêts superposées (groupes distincts)", () => {
    const a = ringBounds([outer]);
    const b = ringBounds([new Float64Array([400, 400, 600, 400, 600, 600, 400, 600, 400, 400])]);
    const ix = buildPolyIndex([a, b], 500);
    expect(pointInPolyIndex(ix, 500, 500)).toBe(true);
  });
});

describe('projectLine / ringBounds', () => {
  it('calcule des bornes correctes', () => {
    const proj = makeProj({ lat: 47.32, lng: 5.04 });
    const line = projectLine([{ lat: 47.32, lng: 5.04 }, { lat: 47.33, lng: 5.05 }], proj);
    const g = ringBounds([line]);
    expect(g.minX).toBeCloseTo(0, 6);
    expect(g.maxY).toBeGreaterThan(1000);
  });
});

describe('formatage', () => {
  it('formate les distances', () => {
    expect(formatDist(240)).toBe('240 m');
    expect(formatDist(1500)).toBe('1.5 km');
    expect(formatDist(24000)).toBe('24 km');
  });
  it('estime un temps de marche plausible', () => {
    expect(walkMin(1000)).toBeGreaterThanOrEqual(15);
    expect(walkMin(1000)).toBeLessThanOrEqual(20);
  });
});
