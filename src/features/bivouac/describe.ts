// Bivouac — mise en mots d'un spot.
// Un score et des coordonnées ne disent pas à quoi ressemble un endroit ; ces
// phrases traduisent les mesures en description de terrain.
import type { Spot } from './types';
import { compass, formatDist, walkMin } from './geo';
import { showDriveMin, estimateDriveMin } from './criteria';

export interface Sentence { emoji: string; text: string; tone: 'good' | 'neutral' | 'warn' }

const dir = (bearing?: number) => (bearing === undefined ? '' : ` au ${compass(bearing)}`);

export function describeSpot(s: Spot): Sentence[] {
  const m = s.metrics;
  const a = s.around ?? {};
  const out: Sentence[] = [];

  // ── Baignade : le cœur de la recherche ──
  if (m.dSwim < 3900) {
    const d = formatDist(m.dSwim);
    out.push(m.dSwim <= 500
      ? { emoji: '🏊', tone: 'good', text: `Baignade à ${d}${dir(a.swim?.bearing)} — rivière ou plan d'eau, à ${walkMin(m.dSwim)} min à pied.` }
      : { emoji: '🏊', tone: 'neutral', text: `Eau baignable à ${d}${dir(a.swim?.bearing)}, soit ${walkMin(m.dSwim)} min de marche.` });
  } else {
    out.push({ emoji: '🏊', tone: 'warn', text: "Aucune rivière ni plan d'eau baignable à moins de 4 km." });
  }

  // ── Eau utilitaire (puiser, se laver) ──
  if (m.dWater < 2900 && m.dWater < m.dSwim - 50) {
    out.push({ emoji: '💧', tone: 'neutral', text: `Point d'eau plus modeste (ruisseau ou source) à ${formatDist(m.dWater)}${dir(a.water?.bearing)}.` });
  }

  // ── Couvert forestier ──
  if (m.dEdge <= 0) {
    out.push({ emoji: '🌾', tone: 'warn', text: 'Hors forêt : terrain découvert, peu discret.' });
  } else if (m.dEdge >= 300) {
    out.push({ emoji: '🌲', tone: 'good', text: `Bien à couvert : ${formatDist(m.dEdge)} depuis la lisière la plus proche${dir(a.edge?.bearing)}.` });
  } else {
    out.push({ emoji: '🌲', tone: 'neutral', text: `Proche de la lisière (${formatDist(m.dEdge)}${dir(a.edge?.bearing)}) : couvert limité.` });
  }

  // ── Accès et portage ──
  if (m.dAccess >= 3900) {
    out.push({ emoji: '🥾', tone: 'warn', text: 'Aucune voie carrossable à moins de 4 km : portage très long.' });
  } else {
    const walk = walkMin(m.dAccess);
    out.push(m.dAccess < 120
      ? { emoji: '🥾', tone: 'warn', text: `Presque au bord d'une voie carrossable (${formatDist(m.dAccess)}) : passages possibles.` }
      : m.dAccess <= 900
        ? { emoji: '🥾', tone: 'good', text: `Se gare à ${formatDist(m.dAccess)}${dir(a.access?.bearing)} : ${walk} min de portage, à l'abri des regards.` }
        : { emoji: '🥾', tone: 'neutral', text: `${formatDist(m.dAccess)} depuis la voie la plus proche${dir(a.access?.bearing)} : ${walk} min de marche chargé.` });
  }

  // ── Tranquillité ──
  if (m.dHabitat < 3000) {
    out.push(m.dHabitat >= 1000
      ? { emoji: '🤫', tone: 'good', text: `Habitation la plus proche à ${formatDist(m.dHabitat)}${dir(a.habitat?.bearing)}.` }
      : { emoji: '🏠', tone: 'warn', text: `Habitation à seulement ${formatDist(m.dHabitat)}${dir(a.habitat?.bearing)}.` });
  }
  if (m.dNoise < 600) {
    out.push({ emoji: '🔊', tone: 'warn', text: `Grand axe ou voie ferrée à ${formatDist(m.dNoise)} : le bruit porte la nuit.` });
  }

  // ── Terrain ──
  if (m.slopePct !== undefined) {
    out.push(m.slopePct <= 6
      ? { emoji: '📐', tone: 'good', text: `Terrain plat (pente ${m.slopePct.toFixed(0)} %) : on peut poser une tente.` }
      : m.slopePct <= 15
        ? { emoji: '📐', tone: 'neutral', text: `Pente modérée (${m.slopePct.toFixed(0)} %) : cherche une replat sur place.` }
        : { emoji: '📐', tone: 'warn', text: `Pente forte (${m.slopePct.toFixed(0)} %) : difficile d'y dormir à plat.` });
  }

  // ── Trajet ──
  const drive = showDriveMin(m.driveMin ?? estimateDriveMin(m.crowM));
  out.push({
    emoji: '🚗', tone: drive <= 25 ? 'good' : 'neutral',
    text: `À ${formatDist(m.crowM)} du départ, ~${drive} min de route${m.driveMin === undefined ? ' (estimé)' : ''}.`,
  });

  return out;
}

/** Une ligne de synthèse pour la liste des résultats. */
export function shortVerdict(s: Spot): string {
  const m = s.metrics;
  const bits: string[] = [];
  if (m.dSwim <= 500) bits.push('baignade à deux pas');
  else if (m.dSwim < 1500) bits.push('baignade proche');
  if (m.dEdge >= 300) bits.push('bien à couvert');
  if (m.dAccess >= 120 && m.dAccess <= 900) bits.push('portage court');
  if (m.dHabitat >= 1500) bits.push('isolé');
  if (m.slopePct !== undefined && m.slopePct <= 6) bits.push('plat');
  return bits.length ? bits.join(' · ') : 'compromis moyen';
}
