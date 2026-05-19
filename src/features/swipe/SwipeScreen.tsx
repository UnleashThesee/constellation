import { useState, useEffect } from 'react';
import { useSwipeDeck } from './useSwipeDeck';
import { Sunburst, Stamp, StarBurst } from '../../components/ui/atoms';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { CATEGORIES, gradientForWeights } from '../../lib/categories';
import { fetchRandomConcepts } from '../../services/wikidata';
import type { Concept, SwipeMode, CategoryKey } from '../../types';

const FALLBACK_CONCEPTS: Concept[] = [
  {
    id: 'foucault', name: 'Michel Foucault', years: '1926 — 1984', kind: 'Auteur',
    cats: [['philosophie', 0.7], ['histoire', 0.3]],
    blurb: 'Archéologue des savoirs. Démonte les régimes de vérité, les dispositifs de pouvoir et la fabrique du sujet moderne.',
    refs: ['Surveiller et punir', "L'Archéologie du savoir"], rec: 'REC-0042', sourceKind: 'random',
  },
  {
    id: 'darkSouls', name: 'Dark Souls', years: '2011', kind: 'Œuvre',
    cats: [['jeuvideo', 0.7], ['arts', 0.15], ['litterature', 0.15]],
    blurb: 'Action-RPG cryptique. Récit fragmentaire transmis par l\'objet et l\'architecture. Mort comme mécanique narrative.',
    refs: ['From Software', 'Hidetaka Miyazaki'], rec: 'REC-0043', sourceKind: 'random',
  },
  {
    id: 'annales', name: 'École des Annales', years: '1929 — ····', kind: 'Courant',
    cats: [['histoire', 0.55], ['humaines', 0.3], ['geographie', 0.15]],
    blurb: 'Bloch, Febvre, Braudel : refus du récit événementiel. Histoire longue, sérielle, totale.',
    refs: ['Marc Bloch', 'Fernand Braudel'], rec: 'REC-0044', sourceKind: 'random',
  },
  {
    id: 'satie', name: 'Erik Satie', years: '1866 — 1925', kind: 'Personnage',
    cats: [['musique', 0.6], ['personnages', 0.25], ['arts', 0.15]],
    blurb: 'Pianiste cabaret, mystique du dépouillement. Gymnopédies et Vexations — précurseur du minimalisme et de la musique ambiante.',
    refs: ['Gymnopédies', 'Vexations'], rec: 'REC-0045', sourceKind: 'random',
  },
  {
    id: 'borges', name: 'Jorge Luis Borges', years: '1899 — 1986', kind: 'Auteur',
    cats: [['litterature', 0.75], ['philosophie', 0.25]],
    blurb: 'Labyrinthes, bibliothèques infinies, miroirs. Chaque récit est une métaphysique travestie en conte fantastique.',
    refs: ['Fictions', 'L\'Aleph'], rec: 'REC-0046', sourceKind: 'random',
  },
];

const MODES: Array<{ id: SwipeMode; label: string }> = [
  { id: 'random',   label: 'Aléatoire' },
  { id: 'themed',   label: 'Thématique' },
  { id: 'explore',  label: 'Exploration' },
  { id: 'contrast', label: 'Contraste' },
  { id: 'cross',    label: 'Croisement' },
];

const SOURCE_LABELS: Record<string, string> = {
  linked: 'Lié à votre univers',
  random: 'Sélection aléatoire',
  explore: 'Exploration',
  contrast: 'Contraste',
  cross: 'Croisement',
};

function CitIconReject() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"><path d="M5 5L19 19M19 5L5 19"/></svg>;
}
function CitIconValid() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"><path d="M4 12L10 18L20 6"/></svg>;
}
function CitIconSkip() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"><path d="M5 12H19M14 7L19 12L14 17"/></svg>;
}
function CitIconBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"><path d="M9 6L3 12L9 18M3 12H17C19 12 21 14 21 16V18"/></svg>;
}

function CitCat({ catKey, weight }: { catKey: CategoryKey; weight?: number }) {
  const c = CATEGORIES[catKey];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: "'Oswald', sans-serif",
      fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600,
      padding: '3px 9px',
      background: 'var(--cit-cream)',
      border: '2px solid var(--cit-navy-dk)',
      color: 'var(--cit-navy-dk)',
    }}>
      <span style={{ width: 9, height: 9, background: c.oklch, border: '1.5px solid var(--cit-navy-dk)', display: 'inline-block' }}/>
      {c.label}
      {weight !== undefined && <span style={{ color: 'var(--cit-brick)' }}>{Math.round(weight * 100)}%</span>}
    </span>
  );
}

function CitizenCard({ concept, tilt, dragOffset, animClass, onPointerDown }: {
  concept: Concept;
  tilt: 'right' | 'left' | 'up' | null;
  dragOffset: { x: number; y: number };
  animClass: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const isDragging = dragOffset.x !== 0 || dragOffset.y !== 0;
  const rotate = isDragging ? `rotate(${dragOffset.x * 0.04 - 0.6}deg)` : 'rotate(-0.6deg)';
  const translate = isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : '';

  const portraitIsUrl = concept.portrait?.startsWith('http');
  const portraitWords = concept.portrait && !portraitIsUrl
    ? concept.portrait.split(' ')
    : concept.name.split(' ');

  return (
    <div
      className={animClass || ''}
      style={{
        position: 'relative',
        transform: `${translate} ${rotate}`.trim(),
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'transform .25s cubic-bezier(.2,.7,.3,1)',
      }}
      onPointerDown={onPointerDown}
    >
      <div className="cit-card" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
        {/* Verdict overlays */}
        {tilt === 'left' && (
          <div style={{ position: 'absolute', top: 80, left: 36, zIndex: 5, pointerEvents: 'none', transform: 'rotate(-12deg)' }}>
            <Stamp tone="brick" size={36}>Retour à l'expéditeur</Stamp>
          </div>
        )}
        {tilt === 'right' && (
          <div style={{ position: 'absolute', top: 80, right: 36, zIndex: 5, pointerEvents: 'none', transform: 'rotate(11deg)' }}>
            <Stamp tone="navy" size={36}>Bienvenue !</Stamp>
          </div>
        )}
        {tilt === 'up' && (
          <div style={{ position: 'absolute', top: '32%', left: '50%', transform: 'translate(-50%,-50%) rotate(-3deg)', zIndex: 5, pointerEvents: 'none' }}>
            <Stamp tone="mustard" size={32}>En attente</Stamp>
          </div>
        )}

        {/* Navy header bar */}
        <div style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
          padding: '16px 28px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 18, position: 'relative',
          borderBottom: '3px solid var(--cit-navy-dk)',
        }}>
          <div className="cit-halftone" style={{ position: 'absolute', inset: 0 }}/>
          <div style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0 }}>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
              ★ FICHE N° {concept.rec ?? 'REC-0001'} · {SOURCE_LABELS[concept.sourceKind ?? 'random'] ?? 'Sélection aléatoire'} ★
            </div>
            <h2 className="cit-h1 cit-h1--reverse" style={{ margin: '2px 0 2px', fontSize: 48, lineHeight: 0.92, wordBreak: 'break-word' }}>
              {concept.name}<span style={{ color: 'var(--cit-butter)' }}>!</span>
            </h2>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-cream)' }}>
              {concept.kind}{concept.years ? ` · ${concept.years}` : ''}
            </div>
          </div>
          <Sunburst size={88} color="var(--cit-butter)" behindColor="var(--cit-brick)"/>
        </div>

        {/* Body 2-col */}
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20, padding: '18px 24px 14px' }}>
          {/* Portrait */}
          <div>
            <div style={{
              position: 'relative',
              border: '3px solid var(--cit-navy-dk)',
              background: 'var(--cit-butter)',
              aspectRatio: '3/4',
              boxShadow: '4px 4px 0 var(--cit-navy-dk)',
              overflow: 'hidden',
            }}>
              {portraitIsUrl ? (
                <img src={concept.portrait} alt={concept.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              ) : (
                <>
                  <div style={{
                    position: 'absolute', inset: '10% 10% 26% 10%',
                    background: 'var(--cit-brick)', borderRadius: '50%',
                    border: '3px solid var(--cit-navy-dk)',
                  }}/>
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', fontFamily: "'Alfa Slab One', serif",
                    fontSize: 16, lineHeight: 1, color: 'var(--cit-cream)',
                    letterSpacing: '.02em', textShadow: '2px 2px 0 var(--cit-navy-dk)',
                    padding: 10, zIndex: 1,
                  }}>
                    {portraitWords.map((w, i) => <div key={i}>{w}</div>)}
                  </div>
                </>
              )}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 12,
                padding: '3px 8px', textAlign: 'center',
                letterSpacing: '.06em', borderTop: '2px solid var(--cit-butter)',
              }}>
                {concept.years ?? '—'}
              </div>
            </div>

            {/* Chromatic signature */}
            <div style={{ marginTop: 10 }}>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>
                Empreinte
              </div>
              <div style={{
                height: 10,
                background: gradientForWeights(concept.cats),
                border: '2px solid var(--cit-navy-dk)',
                boxShadow: '2px 2px 0 var(--cit-navy-dk)',
              }}/>
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="cit-typed" style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.65, color: 'var(--cit-navy-dk)' }}>
              {concept.blurb}
            </p>

            {concept.refs.length > 0 && (
              <>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
                  ★ Voir aussi
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {concept.refs.map((r, i) => (
                    <span key={i} className="cit-condensed" style={{
                      fontSize: 11, padding: '3px 9px',
                      background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', fontWeight: 600,
                    }}>{r}</span>
                  ))}
                </div>
              </>
            )}

            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
              ★ Catégories
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {concept.cats.map(([k, w]) => <CitCat key={k} catKey={k} weight={w}/>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CitizenActions({ onAction }: { onAction: (v: 'reject' | 'skip' | 'valid' | 'back') => void }) {
  const items = [
    { key: 'reject' as const, label: 'Recyclez !', tone: 'brick'  as const, icon: <CitIconReject/>, kbd: '←' },
    { key: 'skip'   as const, label: 'Plus tard',  tone: undefined,          icon: <CitIconSkip/>,   kbd: '↑' },
    { key: 'valid'  as const, label: 'Adoptez !',  tone: 'butter' as const,  icon: <CitIconValid/>,  kbd: '→' },
    { key: 'back'   as const, label: 'Annulez',    tone: 'navy'   as const,  icon: <CitIconBack/>,   kbd: '⌫' },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {items.map(it => (
        <CitButton key={it.key} tone={it.tone} icon={it.icon} kbd={it.kbd} onClick={() => onAction(it.key)} style={{ minWidth: 140 }}>
          {it.label}
        </CitButton>
      ))}
    </div>
  );
}

function ModeBar({ mode, setMode, queueSize }: { mode: SwipeMode; setMode: (m: SwipeMode) => void; queueSize: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 32px',
      background: 'var(--cit-paper-dk)',
      borderBottom: '2px solid var(--cit-navy-dk)',
    }}>
      <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', whiteSpace: 'nowrap' }}>
        ★ Procédure ›
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            background: m.id === mode ? 'var(--cit-navy-dk)' : 'transparent',
            color: m.id === mode ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
            border: '2px solid var(--cit-navy-dk)',
            padding: '4px 12px',
            fontFamily: "'Oswald', sans-serif",
            fontSize: 12, letterSpacing: '.12em', fontWeight: 600, textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: m.id === mode ? '2px 2px 0 var(--cit-brick)' : 'none',
          }}>{m.label}</button>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>
        FILE : <span style={{ color: 'var(--cit-brick)', fontWeight: 700 }}>{queueSize}</span>
      </span>
    </div>
  );
}

function ScorePanel({ counts }: { counts: { valid: number; reject: number; skip: number; favs: number } }) {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
  const rows: Array<[string, number, string]> = [
    ['Adoptés',  counts.valid,  'var(--cit-navy)'],
    ['Recyclés', counts.reject, 'var(--cit-brick)'],
    ['Plus tard', counts.skip,  'var(--cit-navy-lt)'],
    ['Favoris',  counts.favs,   'var(--cit-rust)'],
  ];
  return (
    <CitPanel title={<span>Bilan du jour <span style={{ fontFamily: "'Yellowtail', cursive", fontSize: 15, marginLeft: 6 }}>· {today}</span></span>}>
      {rows.map(([k, v, c]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '3px 0', borderBottom: '1.5px dashed var(--cit-navy-dk)',
        }}>
          <span className="cit-condensed" style={{ fontSize: 12, fontWeight: 600 }}>{k}</span>
          <span className="cit-h1" style={{ fontSize: 22, color: c, textShadow: 'none' }}>
            {String(v).padStart(2, '0')}
          </span>
        </div>
      ))}
    </CitPanel>
  );
}

function RegistrePanel({ history }: { history: Array<{ name: string; verdict: string; t: string }> }) {
  return (
    <CitPanel title="Registre récent">
      {history.length === 0 ? (
        <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
          Aucune interaction encore…
        </div>
      ) : (
        history.slice(0, 7).map((h, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '18px 1fr 40px',
            gap: 4, alignItems: 'baseline',
            fontFamily: "'Special Elite', monospace", fontSize: 11.5,
            padding: '2px 0',
            borderBottom: i < Math.min(history.length, 7) - 1 ? '1px dotted var(--cit-navy-dk)' : 'none',
          }}>
            <span style={{
              textAlign: 'center',
              color: h.verdict === 'valid' ? 'var(--cit-navy)' : h.verdict === 'reject' ? 'var(--cit-brick)' : 'var(--cit-navy-lt)',
              fontWeight: 700, fontFamily: "'Alfa Slab One', serif",
            }}>
              {h.verdict === 'valid' ? '✓' : h.verdict === 'reject' ? '✗' : '~'}
            </span>
            <span style={{ color: 'var(--cit-navy-dk)' }}>{h.name}</span>
            <span style={{ color: 'var(--cit-navy-lt)', fontSize: 9.5, textAlign: 'right' }}>{h.t}</span>
          </div>
        ))
      )}
    </CitPanel>
  );
}

export function SwipeScreen({ onTabChange }: { onTabChange?: (id: string) => void }) {
  const [mode, setMode] = useState<SwipeMode>('random');
  const [loading, setLoading] = useState(true);

  const swipe = useSwipeDeck(FALLBACK_CONCEPTS);

  useEffect(() => {
    fetchRandomConcepts(10)
      .then(concepts => { if (concepts.length > 0) swipe.setDeck(concepts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const current = swipe.current;

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Bonjour,"
        title="CITOYEN"
        active="swipe"
        onTabChange={onTabChange}
        right={<Sunburst size={68} color="var(--cit-mustard)"/>}
      />

      <ModeBar mode={mode} setMode={setMode} queueSize={swipe.deck.length}/>

      <div style={{
        flex: 1, padding: '20px 32px',
        display: 'grid', gridTemplateColumns: '220px 1fr 220px',
        gap: 22, alignItems: 'start',
        overflow: 'auto',
      }}>
        {/* Left panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ScorePanel counts={swipe.counts}/>
          <CitPanel title="Alerte bulle" accent="butter">
            <p className="cit-typed" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
              Mode <strong>EXPLORATION</strong> activé. Découvrez des concepts hors de vos sentiers habituels.
            </p>
          </CitPanel>
        </div>

        {/* Card column */}
        <div>
          <div style={{ position: 'relative' }}>
            {loading && !current ? (
              <div style={{
                height: 500, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 16,
                border: '3px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                boxShadow: '5px 5px 0 var(--cit-navy-dk)',
              }}>
                <div className="cit-h1" style={{ fontSize: 28, color: 'var(--cit-navy-dk)' }}>Chargement…</div>
                <div className="cit-condensed" style={{ fontSize: 11 }}>INTERROGATION DE WIKIDATA</div>
              </div>
            ) : current ? (
              <CitizenCard
                concept={current}
                tilt={swipe.tilt}
                dragOffset={swipe.drag}
                animClass={swipe.animClass}
                onPointerDown={swipe.onPointerDown}
              />
            ) : null}

            {/* Peeking stack shadows */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: -1,
              transform: 'translate(10px, 14px) rotate(1.2deg)',
              background: 'var(--cit-paper-dk)',
              border: '2.5px solid var(--cit-navy-dk)',
              pointerEvents: 'none',
            }}/>
            <div style={{
              position: 'absolute', inset: 0, zIndex: -2,
              transform: 'translate(20px, 26px) rotate(-1.8deg)',
              background: 'var(--cit-cream)',
              border: '2.5px solid var(--cit-navy-dk)',
              pointerEvents: 'none',
            }}/>
          </div>

          <div style={{ marginTop: 20 }}>
            <CitizenActions onAction={(v) => v === 'back' ? swipe.back() : swipe.cycle(v)}/>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <RegistrePanel history={swipe.history}/>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <StarBurst size={120} rotate={-8}>NOUVELLE<br/>FICHE<br/>EXAMINÉE</StarBurst>
          </div>
        </div>
      </div>

      <CitizenFooter right="GLISSEZ → ADOPTEZ · ← RECYCLEZ · ↑ PLUS TARD"/>
    </div>
  );
}
