import { describe, it, expect } from 'vitest';
import {
  nonThreshold, computeTriTally, ranksFromValues, computeNotation,
  duelWinner, computeDuelStandings, allPairs, duelKey,
} from './logic';
import type { ACProject, ACTriVote, ACScore, ACDuel, Participant, Criterion } from './types';

const mkProject = (id: string, order = 0): ACProject => ({
  id, sessionId: 's', title: id, kind: 'text', order, createdAt: 0,
});
const P = (id: string): Participant => ({ id, name: id, color: '#000' });
const C = (id: string, weight = 1): Criterion => ({ id, name: id, definition: '', weight });

describe('étape 1 — élimination', () => {
  it('seuil = majorité stricte', () => {
    expect(nonThreshold(3)).toBe(2);
    expect(nonThreshold(4)).toBe(3);
    expect(nonThreshold(5)).toBe(3);
  });

  it('élimine un projet avec 2 « Non » sur 3', () => {
    const projects = [mkProject('a'), mkProject('b')];
    const votes: ACTriVote[] = [
      { id: '1', sessionId: 's', projectId: 'a', participantId: 'p1', vote: 'non' },
      { id: '2', sessionId: 's', projectId: 'a', participantId: 'p2', vote: 'non' },
      { id: '3', sessionId: 's', projectId: 'a', participantId: 'p3', vote: 'oui' },
      { id: '4', sessionId: 's', projectId: 'b', participantId: 'p1', vote: 'non' },
      { id: '5', sessionId: 's', projectId: 'b', participantId: 'p2', vote: 'peut-etre' },
      { id: '6', sessionId: 's', projectId: 'b', participantId: 'p3', vote: 'oui' },
    ];
    const tally = computeTriTally(projects, votes, 3);
    const a = tally.find(t => t.projectId === 'a')!;
    const b = tally.find(t => t.projectId === 'b')!;
    expect(a.eliminated).toBe(true);
    expect(a.counts.non).toBe(2);
    expect(b.eliminated).toBe(false); // 1 seul « Non »
  });
});

describe('ranksFromValues', () => {
  it('rang 1 = valeur la plus haute', () => {
    const r = ranksFromValues(new Map([['a', 5], ['b', 3], ['c', 1]]));
    expect(r.get('a')).toBe(1);
    expect(r.get('b')).toBe(2);
    expect(r.get('c')).toBe(3);
  });

  it('égalités → rang moyen', () => {
    const r = ranksFromValues(new Map([['a', 5], ['b', 5], ['c', 1]]));
    expect(r.get('a')).toBe(1.5);
    expect(r.get('b')).toBe(1.5);
    expect(r.get('c')).toBe(3);
  });
});

describe('étape 2 — la normalisation par rang neutralise sévère vs généreux', () => {
  // Même ORDRE de préférence, niveaux différents : généreux (5,4,3) vs sévère (3,2,1).
  // Le classement agrégé doit être identique et stable : a > b > c.
  const projectIds = ['a', 'b', 'c'];
  const participants = [P('gen'), P('sev')];
  const criteria = [C('q')];
  const scores: ACScore[] = [
    { id: '1', sessionId: 's', projectId: 'a', participantId: 'gen', criterionId: 'q', value: 5 },
    { id: '2', sessionId: 's', projectId: 'b', participantId: 'gen', criterionId: 'q', value: 4 },
    { id: '3', sessionId: 's', projectId: 'c', participantId: 'gen', criterionId: 'q', value: 3 },
    { id: '4', sessionId: 's', projectId: 'a', participantId: 'sev', criterionId: 'q', value: 3 },
    { id: '5', sessionId: 's', projectId: 'b', participantId: 'sev', criterionId: 'q', value: 2 },
    { id: '6', sessionId: 's', projectId: 'c', participantId: 'sev', criterionId: 'q', value: 1 },
  ];

  it('classement agrégé = a, b, c malgré les écarts de niveau', () => {
    const res = computeNotation(projectIds, scores, participants, criteria);
    expect(res.ranking.map(r => r.projectId)).toEqual(['a', 'b', 'c']);
    // a est 1er pour les deux → rang moyen 1
    expect(res.ranking[0].meanRank).toBe(1);
  });

  it('aucun désaccord quand les deux ont le même ordre', () => {
    const res = computeNotation(projectIds, scores, participants, criteria);
    expect(res.disagreement.every(d => d.spread === 0)).toBe(true);
  });

  it('détecte un gros désaccord (ordres inversés)', () => {
    const flipped: ACScore[] = [
      { id: '1', sessionId: 's', projectId: 'a', participantId: 'gen', criterionId: 'q', value: 5 },
      { id: '2', sessionId: 's', projectId: 'b', participantId: 'gen', criterionId: 'q', value: 3 },
      { id: '3', sessionId: 's', projectId: 'c', participantId: 'gen', criterionId: 'q', value: 1 },
      { id: '4', sessionId: 's', projectId: 'a', participantId: 'sev', criterionId: 'q', value: 1 },
      { id: '5', sessionId: 's', projectId: 'b', participantId: 'sev', criterionId: 'q', value: 3 },
      { id: '6', sessionId: 's', projectId: 'c', participantId: 'sev', criterionId: 'q', value: 5 },
    ];
    const res = computeNotation(projectIds, flipped, participants, criteria);
    // a : 1er pour gen, 3e pour sev → spread 2 (désaccord max)
    const a = res.disagreement.find(d => d.projectId === 'a')!;
    expect(a.spread).toBe(2);
    expect(res.disagreement[0].spread).toBe(2); // trié désaccord décroissant
  });

  it('respecte la pondération des critères', () => {
    const ids = ['x', 'y'];
    const parts = [P('p')];
    const crits = [C('cheap', 1), C('impact', 4)];
    const sc: ACScore[] = [
      // x meilleur sur cheap, y bien meilleur sur impact (poids fort)
      { id: '1', sessionId: 's', projectId: 'x', participantId: 'p', criterionId: 'cheap', value: 5 },
      { id: '2', sessionId: 's', projectId: 'y', participantId: 'p', criterionId: 'cheap', value: 1 },
      { id: '3', sessionId: 's', projectId: 'x', participantId: 'p', criterionId: 'impact', value: 1 },
      { id: '4', sessionId: 's', projectId: 'y', participantId: 'p', criterionId: 'impact', value: 5 },
    ];
    const res = computeNotation(ids, sc, parts, crits);
    expect(res.ranking[0].projectId).toBe('y'); // impact pèse 4× plus
  });
});

describe('étape 3 — duels', () => {
  it('majorité des votes', () => {
    const d: ACDuel = {
      id: 'a__b', sessionId: 's', aId: 'a', bId: 'b',
      votes: { p1: 'a', p2: 'a', p3: 'b' }, winnerId: null,
    };
    expect(duelWinner(d)).toBe('a');
  });

  it('égalité → null', () => {
    const d: ACDuel = {
      id: 'a__b', sessionId: 's', aId: 'a', bId: 'b',
      votes: { p1: 'a', p2: 'b' }, winnerId: null,
    };
    expect(duelWinner(d)).toBe(null);
  });

  it('Copeland + vainqueur de Condorcet', () => {
    const ids = ['a', 'b', 'c'];
    // a bat b et c ; b bat c → a est Condorcet
    const duels: ACDuel[] = [
      { id: duelKey('a', 'b'), sessionId: 's', aId: 'a', bId: 'b', votes: { p1: 'a', p2: 'a' }, winnerId: null },
      { id: duelKey('a', 'c'), sessionId: 's', aId: 'a', bId: 'c', votes: { p1: 'a', p2: 'a' }, winnerId: null },
      { id: duelKey('b', 'c'), sessionId: 's', aId: 'b', bId: 'c', votes: { p1: 'b', p2: 'b' }, winnerId: null },
    ];
    const res = computeDuelStandings(ids, duels);
    expect(res.standings[0].projectId).toBe('a');
    expect(res.standings[0].copeland).toBe(2);
    expect(res.condorcetWinner).toBe('a');
    expect(res.decided).toBe(3);
    expect(res.total).toBe(3);
  });

  it('cycle de Condorcet → pas de vainqueur unique', () => {
    const ids = ['a', 'b', 'c'];
    // a>b, b>c, c>a (pierre-feuille-ciseaux)
    const duels: ACDuel[] = [
      { id: duelKey('a', 'b'), sessionId: 's', aId: 'a', bId: 'b', votes: { p1: 'a' }, winnerId: null },
      { id: duelKey('b', 'c'), sessionId: 's', aId: 'b', bId: 'c', votes: { p1: 'b' }, winnerId: null },
      { id: duelKey('a', 'c'), sessionId: 's', aId: 'a', bId: 'c', votes: { p1: 'c' }, winnerId: null },
    ];
    const res = computeDuelStandings(ids, duels);
    expect(res.condorcetWinner).toBe(null);
  });

  it('allPairs', () => {
    expect(allPairs(['a', 'b', 'c'])).toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']]);
  });
});
