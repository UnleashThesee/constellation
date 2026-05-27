import { useEffect, useState } from 'react';
import type { Concept, CategoryKey } from '../types';
import { CATEGORIES } from '../lib/categories';
import { fetchConceptImage } from './wikidata';

// Glyphe placeholder par domaine — affiché tant qu'aucune image n'est disponible.
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

/** Style du placeholder (couleur de domaine + glyphe), avant chargement de l'image. */
export function spriteStyle(c: Concept): { color: string; glyph: string; short: string; cat: CategoryKey } {
  const cat = conceptCategory(c);
  const meta = CATEGORIES[cat] ?? CATEGORIES.personnages;
  return { color: meta.oklch, glyph: CATEGORY_GLYPH[cat] ?? '🧩', short: meta.short, cat };
}

// Cache mémoire des URLs d'images résolues (fetchConceptImage cache déjà 30j en IndexedDB).
const mem = new Map<string, string>();

/**
 * URL de la meilleure image Wikidata/Wikipédia pour un concept (comme la carto) :
 * `portrait` si déjà présent, sinon résolution via fetchConceptImage (cachée).
 * Renvoie undefined tant que rien n'est trouvé → placeholder de domaine.
 */
export function useConceptImage(concept: Concept): string | undefined {
  const direct = concept.portrait?.startsWith('http') ? concept.portrait : undefined;
  const [url, setUrl] = useState<string | undefined>(() => direct ?? mem.get(concept.id));
  useEffect(() => {
    if (direct) { setUrl(direct); return; }
    const cached = mem.get(concept.id);
    if (cached) { setUrl(cached); return; }
    setUrl(undefined);
    let alive = true;
    fetchConceptImage(concept.wikidataId, concept.name)
      .then(u => { if (u) mem.set(concept.id, u); if (alive) setUrl(u); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept.id, direct]);
  return url;
}
