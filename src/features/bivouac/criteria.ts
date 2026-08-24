// Bivouac — critères de notation.
// Chaque critère transforme une mesure brute (mètres, %, minutes) en note 0–100.
// Les courbes sont volontairement « à plateau » : au-delà d'un certain confort,
// gagner 200 m de plus ne change rien, ça évite que le score soit dominé par un
// seul critère extrême.
import type { Metrics, Weights } from './types';

/** 0 en `lo`, 100 en `hi` (plus c'est grand, mieux c'est). */
export function asc(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 50;
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

/** 100 en `lo`, 0 en `hi` (plus c'est petit, mieux c'est). */
export function desc(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 50;
  return Math.max(0, Math.min(100, ((hi - v) / (hi - lo)) * 100));
}

/** Plateau à 100 sur [a,b], décroissant jusqu'à 0 en `lo` et `hi`. */
export function band(v: number, lo: number, a: number, b: number, hi: number): number {
  if (v >= a && v <= b) return 100;
  if (v < a) return asc(v, lo, a);
  return desc(v, b, hi);
}

/**
 * Estimation de trajet voiture depuis une distance à vol d'oiseau.
 * Non arrondie : l'arrondi ferait perdre tout pouvoir de discrimination entre
 * deux spots proches quand le rayon de recherche est petit.
 */
export function estimateDriveMin(crowM: number): number {
  const km = (crowM / 1000) * 1.35;          // détour routier moyen
  const speed = km < 5 ? 32 : km < 15 ? 48 : 60; // km/h, du périurbain à la départementale
  return (km / speed) * 60;
}

/** Minutes de trajet arrondies pour l'affichage. */
export const showDriveMin = (min: number) => Math.max(1, Math.round(min));

export interface CriterionCtx { radiusKm: number }

export interface Criterion {
  id: string;
  emoji: string;
  label: string;
  hint: string;
  defaultWeight: number;
  /** Note 0–100, ou undefined si la donnée manque. */
  score: (m: Metrics, ctx: CriterionCtx) => number | undefined;
  /** Valeur lisible pour l'UI. */
  detail: (m: Metrics) => string;
}

const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

export const CRITERIA: Criterion[] = [
  {
    id: 'water', emoji: '💧', label: 'Eau à proximité',
    hint: "Idéal entre 30 m et 300 m d'un cours d'eau : de quoi puiser sans camper dans l'humide.",
    defaultWeight: 3,
    // à 0 m on n'est pas à 0/100 (un spot à 10 m d'un ruisseau reste très bon),
    // d'où la borne basse négative.
    score: (m) => band(m.dWater, -120, 30, 300, 1500),
    detail: (m) => `cours d'eau à ${fmt(m.dWater)}`,
  },
  {
    id: 'depth', emoji: '🌲', label: 'Profondeur de forêt',
    hint: "Distance jusqu'à la lisière la plus proche. Plus c'est profond, plus c'est discret et abrité.",
    defaultWeight: 3,
    score: (m) => asc(m.dEdge, 0, 400),
    detail: (m) => `${fmt(m.dEdge)} depuis la lisière`,
  },
  {
    id: 'carry', emoji: '🥾', label: 'Portage depuis la voiture',
    hint: 'Assez loin pour être tranquille, assez près pour porter le matos : 150 m à 900 m.',
    defaultWeight: 2,
    score: (m) => band(m.dAccess, 0, 150, 900, 3000),
    detail: (m) => `${fmt(m.dAccess)} à pied depuis une voie carrossable`,
  },
  {
    id: 'solitude', emoji: '🤫', label: 'Loin des habitations',
    hint: 'Distance à la maison ou au hameau le plus proche.',
    defaultWeight: 2,
    score: (m) => asc(m.dHabitat, 120, 1800),
    detail: (m) => `habitation à ${fmt(m.dHabitat)}`,
  },
  {
    id: 'quiet', emoji: '🔇', label: 'Loin des axes bruyants',
    hint: 'Grandes routes et voies ferrées : le bruit porte loin la nuit.',
    defaultWeight: 2,
    score: (m) => asc(m.dNoise, 150, 1500),
    detail: (m) => `axe bruyant à ${fmt(m.dNoise)}`,
  },
  {
    id: 'flat', emoji: '📐', label: 'Terrain plat',
    hint: 'Pente estimée par altimétrie. En dessous de 5 % on dort à plat.',
    defaultWeight: 2,
    score: (m) => (m.slopePct === undefined ? undefined : desc(m.slopePct, 4, 22)),
    detail: (m) => (m.slopePct === undefined ? 'pente non mesurée' : `pente ~${m.slopePct.toFixed(0)} %`),
  },
  {
    id: 'drive', emoji: '🚗', label: 'Trajet depuis le départ',
    hint: 'Temps de voiture depuis ton point de départ.',
    defaultWeight: 2,
    // Borne basse à 0 : « le plus court possible » est un objectif explicite, donc
    // la note doit rester strictement décroissante, même sur un petit rayon.
    score: (m, ctx) => {
      const min = m.driveMin ?? estimateDriveMin(m.crowM);
      const worst = Math.max(10, estimateDriveMin(ctx.radiusKm * 1000));
      return desc(min, 0, worst);
    },
    detail: (m) => {
      const min = m.driveMin ?? estimateDriveMin(m.crowM);
      return `~${showDriveMin(min)} min de voiture${m.driveMin === undefined ? ' (estimé)' : ''}`;
    },
  },
];

export const CRITERION_BY_ID: Record<string, Criterion> = Object.fromEntries(CRITERIA.map(c => [c.id, c]));

export const defaultWeights = (): Weights =>
  Object.fromEntries(CRITERIA.map(c => [c.id, c.defaultWeight]));

/** Notes par critère + score global pondéré (les critères sans donnée sont ignorés). */
export function scoreMetrics(m: Metrics, weights: Weights, ctx: CriterionCtx): { scores: Record<string, number>; total: number } {
  const scores: Record<string, number> = {};
  let sum = 0, wsum = 0;
  for (const c of CRITERIA) {
    const s = c.score(m, ctx);
    if (s === undefined) continue;
    scores[c.id] = s;
    const w = weights[c.id] ?? 0;
    if (w > 0) { sum += s * w; wsum += w; }
  }
  return { scores, total: wsum > 0 ? sum / wsum : 0 };
}

export interface Preset { id: string; emoji: string; label: string; weights: Weights }

export const PRESETS: Preset[] = [
  { id: 'wild', emoji: '🌲', label: 'Sauvage & profond', weights: { water: 2, depth: 5, carry: 2, solitude: 4, quiet: 3, flat: 2, drive: 1 } },
  { id: 'water', emoji: '💧', label: "Au bord de l'eau", weights: { water: 5, depth: 2, carry: 2, solitude: 2, quiet: 2, flat: 2, drive: 2 } },
  { id: 'easy', emoji: '🚗', label: 'Facile & proche', weights: { water: 2, depth: 1, carry: 4, solitude: 1, quiet: 2, flat: 3, drive: 5 } },
  { id: 'balanced', emoji: '⚖️', label: 'Équilibré', weights: defaultWeights() },
];

/** Couleur d'un score, du rouge au vert. */
export function scoreColor(total: number): string {
  if (total >= 80) return '#22c55e';
  if (total >= 65) return '#84cc16';
  if (total >= 50) return '#eab308';
  if (total >= 35) return '#f97316';
  return '#ef4444';
}
