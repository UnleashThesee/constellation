// Étape 2 — Notation : chaque critère noté Mauvais/Moyen/Bon (ou 1–5), chacun son tour.
import { useEffect, useMemo, useState } from 'react';
import type { ACProject, ACScore, ACSession } from './types';
import { listProjects, listScores, setScore, setStage, QUAL_SCALE } from './db';
import { computeTriTally } from './logic';
import { Btn, Card, ProgressBar, ProjectMedia, WhoAmI, useLocalState, Guide, GuideLine, ParticipantProgress } from './ui';
import { MetaChips } from './meta';

// Styles des boutons de note : chaque niveau a sa couleur, lisible même non choisi.
const QUAL_BTN: Record<number, { on: string; off: string }> = {
  1: { on: 'border-rose-500 bg-rose-500 text-white', off: 'border-rose-500/35 text-rose-200/90 hover:bg-rose-500/10' },
  2: { on: 'border-slate-300 bg-slate-300 text-slate-900', off: 'border-white/15 text-slate-300 hover:bg-white/8' },
  3: { on: 'border-[#467434] bg-[#467434] text-white', off: 'border-[#5a9144]/55 text-[#8ABF74] hover:bg-[#467434]/15' },
};

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
  const qualitative = session.scaleMode === 'qualitative';

  // avancement de chacun (modèle « chacun son tour »)
  const progress: Record<string, { done: number; total: number }> = {};
  for (const part of session.participants) {
    const done = survivors.filter(p => session.criteria.every(c =>
      scores.some(s => s.projectId === p.id && s.participantId === part.id && s.criterionId === c.id))).length;
    progress[part.id] = { done, total: survivors.length };
  }

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
      <Guide id="notation" title="Étape 2 — La vraie notation (chacun seul, ~40 min)">
        <GuideLine tag="Quoi faire">Note chaque projet survivant sur les {session.criteria.length} critères ({qualitative ? 'Mauvais / Moyen / Bon' : 'de 1 à 5'}). Garde les sous-variables « en tête » sous chaque critère.</GuideLine>
        <GuideLine tag="Chacun son tour">Sur un seul appareil : note tout, puis passe la main au suivant via « Qui es-tu ? ». Les 3 doivent passer.</GuideLine>
        <GuideLine tag="Pourquoi">Tes notes seront converties en classement : ta sévérité ou ta générosité n'influencera pas le résultat, seul ton ordre compte.</GuideLine>
        <GuideLine tag="Ensuite">On affiche le classement global et les projets « à discuter » (là où vos avis divergent).</GuideLine>
      </Guide>

      <ParticipantProgress participants={session.participants} progress={progress} label="Avancement :" />

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
              <div className="mt-1.5"><MetaChips meta={current.meta} /></div>
            </div>
          </div>
          <div className="space-y-3 border-t-2 border-black/30 bg-black/20 p-3.5">
            {session.criteria.map(c => {
              const val = scoreOf(current.id, c.id);
              return (
                <div key={c.id} className="rounded-xl border border-white/10 bg-[#404040] p-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-bold text-white">{c.name}</span>
                    {c.weight > 1 && <span className="rounded bg-[#F58F20]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#F9B877]" title="Ce critère compte plus dans le classement.">×{c.weight}</span>}
                  </div>
                  {c.definition && <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">{c.definition}</p>}
                  {c.checklist && c.checklist.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1 border-l-2 border-[#F58F20]/50 pl-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#F9B877]/80">en tête</span>
                      {c.checklist.map((s, k) => (
                        <span key={k} className="rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] text-slate-300">{s}</span>
                      ))}
                    </div>
                  )}
                  {qualitative ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {QUAL_SCALE.map(q => (
                        <button key={q.v} onClick={() => setVal(current.id, c.id, q.v)}
                          className={`rounded-lg border-2 py-2.5 text-sm font-bold transition ${val === q.v ? QUAL_BTN[q.v].on : QUAL_BTN[q.v].off}`}>{q.label}</button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} onClick={() => setVal(current.id, c.id, n)}
                            className={`rounded-lg border-2 py-2 text-sm font-bold transition ${val === n ? 'border-[#F58F20] bg-[#F58F20] text-slate-900' : 'border-white/15 text-slate-300 hover:bg-white/8'}`}>{n}</button>
                        ))}
                      </div>
                      {c.scale && <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{c.scale}</p>}
                    </>
                  )}
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
