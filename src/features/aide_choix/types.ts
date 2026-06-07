// Aide au choix — types du module (isolé de Constellation).
// Outil de décision de groupe en 3 étapes : tri → notation → duels.

export type Stage =
  | 'setup'
  | 'tri'
  | 'triResults'
  | 'notation'
  | 'notationResults'
  | 'duels'
  | 'final';

export const STAGE_ORDER: Stage[] = [
  'setup', 'tri', 'triResults', 'notation', 'notationResults', 'duels', 'final',
];

export type TriVote = 'oui' | 'peut-etre' | 'non';

export interface Participant {
  id: string;
  name: string;
  color: string;
}

export interface Criterion {
  id: string;
  name: string;
  definition: string;
  weight: number; // pondération relative (défaut 1)
}

export interface ACSession {
  id: string;
  name: string;
  stage: Stage;
  participants: Participant[];
  criteria: Criterion[];
  topGroupSize: number;   // taille du groupe de tête pour l'étape 3 (5–8)
  duelMode: 'roundRobin' | 'kingOfHill';
  createdAt: number;
  updatedAt: number;
}

export interface ACProject {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  kind: 'image' | 'pdf' | 'text';
  blob?: Blob;            // fichier importé (image/PDF) stocké localement
  order: number;
  eliminated?: boolean;   // verdict de l'étape 1 (peut être surchargé à la main)
  createdAt: number;
}

export interface ACTriVote {
  id: string;             // `${projectId}:${participantId}`
  sessionId: string;
  projectId: string;
  participantId: string;
  vote: TriVote;
}

export interface ACScore {
  id: string;             // `${projectId}:${participantId}:${criterionId}`
  sessionId: string;
  projectId: string;
  participantId: string;
  criterionId: string;
  value: number;          // 1..5
}

export interface ACDuel {
  id: string;             // clé de paire ordonnée `${aId}__${bId}`
  sessionId: string;
  aId: string;
  bId: string;
  votes: Record<string, string>; // participantId -> projectId choisi
  winnerId: string | null;       // calculé (majorité) ou forcé
}
