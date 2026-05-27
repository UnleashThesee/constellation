import { useEffect, useState } from 'react';
import type { Concept, CategoryKey } from '../types';
import { CATEGORIES } from '../lib/categories';
import { db } from '../stores/db';

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

// ── Cache des sprites pixel-art IA ───────────────────────────────────────────
// Mémoire (synchrone, pour le rendu) → IndexedDB (persistant) → Worker /api/sprite.
const mem = new Map<string, string>();          // conceptId → data-URI
const inflight = new Map<string, Promise<string | undefined>>();
const failed = new Set<string>();                // évite de re-tenter en boucle

/** Sprite déjà en mémoire (synchrone), sinon undefined. */
export function getSprite(id: string): string | undefined {
  return mem.get(id);
}

/** Réduit le PNG renvoyé par l'IA en petite data-URI ~72px (IndexedDB léger + rendu net). */
async function downscaleToDataUri(blob: Blob, size = 72): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, size, size);
  bmp.close?.();
  return canvas.toDataURL('image/png');
}

/**
 * Garantit un sprite pour le concept : mémoire → IndexedDB → génération IA.
 * Renvoie la data-URI, ou undefined (échec/clé absente → on garde le placeholder).
 */
export function ensureSprite(concept: Concept): Promise<string | undefined> {
  const id = concept.id;
  const cached = mem.get(id);
  if (cached) return Promise.resolve(cached);
  if (failed.has(id)) return Promise.resolve(undefined);
  const existing = inflight.get(id);
  if (existing) return existing;

  const p = (async (): Promise<string | undefined> => {
    try {
      const rec = await db.sprites.get(id);
      if (rec?.dataUri) { mem.set(id, rec.dataUri); return rec.dataUri; }
    } catch { /* ignore */ }
    try {
      const { cat } = spriteStyle(concept);
      const res = await fetch(`/api/sprite?name=${encodeURIComponent(concept.name)}&cat=${encodeURIComponent(cat)}`);
      if (!res.ok) { failed.add(id); return undefined; }
      const dataUri = await downscaleToDataUri(await res.blob());
      mem.set(id, dataUri);
      db.sprites.put({ id, dataUri, createdAt: new Date() }).catch(() => {});
      return dataUri;
    } catch {
      failed.add(id);
      return undefined;
    }
  })();
  inflight.set(id, p);
  p.finally(() => inflight.delete(id));
  return p;
}

/**
 * Hook : renvoie la data-URI du sprite (ou undefined → placeholder).
 * `delayMs` permet de différer la génération (ex. carte affichée) pour ne pas
 * générer les concepts qu'on survole/zappe trop vite.
 */
export function useSprite(concept: Concept, delayMs = 0): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => mem.get(concept.id));
  useEffect(() => {
    const cached = mem.get(concept.id);
    if (cached) { setUrl(cached); return; }
    setUrl(undefined);
    let alive = true;
    const t = setTimeout(() => {
      ensureSprite(concept).then(u => { if (alive && u) setUrl(u); }).catch(() => {});
    }, delayMs);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept.id]);
  return url;
}
