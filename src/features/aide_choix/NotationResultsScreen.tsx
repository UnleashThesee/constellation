// Étape 2 — Résultats : classement normalisé par rang, désaccords, groupe de tête.
import { useEffect, useMemo, useState } from 'react';
import type { ACProject, ACScore, ACSession } from './types';
import { listProjects, listScores, patchSession, setStage } from './db';
import { computeNotation, computeTriTally } from './logic';
import { Btn, Card, Dot, ProjectMedia, Guide, GuideLine } from './ui';

export function NotationResultsScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [scores, setScores] = useState<ACScore[]>([]);
  const [topN, setTopN] = useState(session.topGroupSize);

  useEffect(() => { listProjects(session.id).then(setProjects); listScores(session.id).then(setScores); }, [session.id]);

  const survivors = useMemo(() => {
    const elimAuto = new Map(computeTriTally(projects, [], session.participants.length).map(t => [t.projectId, t]));
    return projects.filter(p => !(p.eliminated ?? elimAuto.get(p.id)?.eliminated ?? false));
  }, [projects, session.participants.length]);

  const byId = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const res = useMemo(
    () => computeNotation(survivors.map(p => p.id), scores, session.participants, session.criteria),
    [survivors, scores, session.participants, session.criteria],
  );

  // seuil de désaccord notable : >= moitié du nombre de projets restants
  const disagreeThreshold = Math.max(2, Math.ceil(survivors.length / 2));
  const disagreeMap = new Map(res.disagreement.map(d => [d.projectId, d]));

  const topIds = new Set(res.ranking.slice(0, topN).map(r => r.projectId));

  const proceed = async () => {
    await patchSession(session.id, { topGroupSize: topN });
    await setStage(session.id, 'duels'); onChanged();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Guide id="notationResults" title="Étape 2 — Résultats de la notation">
        <GuideLine tag="Le classement">Issu de vos notes transformées en rangs (sévère/généreux neutralisé). En haut = le mieux placé.</GuideLine>
        <GuideLine tag="« À discuter »">Les projets marqués en rouge sont ceux où vos avis divergent le plus — discutez-les en priorité, c'est là qu'il y a de l'info cachée.</GuideLine>
        <GuideLine tag="Groupe de tête">Choisis combien de projets (5–8) passent aux duels. Ne gardez que le haut du panier.</GuideLine>
      </Guide>
      <Card className="p-4">
        <p className="text-sm text-slate-300">
          Notes converties en <b className="text-[#F7A24A]">classements</b> (par personne et par critère) : ta sévérité ou ta générosité n'influence plus le résultat — seul ton <i>ordre</i> compte.
        </p>
      </Card>

      {/* Classement global */}
      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#F7A24A]">Classement global</h3>
        <div className="space-y-2">
          {res.ranking.map((r, idx) => {
            const p = byId.get(r.projectId); if (!p) return null;
            const dis = disagreeMap.get(r.projectId);
            const hot = (dis?.spread ?? 0) >= disagreeThreshold;
            const top = topIds.has(r.projectId);
            return (
              <div key={r.projectId} className={`flex items-center gap-3 rounded-xl border p-2 ${top ? 'border-[#F58F20]/40 bg-[#F58F20]/5' : 'border-white/10 bg-black/20'}`}>
                <span className={`w-7 text-center text-lg font-black ${idx < 3 ? 'text-[#F7A24A]' : 'text-slate-500'}`}>{idx + 1}</span>
                <ProjectMedia project={p} className="h-11 w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{p.title}</div>
                  <div className="text-[11px] text-slate-500">rang moyen {r.meanRank.toFixed(2)}</div>
                </div>
                {hot && (
                  <span className="shrink-0 rounded-full bg-rose-500/20 px-2 py-1 text-[11px] font-bold text-rose-300" title="Vos avis divergent fortement : à discuter.">
                    ⚠ à discuter
                  </span>
                )}
                {top && <span className="shrink-0 rounded-full bg-[#F58F20] px-2 py-0.5 text-[11px] font-bold text-slate-900">TOP</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Gagnants par critère */}
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#6FA85A]">En tête par critère</h3>
          <div className="space-y-1.5">
            {session.criteria.map(c => {
              const winner = res.criterionWinners[c.id];
              const wp = winner ? byId.get(winner) : null;
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-300">{c.name}</span>
                  <span className="truncate font-semibold text-white">{wp?.title ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Désaccords à discuter */}
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-rose-300">À discuter en priorité</h3>
          {res.disagreement.filter(d => d.spread >= disagreeThreshold).length === 0 ? (
            <p className="text-sm text-slate-400">Pas de gros désaccord — vous êtes alignés.</p>
          ) : (
            <div className="space-y-1.5">
              {res.disagreement.filter(d => d.spread >= disagreeThreshold).map(d => {
                const p = byId.get(d.projectId);
                return (
                  <div key={d.projectId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-semibold text-white">{p?.title}</span>
                    <span className="flex shrink-0 gap-1">
                      {session.participants.map(part => (
                        <span key={part.id} className="flex items-center gap-0.5 text-[11px] text-slate-400" title={part.name}>
                          <Dot color={part.color} />{d.positions[part.id] ?? '—'}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">Les chiffres = la position du projet dans le classement de chaque personne. Très écartés ⇒ quelqu'un sait sûrement un truc que les autres ignorent.</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Groupe de tête :
          <input type="number" min={2} max={Math.max(2, survivors.length)} value={topN}
            onChange={e => setTopN(Math.min(survivors.length, Math.max(2, +e.target.value)))}
            className="w-16 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-white outline-none focus:border-[#F58F20]" />
          projets
        </label>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={async () => { await setStage(session.id, 'notation'); onChanged(); }}>← Re-noter</Btn>
          <Btn variant="primary" onClick={proceed}>Duels sur le top {topN} →</Btn>
        </div>
      </div>
    </div>
  );
}
