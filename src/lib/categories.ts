import type { Category, CategoryKey } from '../types';

const DEFAULT_OKLCH: Record<CategoryKey, string> = {
  philosophie: 'oklch(35% 0.13 250)',
  sciences:    'oklch(50% 0.18 155)',
  humaines:    'oklch(65% 0.14 75)',
  economie:    'oklch(72% 0.16 88)',
  litterature: 'oklch(45% 0.20 330)',
  arts:        'oklch(60% 0.25 350)',
  musique:     'oklch(55% 0.22 28)',
  cinema:      'oklch(65% 0.18 50)',
  jeuvideo:    'oklch(55% 0.24 295)',
  histoire:    'oklch(42% 0.07 55)',
  geographie:  'oklch(68% 0.13 195)',
  personnages: 'oklch(78% 0.06 0)',
};

const LABELS: Record<CategoryKey, [string, string]> = {
  philosophie: ['Philosophie',      'PHL'],
  sciences:    ['Sciences exactes', 'SCI'],
  humaines:    ['Sc. humaines',     'SHM'],
  economie:    ['Économie',         'ECO'],
  litterature: ['Littérature',      'LIT'],
  arts:        ['Arts visuels',     'ART'],
  musique:     ['Musique',          'MUS'],
  cinema:      ['Cinéma',           'CIN'],
  jeuvideo:    ['Jeu vidéo',        'GAM'],
  histoire:    ['Histoire',         'HIS'],
  geographie:  ['Géographie',       'GEO'],
  personnages: ['Personnages',      'PER'],
};

const KEYS = Object.keys(DEFAULT_OKLCH) as CategoryKey[];

export const CATEGORIES: Record<CategoryKey, Category> = Object.fromEntries(
  KEYS.map(k => [k, { key: k, label: LABELS[k][0], short: LABELS[k][1], oklch: DEFAULT_OKLCH[k] }])
) as Record<CategoryKey, Category>;

export const CATEGORY_LIST = Object.values(CATEGORIES);

/** Apply user overrides — mutates CATEGORIES in place. Call once on app start. */
export function applyPaletteOverrides(overrides: Record<string, string> | undefined): void {
  KEYS.forEach(k => {
    const override = overrides?.[k];
    CATEGORIES[k].oklch = override ?? DEFAULT_OKLCH[k];
  });
}

/** Reset a category to its default OKLCH. */
export function resetCategoryColor(key: CategoryKey): void {
  CATEGORIES[key].oklch = DEFAULT_OKLCH[key];
}

/** Génère un gradient CSS linéaire interpolé depuis des poids de catégories */
export function gradientForWeights(weights: Array<[CategoryKey, number]>): string {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let cursor = 0;
  const stops = weights.map(([key, w]) => {
    const c = CATEGORIES[key].oklch;
    const start = (cursor / total) * 100;
    cursor += w;
    const end = (cursor / total) * 100;
    return `${c} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
  });
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

export function dominantColor(weights: Array<[CategoryKey, number]>): string {
  if (!weights.length) return 'oklch(86% 0.17 135)';
  return CATEGORIES[weights[0][0]].oklch;
}

interface OklchValue { L: number; C: number; h: number; css: string }

function parseOklch(str: string): { L: number; C: number; h: number } {
  const m = str.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) return { L: 50, C: 0.1, h: 0 };
  return { L: +m[1], C: +m[2], h: +m[3] };
}

/** Mélange OKLCH barycentrique pondéré (hue interpolée en sin/cos pour wrap-around) */
export function mixOklch(stops: Array<{ str: string; weight: number }>): OklchValue {
  const total = stops.reduce((s, x) => s + x.weight, 0) || 1;
  let L = 0, C = 0, sin = 0, cos = 0;
  stops.forEach(({ str, weight }) => {
    const p = parseOklch(str);
    const w = weight / total;
    L += p.L * w;
    C += p.C * w;
    sin += Math.sin(p.h * Math.PI / 180) * w;
    cos += Math.cos(p.h * Math.PI / 180) * w;
  });
  let h = Math.atan2(sin, cos) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h, css: `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})` };
}

/** Couleur dominante d'un concept (mix de ses catégories pondérées) */
export function conceptDominant(cats: Array<[CategoryKey, number]>): OklchValue {
  if (!cats.length) return { L: 50, C: 0.05, h: 180, css: 'oklch(50% 0.05 180)' };
  const stops = cats.map(([k, w]) => ({ str: CATEGORIES[k].oklch, weight: w }));
  return mixOklch(stops);
}

/** Mix d'une combinaison de concepts pondérés [{cats, weight}] */
export function combinationMix(items: Array<{ cats: Array<[CategoryKey, number]>; weight: number }>): OklchValue {
  const stops: Array<{ str: string; weight: number }> = [];
  items.forEach(it => {
    it.cats.forEach(([k, w]) => {
      stops.push({ str: CATEGORIES[k].oklch, weight: (it.weight / 100) * w });
    });
  });
  if (!stops.length) return { L: 50, C: 0.05, h: 180, css: 'oklch(50% 0.05 180)' };
  return mixOklch(stops);
}
