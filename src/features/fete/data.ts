// Fête de la Musique — Dijon, dimanche 21 juin 2026.
// Lieux & genres RÉELS (communication officielle + presse locale, édition canicule :
// scène centrale déplacée place Darcy, arrêt 22h30). Les NOMS DE GROUPES et les
// horaires set-par-set ci-dessous sont FICTIFS (exemple) — à remplacer par le vrai
// programme (⚙ Réglages → import JSON). Plusieurs sets par scène pour illustrer
// l'enchaînement « qui passe maintenant / ensuite ». Coordonnées approximatives.
import type { Stage, FeteConfig } from './types';

export const DEFAULT_CONFIG: FeteConfig = {
  city: 'Dijon',
  date: '2026-06-21',
  center: { lat: 47.3221, lng: 5.0398 },
};

const D = DEFAULT_CONFIG.date;
const at = (hhmm: string) => `${D}T${hhmm}:00`;

interface Venue { loc: string; lat: number; lng: number; genre: string; acts: [string, string, string][] } // [name, start, end]

const VENUES: Venue[] = [
  { loc: 'Place Darcy', lat: 47.3232, lng: 5.0345, genre: 'Grand public', acts: [
    ['Harmonie de Dijon (ouverture)', '17:00', '18:30'],
    ['Les Voix de la Côte', '18:30', '20:00'],
    ['Cover Pop & Variété', '20:00', '21:15'],
    ['Clôture festive', '21:15', '22:30'],
  ] },
  { loc: 'Square des Bénédictins', lat: 47.3210, lng: 5.0360, genre: 'Électro', acts: [
    ['DJ Cassis', '17:00', '19:00'],
    ['Selecta Kir', '19:00', '21:00'],
    ['Tram by Night (B2B)', '21:00', '22:30'],
  ] },
  { loc: 'Place des Cordeliers', lat: 47.3206, lng: 5.0467, genre: 'Jazz', acts: [
    ['Trio Moutarde', '17:00', '18:30'],
    ['Quartet Bourgogne', '18:30', '20:00'],
    ['Swing des Ducs', '20:00', '21:30'],
    ['Jam de clôture', '21:30', '22:30'],
  ] },
  { loc: 'Jardin des Apothicaires', lat: 47.3188, lng: 5.0440, genre: 'Métal', acts: [
    ['Vieille Garde', '17:30', '19:00'],
    ['Fonderie', '19:00', '20:30'],
    ['Acier Trempé', '20:30', '22:30'],
  ] },
  { loc: 'Parvis Saint-Philibert', lat: 47.3222, lng: 5.0378, genre: 'Rap', acts: [
    ['Scène ouverte / Open mic', '17:00', '18:30'],
    ['Cyphers du 21', '18:30', '20:00'],
    ['Plume & Beats', '20:00', '21:30'],
    ['Tête d\'affiche locale', '21:30', '22:30'],
  ] },
  { loc: 'Cour de Vogüé', lat: 47.3229, lng: 5.0428, genre: 'Chanson française', acts: [
    ['À la française', '17:00', '18:30'],
    ['Guinguette moderne', '18:30', '20:00'],
    ['Tour de chant', '20:00', '22:30'],
  ] },
  { loc: 'Place François-Rude', lat: 47.3221, lng: 5.0398, genre: 'Programmation variée', acts: [
    ['Bal & fanfare', '17:00', '19:30'],
    ['Scène libre', '19:30', '22:30'],
  ] },
  { loc: 'Place Jean-Macé', lat: 47.3170, lng: 5.0438, genre: 'Programmation variée', acts: [
    ['Tremplin jeunes', '17:00', '20:00'],
    ['Découvertes', '20:00', '22:30'],
  ] },
];

const PREOPEN: { loc: string; lat: number; lng: number }[] = [
  { loc: 'Port du canal', lat: 47.3148, lng: 5.0470 },
  { loc: 'Parvis de la Cité internationale de la gastronomie', lat: 47.3168, lng: 5.0282 },
  { loc: 'Place Sainte-Chapelle', lat: 47.3219, lng: 5.0430 },
  { loc: 'Rue de la Liberté', lat: 47.3224, lng: 5.0395 },
  { loc: 'Place Bossuet', lat: 47.3228, lng: 5.0399 },
];

let n = 0;
const id = () => `dj-${++n}`;

export const DEFAULT_PROGRAM: Stage[] = [
  ...VENUES.flatMap(v => v.acts.map(([name, s, e]): Stage => ({
    id: id(), name, genre: v.genre, locationName: v.loc, lat: v.lat, lng: v.lng, start: at(s), end: at(e),
  }))),
  ...PREOPEN.map((p): Stage => ({
    id: id(), name: 'Fanfares & batucadas', genre: 'Acoustique / Rue', locationName: p.loc, lat: p.lat, lng: p.lng,
    start: at('16:00'), end: at('17:00'),
  })),
];
