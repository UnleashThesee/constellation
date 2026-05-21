// Web Worker : exécute la simulation force-directed hors du thread principal
// pour ne pas bloquer l'UI sur les grosses cartes (200+ nœuds).
import { computeForceLayout, type LayoutInput, type LayoutPosition } from './forceLayout';

self.onmessage = (e: MessageEvent<{ items: LayoutInput[]; reqId: number; seed?: Record<string, { x: number; y: number }> }>) => {
  const { items, reqId, seed } = e.data;
  const positions: LayoutPosition[] = computeForceLayout(items, {
    seed,
    iterations: seed && items.every(it => seed[it.id]) ? 30 : 80,
  });
  (self as unknown as Worker).postMessage({ positions, reqId });
};
