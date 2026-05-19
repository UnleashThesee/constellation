// Petit store module-level pour passer de l'état entre écrans
// sans dépendre de React Router (que la spec autorise, mais qu'on n'a pas).

import type { SavedCombination } from '../types';

let pendingCombo: SavedCombination | null = null;

export function setPendingCombo(c: SavedCombination | null): void {
  pendingCombo = c;
}

export function consumePendingCombo(): SavedCombination | null {
  const c = pendingCombo;
  pendingCombo = null;
  return c;
}
