// Fête de la Musique — persistance locale (localStorage).
import type { Stage, FeteConfig } from './types';
import { DEFAULT_PROGRAM, DEFAULT_CONFIG } from './data';

const K_PROG = 'fete:program';
const K_KEY = 'fete:gmapsKey';
const K_CONF = 'fete:config';

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export function loadProgram(): Stage[] { return read<Stage[]>(K_PROG, DEFAULT_PROGRAM); }
export function saveProgram(p: Stage[]) { write(K_PROG, p); }
export function resetProgram(): Stage[] { write(K_PROG, DEFAULT_PROGRAM); return DEFAULT_PROGRAM; }

export function loadConfig(): FeteConfig { return read<FeteConfig>(K_CONF, DEFAULT_CONFIG); }
export function saveConfig(c: FeteConfig) { write(K_CONF, c); }

export function loadKey(): string { try { return localStorage.getItem(K_KEY) ?? ''; } catch { return ''; } }
export function saveKey(k: string) { try { localStorage.setItem(K_KEY, k); } catch { /* ignore */ } }

/** Valide un import JSON de programme (tableau de stages minimal). */
export function parseProgram(json: string): Stage[] {
  const data = JSON.parse(json);
  const arr = Array.isArray(data) ? data : Array.isArray(data?.program) ? data.program : null;
  if (!arr) throw new Error('Le JSON doit être un tableau de groupes (ou { program: [...] }).');
  return arr.map((s: Record<string, unknown>, i: number): Stage => {
    if (typeof s.name !== 'string' || typeof s.lat !== 'number' || typeof s.lng !== 'number'
      || typeof s.start !== 'string' || typeof s.end !== 'string') {
      throw new Error(`Groupe #${i + 1} invalide : il faut au moins name, lat, lng, start, end.`);
    }
    return {
      id: typeof s.id === 'string' ? s.id : `imp-${i + 1}`,
      name: s.name,
      genre: typeof s.genre === 'string' ? s.genre : undefined,
      locationName: typeof s.locationName === 'string' ? s.locationName : '',
      address: typeof s.address === 'string' ? s.address : undefined,
      lat: s.lat, lng: s.lng, start: s.start, end: s.end,
      description: typeof s.description === 'string' ? s.description : undefined,
    };
  });
}

export function exportProgram(p: Stage[]): string {
  return JSON.stringify(p, null, 2);
}
