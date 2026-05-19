// Petit store module-level pour passer de l'état entre écrans
// sans dépendre de React Router (que la spec autorise, mais qu'on n'a pas).

import type { SavedCombination, Concept } from '../types';

let pendingCombo: SavedCombination | null = null;

export function setPendingCombo(c: SavedCombination | null): void {
  pendingCombo = c;
}

export function consumePendingCombo(): SavedCombination | null {
  const c = pendingCombo;
  pendingCombo = null;
  return c;
}

/** Concepts pré-sélectionnés (avec poids égaux) pour pré-remplir le combinator. */
let pendingConcepts: Concept[] | null = null;

export function setPendingConcepts(cs: Concept[] | null): void {
  pendingConcepts = cs;
}

export function consumePendingConcepts(): Concept[] | null {
  const c = pendingConcepts;
  pendingConcepts = null;
  return c;
}

/** Deck à injecter dans le SwipeScreen (utilisé par BoostModal pour la série de 20). */
let pendingSwipeDeck: { deck: Concept[]; label: string } | null = null;

export function setPendingSwipeDeck(deck: Concept[], label: string): void {
  pendingSwipeDeck = { deck, label };
}

export function consumePendingSwipeDeck(): { deck: Concept[]; label: string } | null {
  const c = pendingSwipeDeck;
  pendingSwipeDeck = null;
  return c;
}
