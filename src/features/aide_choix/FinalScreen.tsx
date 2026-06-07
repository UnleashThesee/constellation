// Choix final — podium, ordre de lancement, justification, export.
import { useEffect, useMemo, useState } from 'react';
import type { ACDuel, ACProject, ACScore, ACSession } from './types';
import { listProjects, listScores, listDuels, exportSession, setStage } from './db';
import { computeNotation, computeTriTally, computeDuelStandings } from './logic';
import { Btn, Card, ProjectMedia, Guide, GuideLine } from './ui';

export function FinalScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [scores, setScores] = useState<ACScore[]>([]);
  const [duels, setDuels] = useState<ACDuel[]>([]);

  useEffect(() => {
    listProjects(session.id).then(setProjects);
    listScores(session.id).then(setScores);
    listDuels(session.id).then(setDuels);
  }, [session.id]);

  const byId = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const topIds = useMemo(() => {
    const elimAuto = new Map(computeTriTally(projects, [], session.participants.length).map(t => [t.projectId, t]));
    const survivors = projects.filter(p => !(p.eliminated ?? elimAuto.get(p.id)?.eliminated ?? false));
    const res = computeNotation(survivors.map(p => p.id), scores, session.participants, session.criteria);
    return res.ranking.slice(0, session.topGroupSize).map(r => r.projectId);
  }, [projects, scores, session]);

  const standings = useMemo(() => computeDuelStandings(topIds, duels), [topIds, duels]);

  const doExport = async () => {
    const json = await exportSession(session.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aide-choix-${session.name.replace(/\s+/g, '-')}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const order = standings.standings;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Guide id="final" title="Le verdict">
        <GuideLine tag="Ce que c'est">L'ordre dans lequel lancer vos projets, issu des duels (plus de victoires = plus haut).</GuideLine>
        <GuideLine tag="Choix clair">Si un projet bat tous les autres en tête-à-tête, il est signalé comme le choix net.</GuideLine>
        <GuideLine tag="Garder une trace">« Exporter » télécharge tout le parcours en JSON (décisions, classements, duels).</GuideLine>
      </Guide>
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-amber-300">Verdict</p>
        <h2 className="text-2xl font-black text-white">Ce qu'on lance — dans l'ordre</h2>
        {standings.condorcetWinner && (
          <p className="mt-1 text-sm text-emerald-300">★ Choix clair : <b>{byId.get(standings.condorcetWinner)?.title}</b></p>
        )}
      </div>

      {/* Podium top 3 */}
      <div className="grid grid-cols-3 items-end gap-3">
        {[1, 0, 2].map(rankIdx => {
          const s = order[rankIdx]; if (!s) return <div key={rankIdx} />;
          const p = byId.get(s.projectId);
          const h = rankIdx === 0 ? 'h-44' : rankIdx === 1 ? 'h-36' : 'h-32';
          return (
            <div key={rankIdx} className="flex flex-col items-center gap-2">
              <ProjectMedia project={p!} className="h-20 w-24" />
              <div className={`flex ${h} w-full flex-col items-center justify-start rounded-t-xl border border-amber-400/30 bg-gradient-to-b from-amber-400/15 to-transparent p-2 text-center`}>
                <span className="text-2xl">{medals[rankIdx]}</span>
                <span className="text-sm font-bold text-white">{p?.title}</span>
                <span className="text-[11px] text-slate-400">{s.wins}V · {s.losses}D</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ordre complet */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-300">Ordre de lancement</h3>
        <div className="space-y-1.5">
          {order.map((s, i) => (
            <div key={s.projectId} className="flex items-center gap-3 rounded-lg bg-black/20 p-2">
              <span className="w-6 text-center text-lg font-black text-amber-300">{i + 1}</span>
              <ProjectMedia project={byId.get(s.projectId)!} className="h-10 w-12" />
              <span className="flex-1 truncate font-semibold text-white">{byId.get(s.projectId)?.title}</span>
              <span className="text-xs text-slate-400">Copeland {s.copeland >= 0 ? '+' : ''}{s.copeland}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Btn variant="ghost" onClick={async () => { await setStage(session.id, 'duels'); onChanged(); }}>← Retour aux duels</Btn>
        <Btn variant="primary" onClick={doExport}>⬇ Exporter le verdict (JSON)</Btn>
      </div>
    </div>
  );
}
