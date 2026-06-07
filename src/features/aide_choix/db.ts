// Aide au choix — base locale isolée (Dexie/IndexedDB), indépendante de Constellation.
import Dexie, { type Table } from 'dexie';
import type {
  ACSession, ACProject, ACTriVote, ACScore, ACDuel,
  Stage, TriVote, Participant, Criterion,
} from './types';

class AideChoixDB extends Dexie {
  sessions!: Table<ACSession, string>;
  projects!: Table<ACProject, string>;
  triVotes!: Table<ACTriVote, string>;
  scores!: Table<ACScore, string>;
  duels!: Table<ACDuel, string>;

  constructor() {
    super('aide_choix');
    this.version(1).stores({
      sessions: 'id, createdAt',
      projects: 'id, sessionId, order',
      triVotes: 'id, sessionId, projectId, participantId',
      scores:   'id, sessionId, projectId, participantId, criterionId',
      duels:    'id, sessionId',
    });
  }
}

export const acdb = new AideChoixDB();

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ── Critères par défaut (modifiables au setup) ───────────────────────────────
// 5 méta-critères notés. Une seule note par critère, mais on garde ses
// sous-variables en tête (checklist) au moment de noter — 5 notes au lieu de 12.
export const DEFAULT_CRITERIA: Omit<Criterion, 'id'>[] = [
  {
    name: 'Attractivité de la demande',
    definition: 'Y a-t-il un vrai besoin, large, qui peut payer ?',
    checklist: ['Pain point réel', 'Taille du marché', 'Solvabilité du client'],
    weight: 1,
  },
  {
    name: 'Position concurrentielle',
    definition: 'Peut-on entrer et prendre de la place ?',
    checklist: ["Capacité d'insertion concurrentielle", 'Buzzabilité (se faire remarquer / surfer sur un porteur)'],
    weight: 1,
  },
  {
    name: 'Économie du modèle',
    definition: 'La machine à cash est-elle saine et rentable vite ?',
    checklist: ['Scalabilité', 'Rapidité du ROI'],
    weight: 1,
  },
  {
    name: 'Effort de réalisation',
    definition: 'Combien de travail pour le sortir et le maintenir ? (note haute = peu d\'effort)',
    checklist: ['Facilité de prototypage', 'Maintenance post-launch'],
    weight: 1,
  },
  {
    name: 'Risque & autonomie',
    definition: 'Qu\'est-ce qui peut nous contraindre ou nous tuer, et est-on libres ? (note haute = peu de risque / très autonome)',
    checklist: ['Faible risque réglementaire', 'Indépendance aux acteurs extérieurs', 'Facilité d\'exit'],
    weight: 1,
  },
];

// Variables catégorielles : des FILTRES (non notés), pour regrouper les projets.
export const CATEGORICAL_DIMS = [
  { key: 'essence', label: 'Essence', options: ['Upscale', 'Démocratisation', 'Invention'] },
  { key: 'clientCategory', label: 'Catégorie client', options: ['Ultra-riche', 'Aisé', 'Classe moyenne', 'Grand public', 'Gratuit'] },
  { key: 'revenueType', label: 'Type de revenu', options: ['Abonnement', 'Licence', 'Pay-as-you-go', 'Fixe', 'Freemium'] },
  { key: 'projectType', label: 'Type', options: ['Physique', 'Conseil', 'Logiciel', 'Communauté'] },
] as const;

// TOR → une seule dimension « intensité capitalistique » (3 drapeaux).
export const RESOURCE_FLAGS = [
  { key: 'loan', label: 'Prêts' },
  { key: 'stock', label: 'Stock' },
  { key: 'externalInput', label: 'Apport externe' },
] as const;

/** Niveau d'intensité capitalistique : nb de ressources à immobiliser (0–3). */
export function capitalIntensity(meta?: import('./types').ProjectMeta): number {
  if (!meta) return 0;
  return (meta.loan ? 1 : 0) + (meta.stock ? 1 : 0) + (meta.externalInput ? 1 : 0);
}

const PALETTE = ['#eab308', '#38bdf8', '#fb7185', '#34d399', '#a78bfa', '#f97316'];

export function makeParticipants(names: string[]): Participant[] {
  return names.map((name, i) => ({ id: uid(), name: name.trim() || `Personne ${i + 1}`, color: PALETTE[i % PALETTE.length] }));
}
export function makeCriteria(defs: Omit<Criterion, 'id'>[]): Criterion[] {
  return defs.map(d => ({ id: uid(), ...d }));
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export async function createSession(input: {
  name: string; participantNames: string[]; criteria?: Omit<Criterion, 'id'>[];
}): Promise<ACSession> {
  const now = Date.now();
  const session: ACSession = {
    id: uid(),
    name: input.name.trim() || 'Session sans titre',
    stage: 'setup',
    participants: makeParticipants(input.participantNames),
    criteria: makeCriteria(input.criteria ?? DEFAULT_CRITERIA),
    topGroupSize: 6,
    duelMode: 'roundRobin',
    createdAt: now,
    updatedAt: now,
  };
  await acdb.sessions.add(session);
  return session;
}

export async function listSessions(): Promise<ACSession[]> {
  return (await acdb.sessions.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getSession(id: string): Promise<ACSession | undefined> {
  return acdb.sessions.get(id);
}
export async function patchSession(id: string, patch: Partial<ACSession>): Promise<void> {
  await acdb.sessions.update(id, { ...patch, updatedAt: Date.now() });
}
export async function setStage(id: string, stage: Stage): Promise<void> {
  await patchSession(id, { stage });
}
export async function deleteSession(id: string): Promise<void> {
  await acdb.transaction('rw', [acdb.sessions, acdb.projects, acdb.triVotes, acdb.scores, acdb.duels], async () => {
    await acdb.projects.where('sessionId').equals(id).delete();
    await acdb.triVotes.where('sessionId').equals(id).delete();
    await acdb.scores.where('sessionId').equals(id).delete();
    await acdb.duels.where('sessionId').equals(id).delete();
    await acdb.sessions.delete(id);
  });
}

// ── Projets ──────────────────────────────────────────────────────────────────
export async function listProjects(sessionId: string): Promise<ACProject[]> {
  return (await acdb.projects.where('sessionId').equals(sessionId).toArray())
    .sort((a, b) => a.order - b.order);
}

export async function addProjectFromFile(sessionId: string, file: File, order: number): Promise<ACProject> {
  const kind: ACProject['kind'] = file.type.startsWith('image/') ? 'image'
    : file.type === 'application/pdf' ? 'pdf' : 'text';
  const project: ACProject = {
    id: uid(), sessionId,
    title: file.name.replace(/\.[^.]+$/, '') || 'Projet',
    kind, blob: file, order, createdAt: Date.now(),
  };
  await acdb.projects.add(project);
  return project;
}

export async function addTextProject(sessionId: string, title: string, order: number): Promise<ACProject> {
  const project: ACProject = {
    id: uid(), sessionId, title: title.trim() || 'Projet', kind: 'text', order, createdAt: Date.now(),
  };
  await acdb.projects.add(project);
  return project;
}

export async function patchProject(id: string, patch: Partial<ACProject>): Promise<void> {
  await acdb.projects.update(id, patch);
}
export async function deleteProject(id: string): Promise<void> {
  await acdb.transaction('rw', acdb.projects, acdb.triVotes, acdb.scores, async () => {
    await acdb.triVotes.where('projectId').equals(id).delete();
    await acdb.scores.where('projectId').equals(id).delete();
    await acdb.projects.delete(id);
  });
}

// ── Votes étape 1 ────────────────────────────────────────────────────────────
export async function setTriVote(sessionId: string, projectId: string, participantId: string, vote: TriVote): Promise<void> {
  await acdb.triVotes.put({ id: `${projectId}:${participantId}`, sessionId, projectId, participantId, vote });
}
export async function clearTriVote(projectId: string, participantId: string): Promise<void> {
  await acdb.triVotes.delete(`${projectId}:${participantId}`);
}
export async function listTriVotes(sessionId: string): Promise<ACTriVote[]> {
  return acdb.triVotes.where('sessionId').equals(sessionId).toArray();
}

// ── Notes étape 2 ────────────────────────────────────────────────────────────
export async function setScore(sessionId: string, projectId: string, participantId: string, criterionId: string, value: number): Promise<void> {
  await acdb.scores.put({ id: `${projectId}:${participantId}:${criterionId}`, sessionId, projectId, participantId, criterionId, value });
}
export async function listScores(sessionId: string): Promise<ACScore[]> {
  return acdb.scores.where('sessionId').equals(sessionId).toArray();
}

// ── Duels étape 3 ────────────────────────────────────────────────────────────
export async function listDuels(sessionId: string): Promise<ACDuel[]> {
  return acdb.duels.where('sessionId').equals(sessionId).toArray();
}
export async function upsertDuel(duel: ACDuel): Promise<void> {
  await acdb.duels.put(duel);
}

// ── Export / import JSON (sauvegarde, pas de fichiers binaires) ──────────────
export async function exportSession(sessionId: string): Promise<string> {
  const [session, projects, triVotes, scores, duels] = await Promise.all([
    getSession(sessionId), listProjects(sessionId), listTriVotes(sessionId),
    listScores(sessionId), listDuels(sessionId),
  ]);
  // les blobs ne sont pas sérialisés (export léger des décisions)
  const lightProjects = projects.map(({ blob, ...p }) => { void blob; return p; });
  return JSON.stringify({ version: 1, session, projects: lightProjects, triVotes, scores, duels }, null, 2);
}

export { uid };
