// Aide au choix — primitives d'interface partagées (gris #363636 + accent orange).
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
    primary: 'bg-[#F58F20] text-slate-900 hover:bg-[#F7A24A]',
    ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
    soft: 'bg-white/5 text-slate-100 hover:bg-white/10 border border-white/10',
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl bg-[#363636] border border-[#4a4a4a] ${className}`}>{children}</div>;
}

export function ProgressBar({ value, max, tone = 'amber' }: { value: number; max: number; tone?: 'amber' | 'emerald' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = tone === 'amber' ? 'bg-[#F58F20]' : 'bg-[#558A40]';
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
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-[#F7A24A]">PDF</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-[#F58F20]/40 to-[#467434]/40 ${rounded} ${className}`}>
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
              ${active ? 'border-[#F58F20] bg-[#F58F20]/15 text-[#F9B877]' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
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
                ${here ? 'bg-[#F58F20] text-slate-900' : done ? 'text-[#6FA85A] hover:bg-white/5' : 'text-slate-500'}`}>
              {STAGE_LABEL[s].replace(/Étape \d+ · /, '')}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Encart d'aide repliable, pour expliquer chaque étape. Ouvert par défaut. */
export function Guide({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useLocalState<boolean>(`ac:guide:${id}`, true);
  return (
    <div className="rounded-xl border border-[#F58F20]/30 bg-[#F58F20]/[0.06]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-[#F9B877]">💡 {title}</span>
        <span className="text-xs text-[#F7A24A]/70">{open ? '▲ masquer' : '▼ afficher l\'aide'}</span>
      </button>
      {open && <div className="space-y-1.5 px-4 pb-3 text-sm leading-relaxed text-slate-300">{children}</div>}
    </div>
  );
}

/** Une ligne d'aide « étiquette : texte ». */
export function GuideLine({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <p><span className="font-semibold text-[#F9B877]/90">{tag} :</span> {children}</p>
  );
}

/** Suivi d'avancement par participant (modèle « chacun son tour »). */
export function ParticipantProgress({ participants, progress, label }:
  { participants: Participant[]; progress: Record<string, { done: number; total: number }>; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>}
      {participants.map(p => {
        const d = progress[p.id] ?? { done: 0, total: 0 };
        const complete = d.total > 0 && d.done >= d.total;
        return (
          <span key={p.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold
            ${complete ? 'bg-[#467434]/20 text-[#8ABF74]' : 'bg-white/5 text-slate-300'}`}>
            <Dot color={p.color} />{p.name} {complete ? '✓ fini' : `${d.done}/${d.total}`}
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
