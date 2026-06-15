// Aide au choix — explication animée de la méthode (métaphore des coureurs).
import { useState, useEffect } from 'react';
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
const ENVIE: Record<string, string> = { A: '+3', B: '+2', C: '−1', D: '0' };
const RATING_COL: Record<string, string> = { Bon: '#467434', Moyen: '#888', Mauvais: '#e1495f' };

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

function EnvieHeart({ v }: { v: string }) {
  const pos = v.startsWith('+') && v !== '+0';
  const neg = v.startsWith('−');
  const tone = pos ? 'bg-[#467434]/25 text-[#8ABF74]' : neg ? 'bg-[#F58F20]/20 text-[#F9B877]' : 'bg-white/10 text-slate-300';
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${tone}`}>♥ envie {v}</span>;
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.16, delayChildren: 0.15 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="max-w-lg text-center text-[15px] leading-relaxed text-slate-300">{children}</p>;
}
function Foot({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg text-center text-sm text-slate-500">{children}</div>;
}

// ── Scène 0 : la métaphore ───────────────────────────────────────────────────
function SceneIntro() {
  return (
    <div className="flex flex-col items-center gap-6">
      <Caption>Imagine chaque projet comme un <b className="text-white">coureur</b>. On va les faire passer par
        <b className="text-[#F9B877]"> 4 épreuves</b> pour trouver lequel lancer en premier.</Caption>
      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-wrap justify-center gap-2">
        {['A', 'B', 'C', 'D', 'E', 'F'].map(id => (
          <motion.div key={id} variants={item} animate={{ y: [0, -5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: Math.random() }}>
            <Runner id={id} size="lg" />
          </motion.div>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        className="flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-bold text-slate-300">
        <span className="text-white">~50 projets</span><span className="text-slate-600">→</span>
        <span>on jette les morts</span><span className="text-slate-600">→</span>
        <span className="text-white">~17</span><span className="text-slate-600">→</span>
        <span>on note</span><span className="text-slate-600">→</span>
        <span className="text-[#F9B877]">groupe de tête</span><span className="text-slate-600">→</span>
        <span>duels</span><span className="text-slate-600">→</span><span className="text-[#8ABF74]">le n°1</span>
      </motion.div>
    </div>
  );
}

// ── Scène 1 : le tri ─────────────────────────────────────────────────────────
function SceneTri() {
  const eliminated = (id: string) => TRI[id].filter(v => v === 'non').length >= 2;
  return (
    <div className="flex flex-col items-center gap-4">
      <Caption><b className="text-white">Épreuve 1 — Le tri.</b> Trois juges donnent leur première impression :
        <span className="text-[#6FA85A]"> ✓ oui</span>, <span className="text-slate-400">– peut-être</span>,
        <span className="text-[#e1495f]"> ✗ non</span>. Un coureur avec <b>2 ✗</b> est éliminé.</Caption>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md space-y-2">
        {Object.keys(TRI).map(id => {
          const out = eliminated(id);
          return (
            <motion.div key={id} variants={item} animate={out ? { opacity: 0.4, x: 10 } : {}}
              transition={{ delay: out ? 1.9 : 0 }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-2">
              <Runner id={id} dim={out} />
              <div className="flex items-center gap-2">
                {!out && <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.5 }}><EnvieHeart v={ENVIE[id]} /></motion.span>}
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
                {out && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
                  className="rounded bg-[#e1495f]/20 px-2 py-0.5 text-xs font-bold text-[#e1495f]">éliminé</motion.span>}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <Foot>E et F partent (2 ✗) → restent <b className="text-[#6FA85A]">A, B, C, D</b>. Au passage on garde l'<b className="text-[#F9B877]">envie ♥</b> (Oui +1, Peut-être 0, Non −1) : elle resservira à la fin.</Foot>
    </div>
  );
}

// ── Scène 2 : transformer les notes en places ────────────────────────────────
function Flip({ front, back, delay }: { front: React.ReactNode; back: React.ReactNode; delay: number }) {
  const [f, setF] = useState(false);
  useEffect(() => { const t = setTimeout(() => setF(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <motion.div animate={{ rotateY: f ? 180 : 0 }} transition={{ duration: 0.6 }}
      style={{ transformStyle: 'preserve-3d', position: 'relative', width: 92, height: 56 }}>
      <div style={{ backfaceVisibility: 'hidden', position: 'absolute', inset: 0 }}>{front}</div>
      <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', inset: 0 }}>{back}</div>
    </motion.div>
  );
}
const CONV = [
  { id: 'A', rating: 'Bon', place: '1,5', tie: true },
  { id: 'B', rating: 'Bon', place: '1,5', tie: true },
  { id: 'C', rating: 'Moyen', place: '3', tie: false },
  { id: 'D', rating: 'Mauvais', place: '4', tie: false },
];
function SceneConvert() {
  return (
    <div className="flex flex-col items-center gap-5">
      <Caption><b className="text-white">On transforme les notes en places.</b> Comme dans une course : le meilleur
        finit <b>1ᵉʳ</b> (place 1). Deux <b>ex æquo</b> se partagent leurs places → ils prennent la <b>moyenne</b>.</Caption>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {CONV.map((c, i) => (
          <div key={c.id} className="flex flex-col items-center gap-1.5">
            <Runner id={c.id} size="sm" />
            <Flip delay={900 + i * 350}
              front={
                <div className="flex h-full w-full items-center justify-center rounded-lg border-2 font-bold"
                  style={{ borderColor: RATING_COL[c.rating], color: RATING_COL[c.rating], background: RATING_COL[c.rating] + '1a' }}>
                  {c.rating}
                </div>}
              back={
                <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-[#F58F20] text-slate-900">
                  <span className="text-lg font-black leading-none">{c.place}</span>
                  <span className="text-[8px] font-bold">{c.tie ? 'ex æquo' : 'ᵉ place'}</span>
                </div>}
            />
          </div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}>
        <Foot>A et B sont tous deux « Bon » → ils se partagent les places 1 et 2 → <b className="text-white">1,5 chacun</b>.
          Puis C prend la 3ᵉ, D la 4ᵉ.</Foot>
      </motion.div>
    </div>
  );
}

// ── Scène 3 : la course (une par critère) ────────────────────────────────────
const RACE = [
  { id: 'A', place: '1,5', off: 55, tie: true },
  { id: 'B', place: '1,5', off: 55, tie: true },
  { id: 'C', place: '3', off: 32, tie: false },
  { id: 'D', place: '4', off: 6, tie: false },
];
function SceneRace() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Caption>Chaque <b className="text-white">critère</b> est une course, refaite par <b>chaque personne</b>.
        Voici la course « Besoin » vue par une personne.</Caption>
      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="absolute bottom-3 right-3 top-3 w-0.5 border-l-2 border-dashed border-[#F9B877]/60" />
        <span className="absolute right-4 top-1 text-[10px] font-bold uppercase tracking-wider text-[#F9B877]/70">arrivée</span>
        <div className="space-y-2.5">
          {RACE.map((r, i) => (
            <div key={r.id} className="relative h-10">
              <div className="absolute inset-y-0 left-0 right-6 rounded bg-white/5" />
              <motion.div className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap"
                initial={{ left: '0%', opacity: 0 }} animate={{ left: `${r.off}%`, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.25, duration: 1.1, type: 'spring', stiffness: 55 }}>
                <Runner id={r.id} size="sm" />
                <span className="rounded-full bg-[#F58F20] px-2 py-0.5 text-xs font-black text-slate-900">{r.place}{r.tie ? '' : 'ᵉ'}</span>
                {r.tie && <span className="text-[9px] font-bold text-[#F9B877]">ex æquo</span>}
              </motion.div>
            </div>
          ))}
        </div>
      </div>
      <Foot>Avec 7 critères et 3 personnes, ça fait beaucoup de petites courses — mais le principe est le même.</Foot>
    </div>
  );
}

// ── Scène 4 : l'addition, avec le critère important qui compte double ─────────
function SceneSum() {
  return (
    <div className="flex flex-col items-center gap-5">
      <Caption><b className="text-white">On additionne les places.</b> Et le critère important
        (« Besoin ») <b className="text-[#F9B877]">compte double</b>.</Caption>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-5">
        <Runner id="A" />
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <div className="text-[11px] text-slate-400">Besoin</div>
            <div className="font-bold text-white">place 1,5</div>
          </motion.div>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="font-black text-[#F9B877]">× 2 = 3</motion.span>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="text-2xl text-slate-600">+</motion.span>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}
            className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <div className="text-[11px] text-slate-400">Effort</div>
            <div className="font-bold text-white">place 4</div>
          </motion.div>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="font-black text-[#F9B877]">× 1 = 4</motion.span>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.5, type: 'spring' }}
          className="rounded-full bg-[#F58F20] px-4 py-1.5 text-lg font-black text-slate-900">3 + 4 = 7</motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.1 }} className="text-sm text-slate-400">
          puis on additionne les <b className="text-white">3 personnes</b> → total A = <b className="text-white">21,5</b>
        </motion.div>
      </div>
      <Foot>Souviens-toi : <b className="text-[#F9B877]">petit total = bon</b> (être souvent 1ᵉʳ donne de petits nombres).</Foot>
    </div>
  );
}

// ── Scène 5 : le classement (on réordonne par total) ─────────────────────────
const RANK_RACE = ['A', 'B', 'C', 'D']; // ordre « avant », par commodité
const RANK = [
  { id: 'B', total: '16', top: true },
  { id: 'A', total: '21,5', top: true },
  { id: 'D', total: '25,5', top: true },
  { id: 'C', total: '27', top: false },
];
function SceneRank() {
  const [ordered, setOrdered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOrdered(true), 1200); return () => clearTimeout(t); }, []);
  const list = ordered ? RANK : RANK_RACE.map(id => RANK.find(r => r.id === id)!);
  return (
    <div className="flex flex-col items-center gap-4">
      <Caption>On range les coureurs par <b className="text-white">total</b>, du plus petit au plus grand. Puis on garde
        le <b className="text-[#F9B877]">groupe de tête</b> (ici, les 3 premiers).</Caption>
      <div className="w-full max-w-md space-y-2">
        {list.map((r, i) => (
          <motion.div key={r.id} layout transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className={`flex items-center gap-3 rounded-xl border p-2.5 ${ordered && r.top ? 'border-[#F58F20]/50 bg-[#F58F20]/10' : 'border-white/10 bg-black/20'}`}>
            <span className="w-6 text-center text-lg font-black" style={{ color: ordered && i < 3 ? '#F9B877' : '#777' }}>{ordered ? i + 1 : '?'}</span>
            <Runner id={r.id} />
            <div className="flex-1" />
            <span className="text-sm text-slate-400">total <b className="text-white">{r.total}</b></span>
            <AnimatePresence>
              {ordered && (
                <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.top ? 'bg-[#F58F20] text-slate-900' : 'bg-white/10 text-slate-400'}`}>
                  {r.top ? 'TOP' : 'écarté'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      <Foot>B, A, D passent aux duels. C est écarté (et c'était aussi le plus froid en envie).</Foot>
    </div>
  );
}

// ── Scène 6 : les désaccords « à discuter » ──────────────────────────────────
function PositionScale({ positions }: { positions: { name: string; color: string; pos: number }[] }) {
  return (
    <div className="relative h-9 w-full max-w-xs rounded-full bg-white/5">
      {[1, 2, 3, 4].map(n => (
        <span key={n} className="absolute top-1/2 -translate-y-1/2 text-[9px] text-slate-600" style={{ left: `${(n - 1) / 3 * 100}%` }}>{n}ᵉ</span>
      ))}
      {positions.map((p, i) => (
        <motion.span key={p.name} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.2, type: 'spring' }}
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#262626]"
          style={{ left: `${(p.pos - 1) / 3 * 100}%`, background: p.color }} title={`${p.name} : ${p.pos}ᵉ`} />
      ))}
    </div>
  );
}
function SceneDisagree() {
  return (
    <div className="flex flex-col items-center gap-5">
      <Caption>En parallèle, l'outil repère les <b className="text-white">désaccords</b> : il regarde la place du projet
        dans le classement de <b>chaque personne</b>. Très écartés = <b className="text-[#e1495f]">à discuter</b>.</Caption>
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-xl border border-[#e1495f]/40 bg-[#e1495f]/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Runner id="D" size="sm" />
            <span className="rounded bg-[#e1495f]/20 px-2 py-0.5 text-xs font-bold text-[#e1495f]">⚠ à discuter</span>
          </div>
          <PositionScale positions={[
            { name: 'Lou', color: JUDGES[0].color, pos: 4 },
            { name: 'Max', color: JUDGES[1].color, pos: 4 },
            { name: 'Nour', color: JUDGES[2].color, pos: 2 },
          ]} />
          <div className="mt-1.5 text-xs text-slate-400">Nour le met 2ᵉ, les autres derniers → elle voit peut-être un atout qu'ils ratent.</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Runner id="B" size="sm" />
            <span className="rounded bg-[#467434]/20 px-2 py-0.5 text-xs font-bold text-[#8ABF74]">tout le monde d'accord</span>
          </div>
          <PositionScale positions={[
            { name: 'Lou', color: JUDGES[0].color, pos: 1 },
            { name: 'Max', color: JUDGES[1].color, pos: 2 },
            { name: 'Nour', color: JUDGES[2].color, pos: 1 },
          ]} />
          <div className="mt-1.5 text-xs text-slate-400">Tous le mettent en tête → inutile d'en parler.</div>
        </div>
      </div>
    </div>
  );
}

// ── Scène 7 : les duels ──────────────────────────────────────────────────────
const DUELS = [
  { a: 'B', b: 'A', win: 'B' },
  { a: 'B', b: 'D', win: 'B' },
  { a: 'A', b: 'D', win: 'D' },
];
function SceneDuels() {
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDone(true), 1800); return () => clearTimeout(t); }, []);
  return (
    <div className="flex flex-col items-center gap-4">
      <Caption><b className="text-white">Épreuve 3 — Les duels.</b> Les finalistes s'affrontent <b>deux par deux</b>
        (chacun contre tous). Le plus de <b className="text-[#6FA85A]">victoires</b> gagne.</Caption>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md space-y-2">
        {DUELS.map((d, i) => (
          <motion.div key={i} variants={item} className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
            <span style={{ opacity: d.win === d.a ? 1 : 0.4 }}><Runner id={d.a} size="sm" /></span>
            <span className="text-xs font-black text-slate-500">contre</span>
            <span style={{ opacity: d.win === d.b ? 1 : 0.4 }}><Runner id={d.b} size="sm" /></span>
            <span className="text-slate-500">→</span>
            <span className="rounded-full bg-[#467434] px-2 py-0.5 text-xs font-black text-white">{d.win} gagne</span>
          </motion.div>
        ))}
      </motion.div>
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-xl bg-black/30 px-4 py-2 text-sm">
            <span className="text-slate-400">Bilan :</span>
            <b className="text-[#8ABF74]">B (2 victoires)</b><span className="text-slate-600">→</span>
            <b className="text-slate-200">D (1)</b><span className="text-slate-600">→</span>
            <b className="text-slate-200">A (0)</b>
          </motion.div>
        )}
      </AnimatePresence>
      <Foot>La notation disait B, <b>A, D</b> ; les duels ont <b className="text-white">inversé A et D</b>. Et B bat tout le monde : choix net.</Foot>
    </div>
  );
}

// ── Scène 8 : le verdict ─────────────────────────────────────────────────────
const PODIUM = [
  { id: 'B', medal: '🥇', h: 'h-40', envie: '+2' },
  { id: 'D', medal: '🥈', h: 'h-32', envie: '0' },
  { id: 'A', medal: '🥉', h: 'h-28', envie: '+3' },
];
function SceneVerdict() {
  return (
    <div className="flex flex-col items-center gap-5">
      <Caption><b className="text-white">Le verdict</b> : l'ordre de lancement. Le <span className="text-[#F9B877]">♥ envie</span>
        montre l'envie de l'équipe — parfois <b>en tension</b> avec le classement.</Caption>
      <div className="flex items-end justify-center gap-3">
        {[1, 0, 2].map(idx => {
          const p = PODIUM[idx];
          return (
            <motion.div key={p.id} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 + idx * 0.18, type: 'spring', stiffness: 80 }}
              className="flex flex-col items-center gap-1">
              <span className="text-2xl">{p.medal}</span>
              <Runner id={p.id} size="sm" />
              <EnvieHeart v={p.envie} />
              <div className={`mt-1 w-20 rounded-t-lg border border-[#F58F20]/30 bg-gradient-to-b from-[#F58F20]/20 to-transparent ${p.h}`} />
            </motion.div>
          );
        })}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
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
  { title: 'Notes → places', render: SceneConvert },
  { title: 'Épreuve 2 · La course', render: SceneRace },
  { title: 'L\'addition (× 2)', render: SceneSum },
  { title: 'Le classement', render: SceneRank },
  { title: 'Les désaccords', render: SceneDisagree },
  { title: 'Épreuve 3 · Les duels', render: SceneDuels },
  { title: 'Le verdict', render: SceneVerdict },
];

export function MethodeScreen({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const Scene = SCENES[step].render;
  const last = SCENES.length - 1;
  const go = (s: number) => { setStep(Math.max(0, Math.min(last, s))); setReplay(r => r + 1); };

  // lecture automatique
  useEffect(() => {
    if (!playing) return;
    if (step >= last) { setPlaying(false); return; }
    const t = setTimeout(() => go(step + 1), 6500);
    return () => clearTimeout(t);
  }, [playing, step, replay, last]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#262626]/98 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#F9B877]">Comment ça marche · {step + 1}/{SCENES.length}</div>
          <div className="font-bold text-white">{SCENES[step].title}</div>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" onClick={() => setPlaying(p => !p)}>{playing ? '⏸ Pause' : '▶ Lecture auto'}</Btn>
          <Btn variant="ghost" onClick={onClose}>✕ Fermer</Btn>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl gap-1.5 px-4">
        {SCENES.map((_, i) => (
          <button key={i} onClick={() => go(i)}
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
        <Btn variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>← Précédent</Btn>
        <Btn variant="soft" onClick={() => setReplay(r => r + 1)}>↺ Rejouer</Btn>
        {step < last
          ? <Btn variant="primary" onClick={() => go(step + 1)}>Suivant →</Btn>
          : <Btn variant="primary" onClick={onClose}>✓ Terminé</Btn>}
      </div>
    </div>
  );
}
