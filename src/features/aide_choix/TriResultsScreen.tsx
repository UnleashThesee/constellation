// Étape 1 — Résultats : matrice des 3 tris + élimination (majorité de « Non »).
import { useEffect, useMemo, useState } from 'react';
import type { ACProject, ACSession, ACTriVote, TriVote } from './types';
import { listProjects, listTriVotes, patchProject, setStage } from './db';
import { computeTriTally, nonThreshold, enthusiasmByProject } from './logic';
import { Btn, Card, Dot, ProjectMedia, Guide, GuideLine, EnvieBadge } from './ui';

const VOTE_CHIP: Record<TriVote, string> = {
  oui: 'bg-[#467434]/20 text-[#6FA85A]',
  'peut-etre': 'bg-slate-500/20 text-slate-300',
  non: 'bg-rose-500/20 text-rose-300',
};
const VOTE_SHORT: Record<TriVote, string> = { oui: 'Oui', 'peut-etre': 'Peut-être', non: 'Non' };

export function TriResultsScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [votes, setVotes] = useState<ACTriVote[]>([]);

  const reload = () => { listProjects(session.id).then(setProjects); listTriVotes(session.id).then(setVotes); };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [session.id]);

  const voteOf = (projectId: string, participantId: string): TriVote | undefined =>
    votes.find(v => v.projectId === projectId && v.participantId === participantId)?.vote;

  const tally = useMemo(() => {
    const t = computeTriTally(projects, votes, session.participants.length);
    return new Map(t.map(x => [x.projectId, x]));
  }, [projects, votes, session.participants.length]);
  const envie = useMemo(() => enthusiasmByProject(votes), [votes]);

  // « eliminated » effectif = override manuel (project.eliminated) sinon règle auto
  const isEliminated = (p: ACProject) => p.eliminated ?? tally.get(p.id)?.eliminated ?? false;

  const survivors = projects.filter(p => !isEliminated(p));
  const dropped = projects.filter(p => isEliminated(p));
  const threshold = nonThreshold(session.participants.length);

  const toggleElim = async (p: ACProject) => {
    const next = !isEliminated(p);
    await patchProject(p.id, { eliminated: next });
    setProjects(ps => ps.map(x => x.id === p.id ? { ...x, eliminated: next } : x));
  };

  const proceed = async () => { await setStage(session.id, 'notation'); onChanged(); };

  const Row = ({ p }: { p: ACProject }) => {
    const elim = isEliminated(p);
    return (
      <div className={`flex items-center gap-3 rounded-xl border p-2 ${elim ? 'border-rose-500/20 bg-rose-500/5 opacity-70' : 'border-white/10 bg-black/20'}`}>
        <ProjectMedia project={p} className="h-12 w-16 shrink-0" />
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${elim ? 'text-slate-400 line-through' : 'text-white'}`}>{p.title}</span>
        <span className="shrink-0"><EnvieBadge score={envie.get(p.id) ?? 0} /></span>
        <div className="flex shrink-0 gap-1">
          {session.participants.map(part => {
            const v = voteOf(p.id, part.id);
            return (
              <span key={part.id} title={part.name}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${v ? VOTE_CHIP[v] : 'bg-white/5 text-slate-500'}`}>
                <Dot color={part.color} />{v ? VOTE_SHORT[v] : '—'}
              </span>
            );
          })}
        </div>
        <Btn variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={() => toggleElim(p)}>
          {elim ? '↺ Repêcher' : '✕ Éliminer'}
        </Btn>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Guide id="triResults" title="Étape 1 — Résultats du tri">
        <GuideLine tag="Ce que tu vois">Les 3 votes de chacun, projet par projet (pastille = personne).</GuideLine>
        <GuideLine tag="La règle">Éliminé automatiquement si au moins {threshold} « Non » sur {session.participants.length}. Tu peux repêcher ou éliminer à la main.</GuideLine>
        <GuideLine tag="Ensuite">Seuls les projets gardés passent à la notation détaillée (étape 2).</GuideLine>
      </Guide>
      <Card className="p-4">
        <p className="text-sm text-slate-300">
          Règle : un projet est éliminé si <b className="text-rose-300">au moins {threshold} « Non »</b> sur {session.participants.length}.
          Tu peux repêcher/éliminer à la main.
        </p>
        <div className="mt-2 flex gap-4 text-sm">
          <span className="text-[#6FA85A]">Gardés : <b>{survivors.length}</b></span>
          <span className="text-rose-300">Éliminés : <b>{dropped.length}</b></span>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#6FA85A]">On garde ({survivors.length})</h3>
        <div className="space-y-2">{survivors.map(p => <Row key={p.id} p={p} />)}</div>
      </div>

      {dropped.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-rose-300">Éliminés ({dropped.length})</h3>
          <div className="space-y-2">{dropped.map(p => <Row key={p.id} p={p} />)}</div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Btn variant="ghost" onClick={async () => { await setStage(session.id, 'tri'); onChanged(); }}>← Retour au tri</Btn>
        <Btn variant="primary" disabled={survivors.length < 2} onClick={proceed}>
          Noter les {survivors.length} projets restants →
        </Btn>
      </div>
    </div>
  );
}
