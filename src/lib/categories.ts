import type { Category, CategoryKey } from '../types';

export const CATEGORIES: Record<CategoryKey, Category> = {
  philosophie: { key: 'philosophie', label: 'Philosophie',      short: 'PHL', oklch: 'oklch(35% 0.13 250)' },
  sciences:    { key: 'sciences',    label: 'Sciences exactes', short: 'SCI', oklch: 'oklch(50% 0.18 155)' },
  humaines:    { key: 'humaines',    label: 'Sc. humaines',     short: 'SHM', oklch: 'oklch(65% 0.14 75)'  },
  economie:    { key: 'economie',    label: 'Économie',         short: 'ECO', oklch: 'oklch(72% 0.16 88)'  },
  litterature: { key: 'litterature', label: 'Littérature',      short: 'LIT', oklch: 'oklch(45% 0.20 330)' },
  arts:        { key: 'arts',        label: 'Arts visuels',     short: 'ART', oklch: 'oklch(60% 0.25 350)' },
  musique:     { key: 'musique',     label: 'Musique',          short: 'MUS', oklch: 'oklch(55% 0.22 28)'  },
  cinema:      { key: 'cinema',      label: 'Cinéma',           short: 'CIN', oklch: 'oklch(65% 0.18 50)'  },
  jeuvideo:    { key: 'jeuvideo',    label: 'Jeu vidéo',        short: 'GAM', oklch: 'oklch(55% 0.24 295)' },
  histoire:    { key: 'histoire',    label: 'Histoire',         short: 'HIS', oklch: 'oklch(42% 0.07 55)'  },
  geographie:  { key: 'geographie',  label: 'Géographie',       short: 'GEO', oklch: 'oklch(68% 0.13 195)' },
  personnages: { key: 'personnages', label: 'Personnages',      short: 'PER', oklch: 'oklch(78% 0.06 0)'   },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

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
