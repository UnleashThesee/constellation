// Aide au choix — primitives d'interface partagées (bleu nuit + accent jaune).
import { useEffect, useMemo, useState } from 'react';
import type { ACProject, Participant, Stage } from './types';
import { STAGE_ORDER } from './types';

export const STAGE_LABEL: Record<Stage, string> = {
  setup: 'Réglage',
  tri: 'Étape 1 · Tri',
  triResults: 'Étape 1 · Résultats',
  notation: 'Étape 2 · Notation',
  notationResults: 'Étape 2 · Résultats',
  duels: 'Étape 3 · Duels',
  final: 'Choix final',
};

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'soft';
export function Btn({ variant = 'soft', className = '', ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed';
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-amber-400 text-slate-900 hover:bg-amber-300',
    ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
    soft: 'bg-white/5 text-slate-100 hover:bg-white/10 border border-white/10',
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl bg-[#101d3d] border border-[#22335c] ${className}`}>{children}</div>;
}

export function ProgressBar({ value, max, tone = 'amber' }: { value: number; max: number; tone?: 'amber' | 'emerald' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** URL objet pour un Blob, révoquée au démontage. */
export function useBlobUrl(blob?: Blob): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/** Affiche un projet : image, aperçu PDF, ou pastille texte. */
export function ProjectMedia({ project, className = '', rounded = 'rounded-xl' }:
  { project: ACProject; className?: string; rounded?: string }) {
  const url = useBlobUrl(project.blob);
  if (project.kind === 'image' && url) {
    return <img src={url} alt={project.title} className={`object-cover ${rounded} ${className}`} />;
  }
  if (project.kind === 'pdf' && url) {
    return (
      <div className={`relative overflow-hidden bg-slate-800 ${rounded} ${className}`}>
        <embed src={`${url}#toolbar=0&navpanes=0`} type="application/pdf" className="h-full w-full" />
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">PDF</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-indigo-600/40 to-sky-700/40 ${rounded} ${className}`}>
      <span className="px-3 text-center text-lg font-black text-white/90 line-clamp-3">{project.title}</span>
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />;
}

/** Sélecteur « qui es-tu ? » (un seul appareil, on vote à tour de rôle). */
export function WhoAmI({ participants, currentId, onPick, compact = false }:
  { participants: Participant[]; currentId: string | null; onPick: (id: string) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact && <span className="text-xs uppercase tracking-wider text-slate-400">Qui es-tu&nbsp;?</span>}
      {participants.map(p => {
        const active = p.id === currentId;
        return (
          <button key={p.id} onClick={() => onPick(p.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition
              ${active ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
            <Dot color={p.color} />{p.name}
          </button>
        );
      })}
    </div>
  );
}

/** Frise des étapes. */
export function Stepper({ stage, onJump }: { stage: Stage; onJump?: (s: Stage) => void }) {
  const idx = STAGE_ORDER.indexOf(stage);
  const main: Stage[] = ['setup', 'tri', 'notation', 'duels', 'final'];
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {main.map((s, i) => {
        const sIdx = STAGE_ORDER.indexOf(s);
        const done = sIdx < idx;
        const here = s === stage || (stage === 'triResults' && s === 'tri') || (stage === 'notationResults' && s === 'notation');
        return (
          <span key={s} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-600">›</span>}
            <button disabled={!onJump || sIdx > idx}
              onClick={() => onJump?.(s)}
              className={`rounded px-2 py-1 font-semibold transition
                ${here ? 'bg-amber-400 text-slate-900' : done ? 'text-emerald-300 hover:bg-white/5' : 'text-slate-500'}`}>
              {STAGE_LABEL[s].replace(/Étape \d+ · /, '')}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Petit hook d'état persistant en mémoire de session (qui suis-je). */
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; }
    catch { return initial; }
  });
  const set = (nv: T) => { setV(nv); try { sessionStorage.setItem(key, JSON.stringify(nv)); } catch { /* ignore */ } };
  return [v, set];
}
