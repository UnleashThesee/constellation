// Étape 2 — Notation : chaque projet, chaque critère noté 1–5 (chacun son tour).
import { useEffect, useMemo, useState } from 'react';
import type { ACProject, ACScore, ACSession } from './types';
import { listProjects, listScores, setScore, setStage } from './db';
import { computeTriTally } from './logic';
import { Btn, Card, ProgressBar, ProjectMedia, WhoAmI, useLocalState } from './ui';

export function NotationScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [scores, setScores] = useState<ACScore[]>([]);
  const [me, setMe] = useLocalState<string | null>(`ac:${session.id}:me`, session.participants[0]?.id ?? null);
  const [i, setI] = useState(0);

  useEffect(() => { listProjects(session.id).then(setProjects); listScores(session.id).then(setScores); }, [session.id]);

  // survivants de l'étape 1
  const survivors = useMemo(() => {
    const elimAuto = new Map(computeTriTally(projects, [], session.participants.length).map(t => [t.projectId, t]));
    return projects.filter(p => !(p.eliminated ?? elimAuto.get(p.id)?.eliminated ?? false));
  }, [projects, session.participants.length]);

  const scoreOf = (projectId: string, criterionId: string): number | undefined =>
    scores.find(s => s.projectId === projectId && s.participantId === me && s.criterionId === criterionId)?.value;

  const setVal = async (projectId: string, criterionId: string, value: number) => {
    if (!me) return;
    await setScore(session.id, projectId, me, criterionId, value);
    setScores(prev => {
      const id = `${projectId}:${me}:${criterionId}`;
      return [...prev.filter(s => s.id !== id), { id, sessionId: session.id, projectId, participantId: me, criterionId, value }];
    });
  };

  const isProjectDone = (p: ACProject) => session.criteria.every(c => scoreOf(p.id, c.id) !== undefined);
  const doneCount = survivors.filter(isProjectDone).length;
  const current = survivors[i];

  if (!me) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 text-slate-300">Qui note en premier&nbsp;?</p>
        <WhoAmI participants={session.participants} currentId={me} onPick={setMe} compact />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WhoAmI participants={session.participants} currentId={me} onPick={(id) => { setMe(id); setI(0); }} />
        <span className="text-sm text-slate-400">{doneCount} / {survivors.length} projets notés</span>
      </div>
      <ProgressBar value={doneCount} max={survivors.length} tone="emerald" />

      {current ? (
        <Card className="overflow-hidden">
          <div className="flex gap-4 p-4">
            <ProjectMedia project={current} className="h-24 w-32 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-white">{current.title}</h3>
              <span className="text-xs text-slate-500">Projet {i + 1} / {survivors.length}</span>
              {current.description && <p className="mt-1 text-sm text-slate-300">{current.description}</p>}
            </div>
          </div>
          <div className="space-y-3 border-t border-white/10 p-4">
            {session.criteria.map(c => {
              const val = scoreOf(current.id, c.id);
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-white" title={c.definition}>{c.name}
                      {c.definition && <span className="ml-2 text-[11px] font-normal text-slate-500">{c.definition}</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setVal(current.id, c.id, n)}
                        className={`rounded-lg py-2 text-sm font-bold transition
                          ${val === n ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : <Card className="p-8 text-center text-slate-400">Aucun projet à noter.</Card>}

      <div className="flex items-center justify-between">
        <Btn variant="ghost" onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}>← Précédent</Btn>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setI(x => Math.min(survivors.length - 1, x + 1))} disabled={i >= survivors.length - 1}>Suivant →</Btn>
          <Btn variant="primary" onClick={async () => { await setStage(session.id, 'notationResults'); onChanged(); }}>Voir le classement →</Btn>
        </div>
      </div>
    </div>
  );
}
