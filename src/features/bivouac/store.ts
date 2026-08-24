// Bivouac — persistance locale (aucun compte, aucun serveur).
import type { LatLng, SavedSpot, Weights } from './types';
import { defaultWeights } from './criteria';

const K = {
  origin: 'bivouac.origin',
  weights: 'bivouac.weights',
  settings: 'bivouac.settings',
  saved: 'bivouac.saved',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v as T;
  } catch { return fallback; }
}

function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / mode privé */ }
}

export interface Origin extends LatLng { label: string }

/** Dijon par défaut, mais l'outil marche partout. */
export const DEFAULT_ORIGIN: Origin = { lat: 47.3220, lng: 5.0415, label: 'Dijon' };

export interface Settings {
  radiusKm: number;
  gridStep: number;
  minSeparation: number;
  maxResults: number;
  requireForest: boolean;
  refine: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  radiusKm: 12,
  gridStep: 150,
  minSeparation: 800,
  maxResults: 40,
  requireForest: true,
  refine: true,
};

export const loadOrigin = (): Origin => {
  const o = read<Partial<Origin>>(K.origin, DEFAULT_ORIGIN);
  return typeof o.lat === 'number' && typeof o.lng === 'number'
    ? { lat: o.lat, lng: o.lng, label: o.label ?? 'Point de départ' }
    : DEFAULT_ORIGIN;
};
export const saveOrigin = (o: Origin) => write(K.origin, o);

export const loadWeights = (): Weights => ({ ...defaultWeights(), ...read<Weights>(K.weights, {}) });
export const saveWeights = (w: Weights) => write(K.weights, w);

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K.settings, {}) });
export const saveSettings = (s: Settings) => write(K.settings, s);

export const loadSaved = (): SavedSpot[] => {
  const v = read<SavedSpot[]>(K.saved, []);
  return Array.isArray(v) ? v.filter(s => s && typeof s.lat === 'number' && typeof s.lng === 'number') : [];
};
export const saveSaved = (list: SavedSpot[]) => write(K.saved, list);

/** Sérialise la sélection pour l'envoyer aux copains. */
export const exportSaved = (list: SavedSpot[]) => JSON.stringify(list, null, 2);

/** Relit un export, en tolérant un fichier partiellement abîmé. */
export function importSaved(text: string): SavedSpot[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Le fichier doit contenir une liste de spots.');
  const out = parsed.filter((s): s is SavedSpot =>
    !!s && typeof s === 'object' &&
    typeof (s as SavedSpot).lat === 'number' && typeof (s as SavedSpot).lng === 'number');
  if (out.length === 0) throw new Error('Aucun spot valide trouvé dans ce fichier.');
  return out;
}

/** Fusionne deux listes en dédoublonnant sur la position (~11 m près). */
export function mergeSaved(a: SavedSpot[], b: SavedSpot[]): SavedSpot[] {
  const key = (s: SavedSpot) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
  const map = new Map(a.map(s => [key(s), s]));
  for (const s of b) if (!map.has(key(s))) map.set(key(s), s);
  return [...map.values()].sort((x, y) => y.savedAt - x.savedAt);
}
