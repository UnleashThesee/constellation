// Étape 1 — Le grand tri. Un projet à la fois, 3 verdicts, à l'instinct.
import { useEffect, useMemo, useState } from 'react';
import type { ACProject, ACSession, ACTriVote, TriVote } from './types';
import { listProjects, listTriVotes, setTriVote, setStage } from './db';
import { Btn, Card, ProgressBar, ProjectMedia, WhoAmI, useLocalState, Guide, GuideLine, ParticipantProgress } from './ui';

const VOTES: { v: TriVote; label: string; key: string; cls: string }[] = [
  { v: 'non', label: 'Non', key: '←', cls: 'bg-rose-500/90 hover:bg-rose-500 text-white' },
  { v: 'peut-etre', label: 'Peut-être', key: '↓', cls: 'bg-slate-500/70 hover:bg-slate-500 text-white' },
  { v: 'oui', label: 'Oui', key: '→', cls: 'bg-[#467434]/90 hover:bg-[#467434] text-white' },
];

export function TriScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [votes, setVotes] = useState<ACTriVote[]>([]);
  const [me, setMe] = useLocalState<string | null>(`ac:${session.id}:me`, session.participants[0]?.id ?? null);
  const [i, setI] = useState(0);

  useEffect(() => { listProjects(session.id).then(setProjects); listTriVotes(session.id).then(setVotes); }, [session.id]);

  const myVotes = useMemo(() => {
    const m = new Map<string, TriVote>();
    for (const v of votes) if (v.participantId === me) m.set(v.projectId, v.vote);
    return m;
  }, [votes, me]);

  const doneCount = projects.filter(p => myVotes.has(p.id)).length;
  const current = projects[i];

  // avancement de chacun (modèle « chacun son tour »)
  const progress: Record<string, { done: number; total: number }> = {};
  for (const part of session.participants) {
    const done = new Set(votes.filter(v => v.participantId === part.id).map(v => v.projectId)).size;
    progress[part.id] = { done, total: projects.length };
  }

  const vote = async (v: TriVote) => {
    if (!current || !me) return;
    await setTriVote(session.id, current.id, me, v);
    setVotes(prev => {
      const id = `${current.id}:${me}`;
      const rest = prev.filter(x => x.id !== id);
      return [...rest, { id, sessionId: session.id, projectId: current.id, participantId: me, vote: v }];
    });
    setI(x => Math.min(projects.length - 1, x + 1));
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') vote('non');
      else if (e.key === 'ArrowDown') vote('peut-etre');
      else if (e.key === 'ArrowRight') vote('oui');
      else if (e.key === 'ArrowUp') setI(x => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!me) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 text-slate-300">Qui fait le tri en premier&nbsp;?</p>
        <WhoAmI participants={session.participants} currentId={me} onPick={setMe} compact />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Guide id="tri" title="Étape 1 — Le grand tri (chacun seul, ~20 min)">
        <GuideLine tag="Quoi faire">Passe tous les projets et donne ton réflexe : Oui / Peut-être / Non. À l'instinct, sans réfléchir longtemps.</GuideLine>
        <GuideLine tag="Chacun son tour">Sur un seul appareil : fais tout le paquet, puis passe la main au suivant via « Qui es-tu ? ». Les 3 doivent passer.</GuideLine>
        <GuideLine tag="Pourquoi">But : éliminer vite les projets clairement morts pour ne pas perdre de temps dessus.</GuideLine>
        <GuideLine tag="Ensuite">On compare les 3 tris ; un projet rejeté par au moins 2 personnes sur 3 est éliminé.</GuideLine>
      </Guide>

      <ParticipantProgress participants={session.participants} progress={progress} label="Avancement :" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <WhoAmI participants={session.participants} currentId={me} onPick={(id) => { setMe(id); setI(0); }} />
        <span className="text-sm text-slate-400">{doneCount} / {projects.length} traités</span>
      </div>
      <ProgressBar value={doneCount} max={projects.length} />

      {current ? (
        <Card className="overflow-hidden">
          <ProjectMedia project={current} className="aspect-[16/10] w-full" rounded="rounded-none" />
          <div className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{current.title}</h3>
              <span className="text-xs text-slate-500">{i + 1} / {projects.length}</span>
            </div>
            {current.description && <p className="mb-3 text-sm text-slate-300">{current.description}</p>}
            {myVotes.has(current.id) && (
              <p className="mb-2 text-xs text-[#F7A24A]">Déjà voté : <b>{myVotes.get(current.id)}</b> — tu peux changer.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {VOTES.map(b => (
                <button key={b.v} onClick={() => vote(b.v)}
                  className={`rounded-xl px-3 py-4 text-base font-bold transition ${b.cls} ${myVotes.get(current.id) === b.v ? 'ring-2 ring-[#F7A24A]' : ''}`}>
                  {b.label}<span className="ml-2 opacity-60">{b.key}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-slate-400">Aucun projet.</Card>
      )}

      <div className="flex items-center justify-between">
        <Btn variant="ghost" onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}>← Précédent</Btn>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setI(x => Math.min(projects.length - 1, x + 1))} disabled={i >= projects.length - 1}>Suivant →</Btn>
          <Btn variant="primary" onClick={async () => { await setStage(session.id, 'triResults'); onChanged(); }}>
            Comparer les 3 tris →
          </Btn>
        </div>
      </div>
      <p className="text-center text-xs text-slate-500">Astuce : chacun son tour. Change de personne en haut, puis refais les {projects.length} projets.</p>
    </div>
  );
}
