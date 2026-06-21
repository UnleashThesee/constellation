// Fête de la Musique — Dijon, dimanche 21 juin 2026.
// Programme réel (lieux + genres + créneaux) d'après la communication officielle
// et la presse locale (jds.fr, dijon.fr, dijon-actualites.fr — édition « canicule »).
// Les NOMS DE GROUPES précis et les horaires set-par-set n'étaient pas publiés :
// chaque scène est donc un créneau 17h00→22h30 (arrêté municipal : arrêt à 22h30).
// ⚠️ Certaines COORDONNÉES sont approximatives (à ajuster si besoin).
// Adaptation canicule : la scène de la place de la Libération a été déplacée
// place Darcy (préservation des fontaines / point de fraîcheur).
import type { Stage, FeteConfig } from './types';

export const DEFAULT_CONFIG: FeteConfig = {
  city: 'Dijon',
  date: '2026-06-21',
  center: { lat: 47.3221, lng: 5.0398 }, // François-Rude (cœur piéton)
};

const D = DEFAULT_CONFIG.date;
const at = (hhmm: string) => `${D}T${hhmm}:00`;

let n = 0;
const mk = (s: Omit<Stage, 'id'>): Stage => ({ id: `dj-${++n}`, ...s });

const OPEN = at('17:00');
const CLOSE = at('22:30');

export const DEFAULT_PROGRAM: Stage[] = [
  // ── Scènes thématiques (17h → 22h30) ──────────────────────────────────────
  mk({ name: 'Scène centrale', genre: 'Grand public', locationName: 'Place Darcy', lat: 47.3232, lng: 5.0345, start: OPEN, end: CLOSE, description: 'Scène principale, déplacée de la place de la Libération en raison de la canicule.' }),
  mk({ name: 'Scène Électro', genre: 'Électro', locationName: 'Square des Bénédictins', lat: 47.3210, lng: 5.0360, start: OPEN, end: CLOSE }),
  mk({ name: 'Scène Jazz', genre: 'Jazz', locationName: 'Place des Cordeliers', lat: 47.3206, lng: 5.0467, start: OPEN, end: CLOSE }),
  mk({ name: 'Scène Métal', genre: 'Métal', locationName: 'Jardin des Apothicaires', lat: 47.3188, lng: 5.0440, start: OPEN, end: CLOSE }),
  mk({ name: 'Scène Rap', genre: 'Rap', locationName: 'Parvis Saint-Philibert', lat: 47.3222, lng: 5.0378, start: OPEN, end: CLOSE }),
  mk({ name: 'Scène Chanson', genre: 'Chanson française', locationName: 'Cour de Vogüé', lat: 47.3229, lng: 5.0428, start: OPEN, end: CLOSE }),
  mk({ name: 'Scène Place François-Rude', genre: 'Programmation variée', locationName: 'Place François-Rude', lat: 47.3221, lng: 5.0398, start: OPEN, end: CLOSE }),
  mk({ name: 'Scène Place Jean-Macé', genre: 'Programmation variée', locationName: 'Place Jean-Macé', lat: 47.3170, lng: 5.0438, start: OPEN, end: CLOSE }),

  // ── Avant-ouverture acoustique (16h → 17h) : fanfares, batucadas, groupes de rue ─
  mk({ name: 'Fanfares & batucadas', genre: 'Acoustique / Rue', locationName: 'Port du canal', lat: 47.3148, lng: 5.0470, start: at('16:00'), end: at('17:00') }),
  mk({ name: 'Fanfares & batucadas', genre: 'Acoustique / Rue', locationName: 'Parvis de la Cité internationale de la gastronomie', lat: 47.3168, lng: 5.0282, start: at('16:00'), end: at('17:00') }),
  mk({ name: 'Fanfares & batucadas', genre: 'Acoustique / Rue', locationName: 'Place Sainte-Chapelle', lat: 47.3219, lng: 5.0430, start: at('16:00'), end: at('17:00') }),
  mk({ name: 'Fanfares & batucadas', genre: 'Acoustique / Rue', locationName: 'Rue de la Liberté', lat: 47.3224, lng: 5.0395, start: at('16:00'), end: at('17:00') }),
  mk({ name: 'Fanfares & batucadas', genre: 'Acoustique / Rue', locationName: 'Place Bossuet', lat: 47.3228, lng: 5.0399, start: at('16:00'), end: at('17:00') }),
];
