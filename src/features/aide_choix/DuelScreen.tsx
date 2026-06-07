// Étape 3 — Duels deux par deux sur le groupe de tête (vous trois ensemble).
import { useEffect, useMemo, useState } from 'react';
import type { ACDuel, ACProject, ACScore, ACSession } from './types';
import { listProjects, listScores, listDuels, upsertDuel, setStage } from './db';
import { allPairs, computeNotation, computeTriTally, duelKey, computeDuelStandings } from './logic';
import { Btn, Card, Dot, ProjectMedia, Guide, GuideLine } from './ui';
import { MetaChips } from './meta';

export function DuelScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [scores, setScores] = useState<ACScore[]>([]);
  const [duels, setDuels] = useState<ACDuel[]>([]);

  useEffect(() => {
    listProjects(session.id).then(setProjects);
    listScores(session.id).then(setScores);
    listDuels(session.id).then(setDuels);
  }, [session.id]);

  const byId = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  // groupe de tête = top N du classement de l'étape 2
  const topIds = useMemo(() => {
    const elimAuto = new Map(computeTriTally(projects, [], session.participants.length).map(t => [t.projectId, t]));
    const survivors = projects.filter(p => !(p.eliminated ?? elimAuto.get(p.id)?.eliminated ?? false));
    const res = computeNotation(survivors.map(p => p.id), scores, session.participants, session.criteria);
    return res.ranking.slice(0, session.topGroupSize).map(r => r.projectId);
  }, [projects, scores, session]);

  const pairs = useMemo(() => allPairs(topIds), [topIds]);
  const duelMap = useMemo(() => new Map(duels.map(d => [d.id, d])), [duels]);

  // premier duel non décidé
  const [idx, setIdx] = useState(0);
  const firstUndecided = pairs.findIndex(([a, b]) => {
    const d = duelMap.get(duelKey(a, b));
    return !d || !d.winnerId;
  });
  useEffect(() => { if (firstUndecided >= 0) setIdx(firstUndecided); }, [firstUndecided]);

  const standings = useMemo(() => computeDuelStandings(topIds, duels), [topIds, duels]);

  const pair = pairs[idx];
  if (topIds.length < 2) return <Card className="mx-auto max-w-md p-8 text-center text-slate-400">Pas assez de projets dans le groupe de tête.</Card>;

  const castVote = async (a: string, b: string, choice: string) => {
    const id = duelKey(a, b);
    const existing = duelMap.get(id);
    const votes = { ...(existing?.votes ?? {}) };
    // vote « ensemble » : on enregistre directement le gagnant choisi (consensus)
    // mais on garde la possibilité d'un comptage par participant via votes.
    const duel: ACDuel = {
      id, sessionId: session.id, aId: a < b ? a : b, bId: a < b ? b : a,
      votes, winnerId: choice,
    };
    await upsertDuel(duel);
    setDuels(prev => [...prev.filter(d => d.id !== id), duel]);
    setIdx(i => Math.min(pairs.length - 1, i + 1));
  };

  const decidedCount = pairs.filter(([a, b]) => duelMap.get(duelKey(a, b))?.winnerId).length;
  const allDone = decidedCount === pairs.length;

  const DuelCard = ({ pid, onPick, side }: { pid: string; onPick: () => void; side: 'A' | 'B' }) => {
    const p = byId.get(pid); if (!p) return null;
    return (
      <button onClick={onPick}
        className="group flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left transition hover:border-[#F58F20] hover:bg-[#F58F20]/5">
        <ProjectMedia project={p} className="aspect-[16/10] w-full" rounded="rounded-none" />
        <div className="flex items-center justify-between gap-2 p-3">
          <span className="min-w-0">
            <span className="block truncate font-bold text-white">{p.title}</span>
            <span className="mt-1 block"><MetaChips meta={p.meta} /></span>
          </span>
          <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-400 group-hover:bg-[#F58F20] group-hover:text-slate-900">Choisir {side}</span>
        </div>
      </button>
    );
  };

  const current = duelMap.get(pair ? duelKey(pair[0], pair[1]) : '');

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Guide id="duels" title="Étape 3 — Les duels (vous trois ensemble)">
        <GuideLine tag="Quoi faire">Pour chaque paire, cliquez le projet que vous préférez lancer en premier. Tranchez ensemble.</GuideLine>
        <GuideLine tag="Pourquoi">On compare 2 par 2 : le cerveau choisit bien mieux entre deux options qu'en donnant une note absolue.</GuideLine>
        <GuideLine tag="Le classement">Chaque victoire compte (score Copeland). Faites toutes les paires pour un classement fiable ; le verdict apparaît à la fin.</GuideLine>
      </Guide>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">Duel {Math.min(idx + 1, pairs.length)} / {pairs.length} · {decidedCount} décidés</span>
        <span className="text-xs text-slate-500">Mode : toutes les paires (Copeland)</span>
      </div>

      {pair && (
        <>
          <div className="flex items-stretch gap-3">
            <DuelCard pid={pair[0]} side="A" onPick={() => castVote(pair[0], pair[1], pair[0])} />
            <div className="flex items-center text-2xl font-black text-slate-600">VS</div>
            <DuelCard pid={pair[1]} side="B" onPick={() => castVote(pair[0], pair[1], pair[1])} />
          </div>
          <div className="flex items-center justify-between">
            <Btn variant="ghost" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>← Duel précédent</Btn>
            {current?.winnerId && <span className="text-sm text-[#6FA85A]">Gagnant : <b>{byId.get(current.winnerId)?.title}</b></span>}
            <Btn variant="ghost" disabled={idx >= pairs.length - 1} onClick={() => setIdx(i => Math.min(pairs.length - 1, i + 1))}>Duel suivant →</Btn>
          </div>
        </>
      )}

      {/* Classement provisoire */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#F7A24A]">Classement des duels (Copeland)</h3>
        {standings.condorcetWinner && (
          <p className="mb-2 text-sm text-[#6FA85A]">★ Vainqueur de Condorcet : <b>{byId.get(standings.condorcetWinner)?.title}</b> (bat tous les autres).</p>
        )}
        <div className="space-y-1">
          {standings.standings.map((s, i) => (
            <div key={s.projectId} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-center font-black text-slate-500">{i + 1}</span>
              <span className="flex-1 truncate text-white">{byId.get(s.projectId)?.title}</span>
              <span className="text-[#6FA85A]">{s.wins}V</span>
              <span className="text-rose-300">{s.losses}D</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Btn variant="ghost" onClick={async () => { await setStage(session.id, 'notationResults'); onChanged(); }}>← Retour classement</Btn>
        <Btn variant="primary" onClick={async () => { await setStage(session.id, 'final'); onChanged(); }}>
          {allDone ? 'Voir le verdict final →' : `Terminer (${decidedCount}/${pairs.length}) →`}
        </Btn>
      </div>
      <div className="flex justify-center gap-3 text-xs text-slate-500">
        {session.participants.map(p => <span key={p.id} className="flex items-center gap-1"><Dot color={p.color} />{p.name}</span>)}
      </div>
    </div>
  );
}
