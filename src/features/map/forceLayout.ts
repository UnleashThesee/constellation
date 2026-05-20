// Algorithme force-directed (Fruchterman-Reingold) pur, partagé entre le
// worker (gros graphes) et le thread principal (fallback / petits graphes).
// Ne dépend d'AUCUN module React/DOM pour rester exécutable en Web Worker.

export interface LayoutInput {
  id: string;
  cats: string[];          // clés de catégories (ordre = dominante d'abord)
  isFavorite: boolean;
}

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
  size: number;
}

export function computeForceLayout(items: LayoutInput[]): LayoutPosition[] {
  if (items.length === 0) return [];

  // Init pseudo-radial groupé par catégorie dominante
  const groups: Record<string, LayoutInput[]> = {};
  items.forEach(c => {
    const key = c.cats[0] ?? 'personnages';
    (groups[key] ??= []).push(c);
  });
  const groupKeys = Object.keys(groups);
  const nGroups = groupKeys.length;

  type Sim = { id: string; cats: string[]; fav: boolean; x: number; y: number; dx: number; dy: number };
  const sim: Sim[] = [];
  groupKeys.forEach((gk, gi) => {
    const baseAngle = (gi / Math.max(1, nGroups)) * Math.PI * 2 - Math.PI / 2;
    groups[gk].forEach((c, ci) => {
      const localAngle = baseAngle + ((ci - (groups[gk].length - 1) / 2) * 0.15);
      const r = 22 + (ci % 3) * 5;
      sim.push({
        id: c.id, cats: c.cats, fav: c.isFavorite,
        x: 50 + Math.cos(localAngle) * r,
        y: 50 + Math.sin(localAngle) * r,
        dx: 0, dy: 0,
      });
    });
  });

  // Edges : nœuds partageant ≥ 1 catégorie
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < sim.length; i++) {
    const aCats = new Set(sim[i].cats);
    for (let j = i + 1; j < sim.length; j++) {
      if (sim[j].cats.some(k => aCats.has(k))) edges.push([i, j]);
    }
  }

  const iterations = 80;
  const area = 100 * 100;
  const k = Math.sqrt(area / Math.max(1, sim.length));
  for (let it = 0; it < iterations; it++) {
    sim.forEach(n => { n.dx = 0; n.dy = 0; });
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const dx = sim[i].x - sim[j].x;
        const dy = sim[i].y - sim[j].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / d;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        sim[i].dx += fx; sim[i].dy += fy;
        sim[j].dx -= fx; sim[j].dy -= fy;
      }
    }
    edges.forEach(([i, j]) => {
      const dx = sim[i].x - sim[j].x;
      const dy = sim[i].y - sim[j].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (d * d) / k;
      const fx = (dx / d) * force * 0.5;
      const fy = (dy / d) * force * 0.5;
      sim[i].dx -= fx; sim[i].dy -= fy;
      sim[j].dx += fx; sim[j].dy += fy;
    });
    sim.forEach(n => {
      n.dx += (50 - n.x) * 0.03;
      n.dy += (50 - n.y) * 0.03;
    });
    const temp = 6 * (1 - it / iterations);
    sim.forEach(n => {
      const d = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 0.01;
      n.x += (n.dx / d) * Math.min(d, temp);
      n.y += (n.dy / d) * Math.min(d, temp);
      n.x = Math.max(8, Math.min(92, n.x));
      n.y = Math.max(10, Math.min(86, n.y));
    });
  }

  return sim.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    size: 14 + Math.min(8, n.cats.length * 2) + (n.fav ? 4 : 0),
  }));
}
