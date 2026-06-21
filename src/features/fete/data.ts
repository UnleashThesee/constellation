// Fête de la Musique — programme d'EXEMPLE pour Dijon.
// ⚠️ Ce n'est PAS le vrai programme : lieux/coordonnées réels, mais groupes et
// horaires fictifs. À remplacer par le vrai programme (import JSON dans la page).
import type { Stage, FeteConfig } from './types';

export const DEFAULT_CONFIG: FeteConfig = {
  city: 'Dijon',
  date: '2026-06-21',
  center: { lat: 47.3216, lng: 5.0415 }, // Place de la Libération
};

const D = DEFAULT_CONFIG.date;
const at = (hhmm: string) => `${D}T${hhmm}:00`;

let n = 0;
const mk = (s: Omit<Stage, 'id'>): Stage => ({ id: `ex-${++n}`, ...s });

export const DEFAULT_PROGRAM: Stage[] = [
  mk({ name: 'La Grande Fanfare', genre: 'Fanfare', locationName: 'Place de la Libération', lat: 47.3216, lng: 5.0415, start: at('18:00'), end: at('19:30'), description: 'Ouverture festive devant le Palais des Ducs.' }),
  mk({ name: 'Trio Moutarde', genre: 'Jazz', locationName: 'Place François Rude', lat: 47.3221, lng: 5.0398, start: at('18:30'), end: at('20:00') }),
  mk({ name: 'Les Échos du Tram', genre: 'Pop / Rock', locationName: 'Place de la République', lat: 47.3270, lng: 5.0410, start: at('19:00'), end: at('21:00') }),
  mk({ name: 'Chorale Saint-Bénigne', genre: 'Chant / Gospel', locationName: 'Place Saint-Michel', lat: 47.3224, lng: 5.0447, start: at('19:00'), end: at('20:30') }),
  mk({ name: 'DJ Cassis', genre: 'Électro', locationName: 'Jardin Darcy', lat: 47.3232, lng: 5.0345, start: at('20:00'), end: at('23:30'), description: 'Set électro en plein air.' }),
  mk({ name: 'Quatuor des Ducs', genre: 'Classique', locationName: 'Grand Théâtre', lat: 47.3219, lng: 5.0428, start: at('20:00'), end: at('21:30') }),
  mk({ name: 'Bal Musette du Bareuzai', genre: 'Musette', locationName: 'Place François Rude', lat: 47.3221, lng: 5.0398, start: at('20:30'), end: at('22:30') }),
  mk({ name: 'Reggae sous les Halles', genre: 'Reggae', locationName: 'Place Émile Zola', lat: 47.3169, lng: 5.0411, start: at('21:00'), end: at('23:00') }),
  mk({ name: 'Rock à la Chouette', genre: 'Rock', locationName: 'Place Notre-Dame', lat: 47.3225, lng: 5.0420, start: at('21:30'), end: at('23:30') }),
  mk({ name: 'Afrobeat Cordeliers', genre: 'Afrobeat', locationName: 'Place des Cordeliers', lat: 47.3205, lng: 5.0468, start: at('22:00'), end: at('23:59') }),
  mk({ name: 'Clôture Symphonique', genre: 'Orchestre', locationName: 'Place de la Libération', lat: 47.3216, lng: 5.0415, start: at('22:30'), end: at('23:59'), description: 'Grand final.' }),
];
