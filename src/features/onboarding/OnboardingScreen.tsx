import { useState, useEffect } from 'react';
import { Sunburst, FileSeal, Aster, Stamp } from '../../components/ui/atoms';
import { CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { CATEGORIES } from '../../lib/categories';
import { fetchOnboardingConcepts } from '../../services/wikidata';
import { saveProfile, cacheConcept, recordInteraction, toggleFavorite } from '../../stores/db';

const ONBOARDING_SESSION = `onboarding-${Date.now()}`;
import type { Concept, SwipeVerdict, CategoryKey } from '../../types';

// ---- Static fallback for offline ----
const FALLBACK_QUIZZ: Concept[] = [
  { id: 'foucault', name: 'Michel Foucault', kind: 'Auteur', years: '1926–1984', cats: [['philosophie', 0.7], ['histoire', 0.3]], blurb: 'Archéologue des savoirs. Démonte les régimes de vérité et les dispositifs de pouvoir.', refs: [], sourceKind: 'random' },
  { id: 'daftpunk', name: 'Daft Punk', kind: 'Groupe', years: '1993–2021', cats: [['musique', 0.85], ['arts', 0.15]], blurb: 'House français au casque robotique. Une electronica qui devient mythologie pop.', refs: [], sourceKind: 'random' },
  { id: 'bioshock', name: 'BioShock', kind: 'Œuvre', years: '2007', cats: [['jeuvideo', 0.5], ['philosophie', 0.3], ['arts', 0.2]], blurb: 'Cité sous-marine Art déco où Ayn Rand rencontre l\'horreur biopunk.', refs: [], sourceKind: 'random' },
  { id: 'tarkovski', name: 'Andreï Tarkovski', kind: 'Cinéaste', years: '1932–1986', cats: [['cinema', 0.8], ['arts', 0.2]], blurb: 'Maître soviétique du long plan méditatif. Solaris, Stalker, Nostalghia.', refs: [], sourceKind: 'random' },
  { id: 'borges', name: 'Jorge Luis Borges', kind: 'Auteur', years: '1899–1986', cats: [['litterature', 0.8], ['philosophie', 0.2]], blurb: 'Labyrinthes, miroirs et bibliothèques infinies. La littérature comme métaphysique.', refs: [], sourceKind: 'random' },
  { id: 'braudel', name: 'Fernand Braudel', kind: 'Historien', years: '1902–1985', cats: [['histoire', 0.6], ['humaines', 0.4]], blurb: 'La longue durée. La Méditerranée comme acteur de l\'histoire.', refs: [], sourceKind: 'random' },
  { id: 'beethoven', name: 'Ludwig van Beethoven', kind: 'Compositeur', years: '1770–1827', cats: [['musique', 0.9], ['personnages', 0.1]], blurb: 'De l\'école viennoise classique au romantisme. La 9ème, le sourd qui entend.', refs: [], sourceKind: 'random' },
  { id: 'wittgenstein', name: 'Wittgenstein', kind: 'Philosophe', years: '1889–1951', cats: [['philosophie', 0.8], ['sciences', 0.2]], blurb: 'Les limites du langage sont les limites du monde. Tractatus et Investigations.', refs: [], sourceKind: 'random' },
];

// ---- Logo Constellation ----
function ConstellationLogo({ size = 140 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" style={{ display: 'block' }}>
      <defs>
        <filter id="onb-shadow"><feDropShadow dx="3" dy="3" stdDeviation="0" floodColor="var(--cit-navy-dk)" /></filter>
      </defs>
      <g filter="url(#onb-shadow)">
        <circle cx="70" cy="70" r="62" fill="var(--cit-butter)" stroke="var(--cit-navy-dk)" strokeWidth="4" />
        <circle cx="70" cy="70" r="50" fill="none" stroke="var(--cit-navy-dk)" strokeWidth="1.5" />
        <circle cx="70" cy="70" r="20" fill="var(--cit-brick)" stroke="var(--cit-navy-dk)" strokeWidth="3" />
        <path d="M70 50 L73 65 L88 70 L73 75 L70 90 L67 75 L52 70 L67 65 Z" fill="var(--cit-cream)" />
        {[12, 60, 120, 180, 240, 300, 348].map(a => {
          const rad = (a * Math.PI) / 180;
          return <circle key={a} cx={70 + Math.cos(rad) * 50} cy={70 + Math.sin(rad) * 50} r="3.5" fill="var(--cit-navy-dk)" />;
        })}
        {[12, 60, 120, 180, 240, 300, 348].map(a => {
          const rad = (a * Math.PI) / 180;
          return <line key={a} x1="70" y1="70" x2={70 + Math.cos(rad) * 50} y2={70 + Math.sin(rad) * 50} stroke="var(--cit-navy-dk)" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.6" />;
        })}
      </g>
      <text x="70" y="16" fontFamily="Oswald, sans-serif" fontSize="8" fontWeight="700" letterSpacing="2" textAnchor="middle" fill="var(--cit-navy-dk)">★ CONSTELLATION ★</text>
      <text x="70" y="132" fontFamily="Oswald, sans-serif" fontSize="7" fontWeight="700" letterSpacing="2" textAnchor="middle" fill="var(--cit-navy-dk)">BUREAU · 1957</text>
    </svg>
  );
}

// ---- 7.1 Bienvenue ----
function OnboardingWelcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: '60px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center', zIndex: 3, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <ConstellationLogo size={280} />
          <Stamp tone="brick" rotate={-3}>★ TOUT NEUF DEPUIS 1957 ★</Stamp>
        </div>
        <div>
          <div className="cit-script" style={{ fontSize: 56, color: 'var(--cit-navy)', lineHeight: 0.85 }}>Bonjour,</div>
          <h1 className="cit-h1" style={{ fontSize: 88, lineHeight: 0.85, margin: '4px 0 0' }}>
            CITOYEN<span style={{ color: 'var(--cit-brick)' }}>!</span>
          </h1>
          <div className="cit-condensed" style={{ fontSize: 16, color: 'var(--cit-navy-lt)', marginTop: 8 }}>
            ★ CONSTELLATION · TERMINAL PERSONNEL D'EXPLORATION INTELLECTUELLE
          </div>
          <p className="cit-typed" style={{ margin: '26px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--cit-navy-dk)', maxWidth: 540 }}>
            Le Bureau va vous présenter <strong style={{ color: 'var(--cit-brick)' }}>30 dossiers</strong> de concepts — auteurs, œuvres, théories, jeux vidéo, courants. Vous validez ceux qui vous intéressent. Votre univers personnel commence à prendre forme.
          </p>
          <ul className="cit-typed" style={{ margin: '20px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--cit-navy-dk)', fontSize: 14 }}>
            {[
              '5 minutes · 30 dossiers express',
              'Le Bureau s\'occupe de tout · aucune création de compte',
              'Tout reste sur votre terminal · le Bureau ne vous espionne pas',
            ].map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Aster size={22} /><span>{t}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 30, display: 'flex', gap: 14, alignItems: 'center' }}>
            <button onClick={onStart} style={{
              background: 'var(--cit-brick)', color: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)', padding: '18px 36px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 28, letterSpacing: '.04em',
              cursor: 'pointer', textTransform: 'uppercase', textShadow: '2px 2px 0 var(--cit-navy-dk)',
              boxShadow: 'inset 0 -5px 0 oklch(0% 0 0 / 0.3), 5px 5px 0 var(--cit-navy-dk), 0 10px 18px oklch(0% 0 0 / 0.4)',
            }}>★ COMMENCER LE QUIZZ</button>
            <button onClick={onSkip} style={{
              background: 'transparent', color: 'var(--cit-navy-dk)',
              border: '2.5px solid var(--cit-navy-dk)', padding: '10px 18px',
              fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 700,
              letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer',
              boxShadow: '3px 3px 0 var(--cit-navy-dk)',
            }}>Passer le quizz</button>
          </div>
          <div className="cit-script" style={{ fontSize: 22, color: 'var(--cit-navy)', marginTop: 24, transform: 'rotate(-1deg)', display: 'inline-block' }}>
            « C'est gratuit et c'est joyeux. »
          </div>
        </div>
      </div>
      <CitizenFooter left="★ CONSTELLATION · v0.1.0-φ · PREMIÈRE VISITE · ÉDITION DU SOIR ★" right="APPUYEZ SUR ENTRÉE POUR COMMENCER" />
    </div>
  );
}

// ---- Jauge quizz ----
function QuizzGauge({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', background: 'var(--cit-cream)', border: '3px solid var(--cit-navy-dk)', boxShadow: '4px 4px 0 var(--cit-navy-dk)' }}>
      <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', whiteSpace: 'nowrap' }}>★ DOSSIER</div>
      <div className="cit-h1" style={{ fontSize: 32, lineHeight: 0.9, color: 'var(--cit-brick)', textShadow: 'none' }}>
        {String(current).padStart(2, '0')}<span style={{ color: 'var(--cit-navy-lt)', fontSize: 22 }}>/{total}</span>
      </div>
      <div style={{ flex: 1, height: 16, border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-paper)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${(current / total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--cit-brick), var(--cit-mustard))', borderRight: '2px solid var(--cit-navy-dk)', transition: 'width .3s ease' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ position: 'absolute', left: `${((i + 1) / 6) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--cit-navy-dk)', opacity: 0.4 }} />
        ))}
      </div>
      <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>ENCORE {total - current}</span>
    </div>
  );
}

// ---- 7.2 Quizz ----
function OnboardingQuizz({ onComplete }: { onComplete: (verdicts: Array<{ conceptId: string; verdict: SwipeVerdict }>) => void }) {
  const [concepts, setConcepts] = useState<Concept[]>(FALLBACK_QUIZZ);
  const [idx, setIdx] = useState(0);
  const [verdicts, setVerdicts] = useState<Array<{ conceptId: string; verdict: SwipeVerdict }>>([]);
  const [loading, setLoading] = useState(true);

  const total = 30;

  useEffect(() => {
    fetchOnboardingConcepts()
      .then(fetched => {
        if (fetched.length >= 20) {
          const padded = fetched.length >= 30 ? fetched.slice(0, 30) : [
            ...fetched,
            ...FALLBACK_QUIZZ.slice(0, 30 - fetched.length),
          ];
          setConcepts(padded);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const concept = concepts[idx % concepts.length];

  const answer = (verdict: SwipeVerdict) => {
    const newVerdicts = [...verdicts, { conceptId: concept.id, verdict }];
    setVerdicts(newVerdicts);
    // Persist concept + interaction so Stats/Map/Favs reflect the quiz answers
    cacheConcept(concept).then(() => recordInteraction(concept.id, verdict, ONBOARDING_SESSION)).catch(() => {});
    if (idx >= total - 1) {
      onComplete(newVerdicts);
    } else {
      setIdx(i => i + 1);
    }
  };

  if (loading) {
    return (
      <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, position: 'relative' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="cit-h1" style={{ fontSize: 32 }}>CHARGEMENT<span style={{ color: 'var(--cit-brick)' }}>!</span></div>
          <div className="cit-typed" style={{ marginTop: 8, color: 'var(--cit-navy-lt)' }}>Le Bureau récupère 30 dossiers depuis Wikidata…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 32px 12px', zIndex: 3, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSeal size={42} />
            <div>
              <div className="cit-h1" style={{ fontSize: 22, lineHeight: 0.9 }}>AMORÇAGE<span style={{ color: 'var(--cit-brick)' }}>!</span></div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ INITIALISATION DU TERMINAL · ÉTAPE 1/3</div>
            </div>
          </div>
          <Stamp tone="brick" rotate={-3}>5 MIN · 30 DOSSIERS</Stamp>
        </div>
        <QuizzGauge current={idx + 1} total={total} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px', position: 'relative', zIndex: 3 }}>
        <div style={{ width: '100%', maxWidth: 540 }}>
          <div className="cit-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)', padding: '16px 24px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', borderBottom: '3px solid var(--cit-navy-dk)' }}>
              <div className="cit-halftone" style={{ position: 'absolute', inset: 0 }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
                  ★ DOSSIER {String(idx + 1).padStart(3, '0')} · QUIZZ D'AMORÇAGE ★
                </div>
                <h2 className="cit-h1 cit-h1--reverse" style={{ margin: '2px 0', fontSize: 48, lineHeight: 0.9 }}>
                  {concept?.name}<span style={{ color: 'var(--cit-butter)' }}>!</span>
                </h2>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-cream)' }}>
                  {concept?.kind} · {concept?.years ?? '—'}
                </div>
              </div>
              <Sunburst size={80} color="var(--cit-butter)" behindColor="var(--cit-brick)" />
            </div>

            <div style={{ padding: '20px 24px' }}>
              <p className="cit-typed" style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: 'var(--cit-navy-dk)' }}>
                {concept?.blurb}
              </p>
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {concept?.cats.map(([k, w]) => {
                  const c = CATEGORIES[k as CategoryKey];
                  if (!c) return null;
                  return (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', padding: '3px 9px', border: '2px solid var(--cit-navy-dk)', background: 'var(--cit-cream)', color: 'var(--cit-navy-dk)' }}>
                      <span style={{ width: 9, height: 9, background: c.oklch, border: '1.5px solid var(--cit-navy-dk)' }} />
                      {c.label} <span style={{ color: 'var(--cit-brick)' }}>{Math.round(w * 100)}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22, display: 'flex', gap: 14, justifyContent: 'center' }}>
            <CitButton tone="brick" onClick={() => answer('reject')} kbd="←">Recyclez !</CitButton>
            <CitButton onClick={() => answer('skip')} kbd="↑">Plus tard</CitButton>
            <CitButton tone="butter" onClick={() => answer('valid')} kbd="→">Adoptez !</CitButton>
          </div>

          <div className="cit-script" style={{ fontSize: 22, color: 'var(--cit-navy)', marginTop: 16, textAlign: 'center', transform: 'rotate(-1deg)' }}>
            Plus que {total - idx - 1} dossiers à examiner…
          </div>
        </div>
      </div>

      <CitizenFooter left="★ CHAQUE CHOIX AFFINE VOTRE UNIVERS ★" right="→ ADOPTEZ · ← RECYCLEZ · ↑ PLUS TARD" />
    </div>
  );
}

// ---- Seed suggestions ----
const SEED_SUGGEST = [
  { name: 'Michel Foucault', cat: 'philosophie' as CategoryKey },
  { name: 'Erik Satie', cat: 'musique' as CategoryKey },
  { name: 'BioShock', cat: 'jeuvideo' as CategoryKey },
  { name: 'Tarkovski', cat: 'cinema' as CategoryKey },
  { name: 'Borges', cat: 'litterature' as CategoryKey },
  { name: 'Daft Punk', cat: 'musique' as CategoryKey },
  { name: 'Camus', cat: 'litterature' as CategoryKey },
  { name: 'Kant', cat: 'philosophie' as CategoryKey },
];

// ---- 7.3 Seed ----
function OnboardingSeed({ onNext, onSkip }: { onNext: (seeds: string[]) => void; onSkip: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (n: string) => setPicked(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n]);

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 32px 12px', zIndex: 3, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSeal size={42} />
            <div>
              <div className="cit-h1" style={{ fontSize: 22, lineHeight: 0.9 }}>AMORÇAGE<span style={{ color: 'var(--cit-brick)' }}>!</span></div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ ÉTAPE 2/3 · CONCEPTS DÉJÀ APPRIVOISÉS ★</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start', zIndex: 3, position: 'relative' }}>
        <div>
          <div className="cit-script" style={{ fontSize: 36, color: 'var(--cit-navy)', lineHeight: 0.9 }}>Avant de continuer,</div>
          <h2 className="cit-h1" style={{ fontSize: 54, lineHeight: 0.92, margin: '4px 0 12px' }}>
            QUELQUES NOMS<br />QUE VOUS AIMEZ ?
          </h2>
          <p className="cit-typed" style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--cit-navy-dk)' }}>
            Choisissez les concepts que vous savez déjà apprécier. Le Bureau s'en servira pour amorcer votre univers.
          </p>
          <div style={{ marginTop: 20 }}>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 8 }}>★ SUGGESTIONS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SEED_SUGGEST.map(s => {
                const on = picked.includes(s.name);
                const color = CATEGORIES[s.cat]?.oklch ?? 'var(--cit-navy)';
                return (
                  <button key={s.name} onClick={() => toggle(s.name)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px 8px 10px',
                    background: on ? 'var(--cit-butter)' : 'var(--cit-cream)',
                    border: '2.5px solid var(--cit-navy-dk)', borderLeft: `10px solid ${color}`,
                    fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 700,
                    letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--cit-navy-dk)',
                    cursor: 'pointer', boxShadow: on ? '3px 3px 0 var(--cit-navy-dk)' : '2px 2px 0 var(--cit-navy-dk)',
                  }}>
                    {on && <span style={{ color: 'var(--cit-brick)' }}>★</span>}
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CitPanel title={`Votre amorce · ${picked.length} concept${picked.length !== 1 ? 's' : ''}`}>
            <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginBottom: 8 }}>
              Le Bureau utilisera ces fiches comme point de départ.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {picked.map(p => (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', border: '2px solid var(--cit-navy-dk)' }}>
                  ★ {p}
                  <span style={{ color: 'var(--cit-cream)', cursor: 'pointer' }} onClick={() => toggle(p)}>✕</span>
                </span>
              ))}
              {picked.length === 0 && (
                <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                  Aucun concept ajouté. Continuez sans amorce.
                </div>
              )}
            </div>
          </CitPanel>
          <CitPanel title="Astuce du Bureau" accent="butter">
            <p className="cit-typed" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
              Ne vous censurez pas — même les goûts gênants comptent. Vous pourrez toujours retirer des concepts plus tard.
            </p>
          </CitPanel>
        </div>
      </div>

      <div style={{ padding: '0 32px 18px', display: 'flex', gap: 14, justifyContent: 'flex-end', zIndex: 3, position: 'relative' }}>
        <CitButton onClick={onSkip}>Passer cette étape</CitButton>
        <CitButton tone="brick" onClick={() => onNext(picked)}>Continuer · {picked.length} amorce(s) →</CitButton>
      </div>
      <CitizenFooter right="★ ÉTAPE OPTIONNELLE · VOUS POUVEZ TOUJOURS LA SAUTER" />
    </div>
  );
}

// ---- 7.4 Complet ----
function OnboardingComplete({ verdicts, seedConcepts, onContinue }: {
  verdicts: Array<{ conceptId: string; verdict: SwipeVerdict }>;
  seedConcepts: string[];
  onContinue: () => void;
}) {
  const adopted = verdicts.filter(v => v.verdict === 'valid').length;
  const recycled = verdicts.filter(v => v.verdict === 'reject').length;
  const later = verdicts.filter(v => v.verdict === 'skip').length;

  const nodes = [
    { x: 50, y: 40, c: 'oklch(35% 0.13 250)', s: 22, glow: true, label: 'PHILOSOPHIE' },
    { x: 28, y: 28, c: 'oklch(45% 0.20 330)', s: 14, label: 'LITTÉR.' },
    { x: 70, y: 22, c: 'oklch(55% 0.24 295)', s: 18, label: 'JEU VIDÉO' },
    { x: 22, y: 60, c: 'oklch(55% 0.22 28)', s: 12, label: 'MUSIQUE' },
    { x: 76, y: 60, c: 'oklch(65% 0.18 50)', s: 14, label: 'CINÉMA' },
    { x: 40, y: 76, c: 'oklch(42% 0.07 55)', s: 10, label: 'HISTOIRE' },
    { x: 60, y: 80, c: 'oklch(50% 0.18 155)', s: 12, label: 'SCIENCES' },
  ];

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: '30px 60px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 50, alignItems: 'center', zIndex: 3, position: 'relative' }}>
        <div>
          <div className="cit-script" style={{ fontSize: 56, color: 'var(--cit-navy)', lineHeight: 0.85 }}>Bravo,</div>
          <h1 className="cit-h1" style={{ fontSize: 72, lineHeight: 0.85, margin: '4px 0' }}>
            VOTRE UNIVERS<br />PREND FORME<span style={{ color: 'var(--cit-brick)' }}>!</span>
          </h1>
          <div className="cit-condensed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8 }}>★ AMORÇAGE TERMINÉ · ÉTAPE 3/3 ★</div>

          <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { label: 'ADOPTÉS', value: adopted, tone: 'navy' as const },
              { label: 'RECYCLÉS', value: recycled, tone: 'brick' as const },
              { label: 'SURSIS', value: later, tone: 'mustard' as const },
            ].map(stat => {
              const color = stat.tone === 'brick' ? 'var(--cit-brick)' : stat.tone === 'mustard' ? 'var(--cit-mustard)' : 'var(--cit-navy)';
              return (
                <div key={stat.label} style={{ background: 'var(--cit-cream)', border: '2.5px solid var(--cit-navy-dk)', padding: 10, boxShadow: '3px 3px 0 var(--cit-navy-dk)', textAlign: 'center' }}>
                  <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>{stat.label}</div>
                  <div className="cit-h1" style={{ fontSize: 38, lineHeight: 0.9, color, textShadow: 'none' }}>
                    {String(stat.value).padStart(2, '0')}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="cit-typed" style={{ marginTop: 22, fontSize: 15, lineHeight: 1.6, color: 'var(--cit-navy-dk)' }}>
            Le Bureau a calibré votre profil. Vous pouvez maintenant explorer librement — des centaines de dossiers vous attendent.
          </p>

          <div style={{ marginTop: 26, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={onContinue} style={{
              background: 'var(--cit-brick)', color: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)', padding: '16px 28px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 22,
              cursor: 'pointer', textTransform: 'uppercase', textShadow: '1.5px 1.5px 0 var(--cit-navy-dk)',
              boxShadow: 'inset 0 -4px 0 oklch(0% 0 0 / 0.3), 5px 5px 0 var(--cit-navy-dk)',
            }}>★ ENTRER DANS CONSTELLATION</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CitPanel title={`Votre univers naissant · ${adopted} nœuds`}>
            <div style={{ position: 'relative', height: 280, background: 'var(--cit-paper)', border: '2.5px solid var(--cit-navy-dk)' }}>
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
                {nodes.flatMap((n, i) => nodes.slice(i + 1).map((n2, j) => (
                  <line key={`${i}-${j}`} x1={`${n.x}%`} y1={`${n.y}%`} x2={`${n2.x}%`} y2={`${n2.y}%`} stroke="var(--cit-navy-dk)" strokeWidth="0.25" strokeDasharray="0.5 0.5" opacity="0.3" />
                )))}
              </svg>
              {nodes.map((n, i) => (
                <div key={i} style={{ position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%, -50%)' }}>
                  <span style={{ display: 'block', width: n.s, height: n.s, background: n.c, borderRadius: '50%', border: '2px solid var(--cit-navy-dk)', boxShadow: n.glow ? '2px 2px 0 var(--cit-navy-dk), 0 0 0 4px oklch(96% 0.02 85 / 0.7)' : '2px 2px 0 var(--cit-navy-dk)' }} />
                  <span style={{ position: 'absolute', left: n.s + 4, top: -2, fontFamily: n.glow ? "'Alfa Slab One', serif" : "'Oswald', sans-serif", fontSize: n.glow ? 10 : 9, fontWeight: 700, color: 'var(--cit-navy-dk)', whiteSpace: 'nowrap', textShadow: '1px 1px 0 var(--cit-cream)' }}>{n.label}</span>
                </div>
              ))}
            </div>
          </CitPanel>
        </div>
      </div>
      <CitizenFooter right="★ BIENVENUE DANS LE BUREAU · BONNE EXPLORATION" />
    </div>
  );
}

// ---- Wrapper principal ----
type Step = 'welcome' | 'quizz' | 'seed' | 'complete';

interface Props {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [verdicts, setVerdicts] = useState<Array<{ conceptId: string; verdict: SwipeVerdict }>>([]);
  const [seeds, setSeeds] = useState<string[]>([]);

  const handleQuizzComplete = (v: typeof verdicts) => {
    setVerdicts(v);
    setStep('seed');
  };

  const handleSeedNext = (picked: string[]) => {
    setSeeds(picked);
    setStep('complete');
  };

  const handleContinue = async () => {
    // Persist each seed as a manual concept marked favorite (high-affinity)
    for (const seedName of seeds) {
      const suggest = SEED_SUGGEST.find(s => s.name === seedName);
      const cat = suggest?.cat ?? 'personnages';
      const id = `seed-${seedName.toLowerCase().replace(/\s+/g, '-')}`;
      const concept: Concept = {
        id,
        name: seedName,
        kind: 'Concept-graine',
        cats: [[cat, 1.0]],
        blurb: 'Concept choisi à l\'amorçage de votre univers.',
        refs: [],
        sourceKind: 'random',
        sourceTag: 'amorçage',
        isManual: true,
        createdAt: new Date(),
      };
      await cacheConcept(concept);
      await recordInteraction(id, 'valid', ONBOARDING_SESSION);
      await toggleFavorite(id);
    }

    // Calcul des poids de catégories depuis les verdicts adoptés
    const catScores: Partial<Record<CategoryKey, number>> = {};
    // Pas encore d'accès aux concepts ici pour faire le calcul complet ;
    // le score réel est calculable à la volée depuis getAdoptedConcepts.

    await saveProfile({
      onboardingDone: true,
      onboardingVerdicts: verdicts,
      seedConcepts: seeds,
      categoryWeights: catScores,
    });
    onComplete();
  };

  if (step === 'welcome') return <OnboardingWelcome onStart={() => setStep('quizz')} onSkip={handleContinue} />;
  if (step === 'quizz')   return <OnboardingQuizz onComplete={handleQuizzComplete} />;
  if (step === 'seed')    return <OnboardingSeed onNext={handleSeedNext} onSkip={() => setStep('complete')} />;
  if (step === 'complete') return <OnboardingComplete verdicts={verdicts} seedConcepts={seeds} onContinue={handleContinue} />;
  return null;
}
