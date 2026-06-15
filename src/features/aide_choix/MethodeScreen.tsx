// Aide au choix — explication animée de la méthode (métaphore des coureurs).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Btn } from './ui';

// ── Données de démonstration (cohérentes avec l'exemple chiffré) ─────────────
const COLORS: Record<string, string> = {
  A: '#F58F20', B: '#467434', C: '#38bdf8', D: '#a78bfa', E: '#fb7185', F: '#facc15',
};
const JUDGES = [
  { name: 'Lou', color: '#eab308' },
  { name: 'Max', color: '#38bdf8' },
  { name: 'Nour', color: '#fb7185' },
];
// votes du tri : ✓ oui, – peut-être, ✗ non
const TRI: Record<string, ('oui' | 'peut' | 'non')[]> = {
  A: ['oui', 'oui', 'oui'],
  B: ['oui', 'peut', 'oui'],
  C: ['peut', 'peut', 'non'],
  D: ['oui', 'non', 'peut'],
  E: ['non', 'non', 'peut'],
  F: ['non', 'non', 'oui'],
};
const VOTE_ICON = { oui: '✓', peut: '–', non: '✗' };
const VOTE_COL = { oui: '#467434', peut: '#888', non: '#e1495f' };

function Runner({ id, dim = false, size = 'md' }: { id: string; dim?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const pad = size === 'lg' ? 'px-3.5 py-2 text-base' : size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border-2 bg-[#2c2c2c] font-bold text-white ${pad}`}
      style={{ borderColor: dim ? '#555' : COLORS[id], opacity: dim ? 0.4 : 1 }}>
      <span style={{ filter: dim ? 'grayscale(1)' : 'none' }}>🏃</span>
      <span>Projet {id}</span>
    </div>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.16, delayChildren: 0.15 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

// ── Les scènes ───────────────────────────────────────────────────────────────
function SceneIntro() {
  return (
    <div className="flex flex-col items-center gap-6">
      <p className="max-w-md text-center text-slate-300">
        Imagine chaque projet comme un <b className="text-white">coureur</b>. On va les faire passer par
        <b className="text-[#F9B877]"> 4 épreuves</b> pour trouver lequel lancer en premier.
      </p>
      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-wrap justify-center gap-2">
        {['A', 'B', 'C', 'D', 'E', 'F'].map(id => (
          <motion.div key={id} variants={item}
            animate={{ y: [0, -5, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: Math.random() }}>
            <Runner id={id} size="lg" />
          </motion.div>
        ))}
      </motion.div>
      <div className="text-sm text-slate-500">6 coureurs sur la ligne de départ (en vrai, ~50).</div>
    </div>
  );
}

function SceneTri() {
  const eliminated = (id: string) => TRI[id].filter(v => v === 'non').length >= 2;
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-lg text-center text-slate-300">
        <b className="text-white">Épreuve 1 — Le tri.</b> Trois juges donnent leur première impression :
        <span className="text-[#6FA85A]"> ✓ oui</span>, <span className="text-slate-400">– peut-être</span>,
        <span className="text-[#e1495f]"> ✗ non</span>. Un coureur avec <b>2 ✗</b> est éliminé.
      </p>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md space-y-2">
        {Object.keys(TRI).map(id => {
          const out = eliminated(id);
          return (
            <motion.div key={id} variants={item}
              animate={out ? { opacity: 0.4, x: 10 } : {}} transition={{ delay: out ? 1.7 : 0 }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-2">
              <Runner id={id} dim={out} />
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {TRI[id].map((v, j) => (
                    <motion.span key={j} initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ delay: 0.4 + j * 0.12, type: 'spring', stiffness: 300 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-black"
                      style={{ background: VOTE_COL[v] + '33', color: VOTE_COL[v] }} title={JUDGES[j].name}>
                      {VOTE_ICON[v]}
                    </motion.span>
                  ))}
                </div>
                {out && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
                  className="rounded bg-[#e1495f]/20 px-2 py-0.5 text-xs font-bold text-[#e1495f]">éliminé</motion.span>}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <div className="text-sm text-slate-500">E et F partent (2 ✗). Il reste <b className="text-[#6FA85A]">A, B, C, D</b>.</div>
    </div>
  );
}

// place sur le critère « Besoin » (Alice) : A=1,5 B=1,5 C=3 D=4 → A et B ex æquo en tête
const RACE = [
  { id: 'A', place: '1,5', off: 55, tie: true },
  { id: 'B', place: '1,5', off: 55, tie: true },
  { id: 'C', place: '3', off: 32, tie: false },
  { id: 'D', place: '4', off: 6, tie: false },
];
function SceneRace() {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-lg text-center text-slate-300">
        <b className="text-white">Épreuve 2 — La notation.</b> Pour chaque critère, les survivants font une
        <b className="text-[#F9B877]"> course</b>. Le meilleur finit <b>1ᵉʳ</b> (place 1). Deux <b>ex æquo</b> se
        partagent la place : ils prennent <b>1,5</b>.
      </p>
      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="absolute bottom-3 right-3 top-3 w-0.5 border-l-2 border-dashed border-[#F9B877]/60" />
        <span className="absolute right-4 top-1 text-[10px] font-bold uppercase tracking-wider text-[#F9B877]/70">arrivée</span>
        <div className="space-y-2.5">
          {RACE.map((r, i) => (
            <div key={r.id} className="relative h-10">
              <div className="absolute inset-y-0 left-0 right-6 rounded bg-white/5" />
              <motion.div className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap"
                initial={{ left: '0%', opacity: 0 }} animate={{ left: `${r.off}%`, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.25, duration: 1, type: 'spring', stiffness: 60 }}>
                <Runner id={r.id} size="sm" />
                <span className="rounded-full bg-[#F58F20] px-2 py-0.5 text-xs font-black text-slate-900">{r.place}{r.tie ? '' : 'ᵉ'}</span>
                {r.tie && <span className="text-[9px] font-bold text-[#F9B877]">ex æquo</span>}
              </motion.div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-sm text-slate-500">Ici la course « Besoin ». On en fait une par critère, pour chaque personne.</div>
    </div>
  );
}

// classement final de la notation (totaux de l'exemple) ; top 3 surligné
const RANK = [
  { id: 'B', total: 16, top: true },
  { id: 'A', total: 21.5, top: true },
  { id: 'D', total: 25.5, top: true },
  { id: 'C', total: 27, top: false },
];
function SceneRank() {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-lg text-center text-slate-300">
        On <b className="text-white">additionne les places</b> de toutes les courses (le critère important compte
        <b> double</b>). <b className="text-[#F9B877]">Petit total = bon.</b> On garde le <b>groupe de tête</b>.
      </p>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md space-y-2">
        {RANK.map((r, i) => (
          <motion.div key={r.id} variants={item}
            className={`flex items-center gap-3 rounded-xl border p-2.5 ${r.top ? 'border-[#F58F20]/50 bg-[#F58F20]/10' : 'border-white/10 bg-black/20'}`}>
            <span className="w-6 text-center text-lg font-black" style={{ color: i < 3 ? '#F9B877' : '#777' }}>{i + 1}</span>
            <Runner id={r.id} />
            <div className="flex-1" />
            <span className="text-sm text-slate-400">total <b className="text-white">{String(r.total).replace('.', ',')}</b></span>
            {r.top
              ? <span className="rounded-full bg-[#F58F20] px-2 py-0.5 text-[10px] font-black text-slate-900">TOP</span>
              : <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">écarté</span>}
          </motion.div>
        ))}
      </motion.div>
      <div className="text-sm text-slate-500">B, A, D passent aux duels. C est écarté.</div>
    </div>
  );
}

const DUELS = [
  { a: 'B', b: 'A', win: 'B' },
  { a: 'B', b: 'D', win: 'B' },
  { a: 'A', b: 'D', win: 'D' },
];
function SceneDuels() {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-lg text-center text-slate-300">
        <b className="text-white">Épreuve 3 — Les duels.</b> Les finalistes s'affrontent <b>deux par deux</b>.
        Le plus de <b className="text-[#6FA85A]">victoires</b> gagne. (Chaque coureur affronte tous les autres.)
      </p>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md space-y-2">
        {DUELS.map((d, i) => (
          <motion.div key={i} variants={item} className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
            <span style={{ opacity: d.win === d.a ? 1 : 0.45 }}><Runner id={d.a} size="sm" /></span>
            <span className="text-sm font-black text-slate-500">contre</span>
            <span style={{ opacity: d.win === d.b ? 1 : 0.45 }}><Runner id={d.b} size="sm" /></span>
            <span className="text-slate-500">→</span>
            <span className="rounded-full bg-[#467434] px-2 py-0.5 text-xs font-black text-white">{d.win} gagne</span>
          </motion.div>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        className="text-sm text-slate-300">Bilan : B (2 victoires) → D (1) → A (0). Et <b className="text-white">B bat tout le monde</b> : choix net.</motion.div>
    </div>
  );
}

// podium + envie (issue du tri) : A +3, B +2, D 0
const PODIUM = [
  { id: 'B', rank: 1, medal: '🥇', h: 'h-40', envie: '+2' },
  { id: 'D', rank: 2, medal: '🥈', h: 'h-32', envie: '0' },
  { id: 'A', rank: 3, medal: '🥉', h: 'h-28', envie: '+3' },
];
function SceneVerdict() {
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="max-w-lg text-center text-slate-300">
        <b className="text-white">Le verdict</b> : l'ordre de lancement. Le <span className="text-[#F9B877]">♥ envie</span> montre
        l'envie de l'équipe — parfois <b>en tension</b> avec le classement.
      </p>
      <div className="flex items-end justify-center gap-3">
        {[1, 0, 2].map(idx => {
          const p = PODIUM[idx];
          return (
            <motion.div key={p.id} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 + idx * 0.15, type: 'spring', stiffness: 80 }}
              className="flex flex-col items-center gap-1">
              <span className="text-2xl">{p.medal}</span>
              <Runner id={p.id} size="sm" />
              <span className="rounded bg-[#F58F20]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F9B877]">♥ envie {p.envie}</span>
              <div className={`mt-1 w-20 rounded-t-lg border border-[#F58F20]/30 bg-gradient-to-b from-[#F58F20]/20 to-transparent ${p.h}`} />
            </motion.div>
          );
        })}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        className="max-w-md rounded-xl border border-[#F58F20]/30 bg-[#F58F20]/[0.06] p-3 text-center text-sm text-slate-300">
        Regarde <b className="text-white">A</b> : dernier des duels… mais c'est celui dont l'équipe a le
        <b className="text-[#F9B877]"> plus envie</b> (+3). Cette tension, on en parle avant de décider.
      </motion.div>
    </div>
  );
}

const SCENES = [
  { title: 'La métaphore', render: SceneIntro },
  { title: 'Épreuve 1 · Le tri', render: SceneTri },
  { title: 'Épreuve 2 · La course (notation)', render: SceneRace },
  { title: 'Épreuve 2 · Le classement', render: SceneRank },
  { title: 'Épreuve 3 · Les duels', render: SceneDuels },
  { title: 'Le verdict', render: SceneVerdict },
];

export function MethodeScreen({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const Scene = SCENES[step].render;
  const last = SCENES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#262626]/98 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#F9B877]">Comment ça marche</div>
          <div className="font-bold text-white">{SCENES[step].title}</div>
        </div>
        <Btn variant="ghost" onClick={onClose}>✕ Fermer</Btn>
      </div>

      {/* progression */}
      <div className="mx-auto flex w-full max-w-3xl gap-1.5 px-4">
        {SCENES.map((_, i) => (
          <button key={i} onClick={() => { setStep(i); setReplay(r => r + 1); }}
            className={`h-1.5 flex-1 rounded-full transition ${i <= step ? 'bg-[#F58F20]' : 'bg-white/15'}`} />
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div key={`${step}-${replay}`}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }} className="w-full">
            <Scene />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <Btn variant="ghost" disabled={step === 0} onClick={() => { setStep(s => Math.max(0, s - 1)); setReplay(r => r + 1); }}>← Précédent</Btn>
        <Btn variant="soft" onClick={() => setReplay(r => r + 1)}>↺ Rejouer</Btn>
        {step < last
          ? <Btn variant="primary" onClick={() => { setStep(s => Math.min(last, s + 1)); setReplay(r => r + 1); }}>Suivant →</Btn>
          : <Btn variant="primary" onClick={onClose}>✓ Terminé</Btn>}
      </div>
    </div>
  );
}
