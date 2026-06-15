// Aide au choix — algorithmes purs (testables, sans I/O).

import type { ACProject, ACTriVote, ACScore, ACDuel, Participant, Criterion, TriVote } from './types';

// ── Étape 1 : élimination ────────────────────────────────────────────────────
// Un projet est éliminé si une MAJORITÉ STRICTE des participants l'a mis en « Non »
// (pour 3 personnes → au moins 2 « Non »).

export interface TriTally {
  projectId: string;
  counts: Record<TriVote, number>;
  total: number;
  eliminated: boolean;
}

export function nonThreshold(participantCount: number): number {
  // majorité stricte ; 3 → 2, 4 → 3, 5 → 3
  return Math.floor(participantCount / 2) + 1;
}

export function computeTriTally(
  projects: ACProject[],
  votes: ACTriVote[],
  participantCount: number,
): TriTally[] {
  const threshold = nonThreshold(participantCount);
  const byProject = new Map<string, Record<TriVote, number>>();
  for (const p of projects) byProject.set(p.id, { oui: 0, 'peut-etre': 0, non: 0 });
  for (const v of votes) {
    const c = byProject.get(v.projectId);
    if (c) c[v.vote] += 1;
  }
  return projects.map(p => {
    const counts = byProject.get(p.id)!;
    return {
      projectId: p.id,
      counts,
      total: counts.oui + counts['peut-etre'] + counts.non,
      eliminated: counts.non >= threshold,
    };
  });
}

// ── Étape 2 : normalisation par rang (corrige sévère vs généreux) ────────────
// Pour chaque (participant, critère), on classe les projets du meilleur au pire.
// Le rang (1 = meilleur) ne dépend pas du niveau d'exigence de la personne.
// Égalités → rang moyen (« fractional ranking »).

/** Rangs (1 = plus grande valeur) avec moyenne des égalités. ids non notés ignorés. */
export function ranksFromValues(values: Map<string, number>): Map<string, number> {
  const entries = [...values.entries()];
  // tri décroissant (valeur haute = meilleur = rang 1)
  entries.sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1][1] === entries[i][1]) j++;
    // positions i..j (0-based) → rangs (i+1)..(j+1), moyenne
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks.set(entries[k][0], avg);
    i = j + 1;
  }
  return ranks;
}

export interface NotationResult {
  /** classement global, meilleur d'abord */
  ranking: Array<{ projectId: string; score: number; meanRank: number }>;
  /** par critère : projectId -> rang moyen (sur les participants) */
  perCriterion: Record<string, Map<string, number>>;
  /** gagnant par critère */
  criterionWinners: Record<string, string | null>;
  /** rang personnel de chaque projet selon chaque participant */
  personalRanking: Record<string, Map<string, number>>; // participantId -> (projectId -> position)
  /** désaccord par projet = écart (max-min) des positions personnelles */
  disagreement: Array<{ projectId: string; spread: number; positions: Record<string, number> }>;
}

export function computeNotation(
  projectIds: string[],
  scores: ACScore[],
  participants: Participant[],
  criteria: Criterion[],
): NotationResult {
  const pSet = new Set(projectIds);
  // index : participant -> critère -> (projet -> valeur)
  const idx = new Map<string, Map<string, Map<string, number>>>();
  for (const s of scores) {
    if (!pSet.has(s.projectId)) continue;
    if (!idx.has(s.participantId)) idx.set(s.participantId, new Map());
    const byCrit = idx.get(s.participantId)!;
    if (!byCrit.has(s.criterionId)) byCrit.set(s.criterionId, new Map());
    byCrit.get(s.criterionId)!.set(s.projectId, s.value);
  }

  // rang normalisé par (participant, critère)
  // ranksByPC : participant -> critère -> (projet -> rang)
  const ranksByPC = new Map<string, Map<string, Map<string, number>>>();
  for (const p of participants) {
    const byCrit = idx.get(p.id);
    const out = new Map<string, Map<string, number>>();
    for (const c of criteria) {
      const vals = byCrit?.get(c.id);
      out.set(c.id, vals && vals.size > 0 ? ranksFromValues(vals) : new Map());
    }
    ranksByPC.set(p.id, out);
  }

  // score global d'un projet = somme sur participants & critères de (poids * rang),
  // normalisée par le nb de contributions présentes → rang moyen pondéré.
  const ranking = projectIds.map(projectId => {
    let weightedSum = 0;
    let weightAcc = 0;
    let rankSum = 0;
    let rankCount = 0;
    for (const p of participants) {
      for (const c of criteria) {
        const r = ranksByPC.get(p.id)!.get(c.id)!.get(projectId);
        if (r === undefined) continue;
        weightedSum += (c.weight || 1) * r;
        weightAcc += (c.weight || 1);
        rankSum += r;
        rankCount += 1;
      }
    }
    const score = weightAcc > 0 ? weightedSum / weightAcc : Number.POSITIVE_INFINITY;
    const meanRank = rankCount > 0 ? rankSum / rankCount : Number.POSITIVE_INFINITY;
    return { projectId, score, meanRank };
  }).sort((a, b) => a.score - b.score); // rang bas = meilleur

  // par critère : rang moyen sur les participants
  const perCriterion: Record<string, Map<string, number>> = {};
  const criterionWinners: Record<string, string | null> = {};
  for (const c of criteria) {
    const m = new Map<string, number>();
    for (const projectId of projectIds) {
      let sum = 0, n = 0;
      for (const p of participants) {
        const r = ranksByPC.get(p.id)!.get(c.id)!.get(projectId);
        if (r !== undefined) { sum += r; n += 1; }
      }
      m.set(projectId, n > 0 ? sum / n : Number.POSITIVE_INFINITY);
    }
    perCriterion[c.id] = m;
    let best: string | null = null, bestVal = Number.POSITIVE_INFINITY;
    for (const [pid, v] of m) if (v < bestVal) { bestVal = v; best = pid; }
    criterionWinners[c.id] = best;
  }

  // classement personnel de chaque participant (somme pondérée de ses propres rangs)
  const personalRanking: Record<string, Map<string, number>> = {};
  for (const p of participants) {
    const personalScore = projectIds.map(projectId => {
      let ws = 0, wa = 0;
      for (const c of criteria) {
        const r = ranksByPC.get(p.id)!.get(c.id)!.get(projectId);
        if (r === undefined) continue;
        ws += (c.weight || 1) * r;
        wa += (c.weight || 1);
      }
      return { projectId, s: wa > 0 ? ws / wa : Number.POSITIVE_INFINITY };
    }).sort((a, b) => a.s - b.s);
    const pos = new Map<string, number>();
    personalScore.forEach((e, i) => pos.set(e.projectId, i + 1));
    personalRanking[p.id] = pos;
  }

  // désaccord = amplitude des positions personnelles
  const disagreement = projectIds.map(projectId => {
    const positions: Record<string, number> = {};
    let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
    for (const p of participants) {
      const pos = personalRanking[p.id].get(projectId);
      if (pos === undefined) continue;
      positions[p.id] = pos;
      if (pos < min) min = pos;
      if (pos > max) max = pos;
    }
    const spread = max >= min ? max - min : 0;
    return { projectId, spread, positions };
  }).sort((a, b) => b.spread - a.spread);

  return { ranking, perCriterion, criterionWinners, personalRanking, disagreement };
}

// ── Étape 3 : duels (paires) → Copeland / Condorcet ──────────────────────────

export function duelKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}__${bId}` : `${bId}__${aId}`;
}

/** Toutes les paires (round-robin) à partir d'une liste ordonnée. */
export function allPairs(ids: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      out.push([ids[i], ids[j]]);
  return out;
}

/** Majorité des votes d'un duel ; null si égalité ou aucun vote. */
export function duelWinner(duel: ACDuel): string | null {
  if (duel.winnerId) return duel.winnerId;
  const tally: Record<string, number> = {};
  for (const choice of Object.values(duel.votes || {})) {
    tally[choice] = (tally[choice] || 0) + 1;
  }
  let best: string | null = null, bestN = 0, tie = false;
  for (const [pid, n] of Object.entries(tally)) {
    if (n > bestN) { best = pid; bestN = n; tie = false; }
    else if (n === bestN) tie = true;
  }
  return tie ? null : best;
}

export interface DuelStanding {
  projectId: string;
  wins: number;
  losses: number;
  copeland: number; // wins - losses
}

export function computeDuelStandings(ids: string[], duels: ACDuel[]): {
  standings: DuelStanding[];
  condorcetWinner: string | null;
  decided: number;
  total: number;
} {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const id of ids) { wins.set(id, 0); losses.set(id, 0); }
  const beats = new Map<string, Set<string>>(); // a -> set des battus
  for (const id of ids) beats.set(id, new Set());

  let decided = 0;
  for (const d of duels) {
    const w = duelWinner(d);
    if (!w) continue;
    const loser = w === d.aId ? d.bId : d.aId;
    if (!wins.has(w) || !losses.has(loser)) continue;
    wins.set(w, (wins.get(w) || 0) + 1);
    losses.set(loser, (losses.get(loser) || 0) + 1);
    beats.get(w)!.add(loser);
    decided += 1;
  }

  const standings = ids.map(projectId => {
    const wv = wins.get(projectId) || 0;
    const lv = losses.get(projectId) || 0;
    return { projectId, wins: wv, losses: lv, copeland: wv - lv };
  }).sort((a, b) => b.copeland - a.copeland);

  // Condorcet : bat tous les autres en tête-à-tête
  let condorcetWinner: string | null = null;
  for (const id of ids) {
    const others = ids.filter(o => o !== id);
    if (others.every(o => beats.get(id)!.has(o))) { condorcetWinner = id; break; }
  }

  return { standings, condorcetWinner, decided, total: allPairs(ids).length };
}
