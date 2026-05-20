import { describe, it, expect } from 'vitest';
import {
  mixOklch, conceptDominant, combinationMix,
  gradientForWeights, dominantColor, applyPaletteOverrides, CATEGORIES,
} from './categories';

function parse(css: string) {
  const m = css.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) throw new Error(`pas un oklch: ${css}`);
  return { L: +m[1], C: +m[2], h: +m[3] };
}

describe('mixOklch', () => {
  it('retourne la couleur unique quand un seul stop', () => {
    const r = mixOklch([{ str: 'oklch(50% 0.2 120)', weight: 1 }]);
    const p = parse(r.css);
    expect(p.L).toBeCloseTo(50, 1);
    expect(p.C).toBeCloseTo(0.2, 2);
    expect(p.h).toBeCloseTo(120, 0);
  });

  it('moyenne pondérée de L et C', () => {
    const r = mixOklch([
      { str: 'oklch(40% 0.10 0)', weight: 1 },
      { str: 'oklch(60% 0.20 0)', weight: 1 },
    ]);
    const p = parse(r.css);
    expect(p.L).toBeCloseTo(50, 1);
    expect(p.C).toBeCloseTo(0.15, 2);
  });

  it('interpole le hue en circulaire (350° + 10° = 0°, pas 180°)', () => {
    const r = mixOklch([
      { str: 'oklch(50% 0.1 350)', weight: 1 },
      { str: 'oklch(50% 0.1 10)', weight: 1 },
    ]);
    const p = parse(r.css);
    // moyenne circulaire de 350 et 10 = 0 (et surtout PAS 180)
    expect(Math.min(p.h, 360 - p.h)).toBeLessThan(2);
  });

  it('respecte les poids (90/10 tire vers le stop dominant)', () => {
    const r = mixOklch([
      { str: 'oklch(20% 0.1 0)', weight: 9 },
      { str: 'oklch(80% 0.1 0)', weight: 1 },
    ]);
    const p = parse(r.css);
    expect(p.L).toBeCloseTo(26, 0); // (20*9 + 80*1)/10 = 26
  });

  it('fallback neutre quand aucun stop', () => {
    const r = mixOklch([]);
    expect(r.css).toContain('oklch(');
  });
});

describe('conceptDominant', () => {
  it('mixe les catégories pondérées d\'un concept', () => {
    const r = conceptDominant([['philosophie', 0.7], ['histoire', 0.3]]);
    expect(r.css).toContain('oklch(');
    expect(r.L).toBeGreaterThan(0);
  });
  it('gère une seule catégorie', () => {
    const r = conceptDominant([['arts', 1]]);
    expect(r.css).toContain('oklch(');
  });
});

describe('combinationMix', () => {
  it('combine plusieurs concepts pondérés', () => {
    const r = combinationMix([
      { cats: [['philosophie', 1]], weight: 50 },
      { cats: [['musique', 1]], weight: 50 },
    ]);
    expect(r.css).toContain('oklch(');
  });
  it('liste vide → fallback', () => {
    const r = combinationMix([]);
    expect(r.css).toContain('oklch(');
  });
});

describe('gradientForWeights', () => {
  it('génère un linear-gradient avec autant de stops que de cats', () => {
    const g = gradientForWeights([['philosophie', 0.5], ['arts', 0.5]]);
    expect(g).toContain('linear-gradient');
    expect(g.match(/oklch\(/g)?.length).toBe(2);
  });
});

describe('dominantColor', () => {
  it('retourne la couleur de la première catégorie', () => {
    expect(dominantColor([['musique', 1]])).toBe(CATEGORIES.musique.oklch);
  });
  it('fallback pour liste vide', () => {
    expect(dominantColor([])).toContain('oklch(');
  });
});

describe('applyPaletteOverrides', () => {
  it('remplace une couleur de catégorie puis restaure le défaut', () => {
    const original = CATEGORIES.philosophie.oklch;
    applyPaletteOverrides({ philosophie: 'oklch(99% 0.01 10)' });
    expect(CATEGORIES.philosophie.oklch).toBe('oklch(99% 0.01 10)');
    applyPaletteOverrides(undefined);
    expect(CATEGORIES.philosophie.oklch).toBe(original);
  });
});
