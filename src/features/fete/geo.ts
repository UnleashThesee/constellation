// Fête de la Musique — calculs purs (distance, temps, statut). Testables.
import type { GeoPoint, Stage } from './types';

const R = 6371000; // rayon Terre (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance à vol d'oiseau entre deux points, en mètres (Haversine). */
export function haversine(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat), lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Temps de marche estimé (minutes) à ~4,8 km/h, avec un facteur trajet réel. */
export function walkingMinutes(meters: number): number {
  const detour = 1.3; // les rues ne sont pas à vol d'oiseau
  return Math.round((meters * detour) / (4800 / 60));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export type Status = 'upcoming' | 'live' | 'past';

export function statusOf(stage: Pick<Stage, 'start' | 'end'>, now: number): Status {
  const s = new Date(stage.start).getTime();
  const e = new Date(stage.end).getTime();
  if (now < s) return 'upcoming';
  if (now >= e) return 'past';
  return 'live';
}

/** ms restantes avant le début (>0) ou 0 si déjà commencé. */
export function msUntilStart(stage: Pick<Stage, 'start'>, now: number): number {
  return Math.max(0, new Date(stage.start).getTime() - now);
}
/** ms restantes avant la fin (>0 si en cours), 0 si terminé. */
export function msUntilEnd(stage: Pick<Stage, 'end'>, now: number): number {
  return Math.max(0, new Date(stage.end).getTime() - now);
}

/** « 1 h 05 », « 12 min », « 45 s ». */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (totalMin > 0) return `${totalMin} min`;
  return `${Math.floor(ms / 1000)} s`;
}

export function formatHM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

export const STATUS_COLOR: Record<Status, string> = {
  live: '#22c55e',     // vert
  upcoming: '#f59e0b', // orange
  past: '#6b7280',     // gris
};
export const STATUS_LABEL: Record<Status, string> = {
  live: 'En ce moment',
  upcoming: 'À venir',
  past: 'Terminé',
};
