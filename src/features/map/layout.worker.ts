// Web Worker : exécute la simulation force-directed hors du thread principal
// pour ne pas bloquer l'UI sur les grosses cartes (200+ nœuds).
import { computeForceLayout, type LayoutInput, type LayoutPosition } from './forceLayout';

self.onmessage = (e: MessageEvent<{ items: LayoutInput[]; reqId: number }>) => {
  const { items, reqId } = e.data;
  const positions: LayoutPosition[] = computeForceLayout(items);
  (self as unknown as Worker).postMessage({ positions, reqId });
};
