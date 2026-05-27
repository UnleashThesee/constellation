import type { Concept, CategoryKey } from '../types';
import { CATEGORIES } from '../lib/categories';

// Glyphe placeholder par domaine — affiché tant que le sprite IA n'est pas généré.
export const CATEGORY_GLYPH: Record<CategoryKey, string> = {
  philosophie: '🦉',
  sciences:    '🔬',
  humaines:    '👥',
  economie:    '💰',
  litterature: '📖',
  arts:        '🎨',
  musique:     '🎵',
  cinema:      '🎬',
  jeuvideo:    '🎮',
  histoire:    '🏛️',
  geographie:  '🗺️',
  personnages: '🧑',
};

export function conceptCategory(c: Concept): CategoryKey {
  return (c.cats?.[0]?.[0] as CategoryKey) ?? 'personnages';
}

/** Style du placeholder (couleur de domaine + glyphe), avant sprite IA. */
export function spriteStyle(c: Concept): { color: string; glyph: string; short: string; cat: CategoryKey } {
  const cat = conceptCategory(c);
  const meta = CATEGORIES[cat] ?? CATEGORIES.personnages;
  return { color: meta.oklch, glyph: CATEGORY_GLYPH[cat] ?? '🧩', short: meta.short, cat };
}

/**
 * URL du sprite pixel-art IA pour un concept, si déjà généré et en cache.
 * Phase 1 : aucun sprite encore → placeholder partout. Phase 2 (Worker + IA
 * externe) remplira ce cache et cette fonction renverra l'URL (R2/data-uri).
 */
export function getSpriteUrl(_c: Concept): string | undefined {
  return undefined;
}
