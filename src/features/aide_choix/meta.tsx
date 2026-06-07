// Aide au choix — variables catégorielles + intensité capitalistique : UI.
import { useState } from 'react';
import type { ACProject, ProjectMeta } from './types';
import { CATEGORICAL_DIMS, RESOURCE_FLAGS, capitalIntensity, patchProject } from './db';
import { Btn } from './ui';

const CAP_LABEL = ['nulle', 'légère', 'moyenne', 'forte'];

/** Badge compact d'intensité capitalistique (●●○ + libellé). */
export function CapitalBadge({ meta, showLabel = false }: { meta?: ProjectMeta; showLabel?: boolean }) {
  const n = capitalIntensity(meta);
  if (n === 0 && !meta?.loanSize) return null;
  const tone = n >= 3 ? 'text-rose-300' : n === 2 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${tone}`} title="Intensité capitalistique : ressources à immobiliser avant que ça tourne.">
      <span className="tracking-tighter">{'●'.repeat(n)}{'○'.repeat(3 - n)}</span>
      {showLabel && <span className="text-slate-400">capi. {CAP_LABEL[n]}{meta?.loan && meta.loanSize ? ` · prêt ${'▲'.repeat(meta.loanSize)}` : ''}</span>}
    </span>
  );
}

/** Petites étiquettes catégorielles d'un projet. */
export function MetaChips({ meta, max = 4 }: { meta?: ProjectMeta; max?: number }) {
  if (!meta) return null;
  const chips = CATEGORICAL_DIMS
    .map(d => meta[d.key as keyof ProjectMeta])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, max);
  if (chips.length === 0 && capitalIntensity(meta) === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((c, i) => (
        <span key={i} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">{c}</span>
      ))}
      <CapitalBadge meta={meta} />
    </div>
  );
}

/** Éditeur des variables d'un projet (modal). */
export function MetaEditor({ project, onClose, onSaved }:
  { project: ACProject; onClose: () => void; onSaved: (meta: ProjectMeta) => void }) {
  const [meta, setMeta] = useState<ProjectMeta>(project.meta ?? {});
  const set = (patch: Partial<ProjectMeta>) => setMeta(m => ({ ...m, ...patch }));

  const save = async () => {
    await patchProject(project.id, { meta });
    onSaved(meta);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-[#22335c] bg-[#101d3d] p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Variables — {project.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Catégorielles */}
        <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Catégorielles <span className="normal-case text-slate-500">(filtres, non notées)</span></p>
        <div className="space-y-3">
          {CATEGORICAL_DIMS.map(dim => {
            const val = meta[dim.key as keyof ProjectMeta] as string | undefined;
            return (
              <div key={dim.key}>
                <div className="mb-1 text-sm font-semibold text-slate-200">{dim.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {dim.options.map(opt => (
                    <button key={opt} onClick={() => set({ [dim.key]: val === opt ? undefined : opt } as Partial<ProjectMeta>)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition
                        ${val === opt ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ressources / intensité capitalistique */}
        <p className="mb-2 mt-5 text-xs uppercase tracking-wider text-slate-400">Besoins en ressources <span className="normal-case text-slate-500">(intensité capitalistique)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {RESOURCE_FLAGS.map(f => {
            const on = !!meta[f.key as keyof ProjectMeta];
            return (
              <button key={f.key} onClick={() => set({ [f.key]: !on } as Partial<ProjectMeta>)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition
                  ${on ? 'border-rose-400 bg-rose-400/15 text-rose-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
                {f.label}
              </button>
            );
          })}
        </div>
        {meta.loan && (
          <div className="mt-3">
            <div className="mb-1 text-sm text-slate-300">Taille du prêt</div>
            <div className="flex gap-1.5">
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => set({ loanSize: meta.loanSize === n ? 0 : n })}
                  className={`rounded-lg px-3 py-1 text-sm font-bold transition ${(meta.loanSize ?? 0) >= n ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {'▲'.repeat(n)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <CapitalBadge meta={meta} showLabel />
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" onClick={save}>Enregistrer</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
