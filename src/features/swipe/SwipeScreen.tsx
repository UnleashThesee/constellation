import { useState, useEffect, useMemo } from 'react';
import { useSwipeDeck } from './useSwipeDeck';
import { Sunburst, Stamp, StarBurst, PixelDie, Aster } from '../../components/ui/atoms';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { ConceptDetailModal } from '../../components/ui/ConceptDetailModal';
import { CATEGORIES, CATEGORY_LIST, gradientForWeights, conceptDominant, combinationMix } from '../../lib/categories';
import { fetchRandomConcepts, fetchNeighborConcepts, fetchCommonNeighborConcepts } from '../../services/wikidata';
import { getAdoptedConcepts, getExcludedConceptIds, cacheConcept, toggleFavorite, getCachedConcept, getSettings, saveSettings, db } from '../../stores/db';
import { useToast } from '../../lib/toast';
import { playSound } from '../../lib/sounds';
import { consumePendingSwipeDeck } from '../../lib/pending';
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
  { id: 'free',     label: 'Libre' },
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

function CitizenCard({ concept, tilt, dragOffset, animClass, onPointerDown, sourceOverride, badge, leftBorder, contrast, isFavorite, onToggleFavorite }: {
  concept: Concept;
  tilt: 'right' | 'left' | 'up' | null;
  dragOffset: { x: number; y: number };
  animClass: string;
  onPointerDown: (e: React.PointerEvent) => void;
  sourceOverride?: string;
  badge?: React.ReactNode;
  leftBorder?: string;
  contrast?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
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
      {contrast && (
        <span className="cit-pulse-brick" style={{
          position: 'absolute', inset: -16, zIndex: 10, pointerEvents: 'none',
          border: '3px dashed var(--cit-brick)',
        }}/>
      )}
      {contrast && (
        <div style={{ position: 'absolute', top: -28, left: 18, zIndex: 11, transform: 'rotate(-4deg)', pointerEvents: 'none' }}>
          <Stamp tone="brick">★ LOIN DE VOTRE UNIVERS ★</Stamp>
        </div>
      )}
      <div className="cit-card" style={{
        padding: 0, position: 'relative', overflow: 'hidden',
        borderLeft: leftBorder ? `14px solid ${leftBorder}` : undefined,
      }}>
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
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {badge}
              <span>★ FICHE N° {concept.rec ?? 'REC-0001'} · {sourceOverride ?? SOURCE_LABELS[concept.sourceKind ?? 'random'] ?? 'Sélection aléatoire'} ★</span>
            </div>
            <h2 className="cit-h1 cit-h1--reverse" style={{ margin: '2px 0 2px', fontSize: 48, lineHeight: 0.92, wordBreak: 'break-word' }}>
              {concept.name}<span style={{ color: 'var(--cit-butter)' }}>!</span>
            </h2>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-cream)' }}>
              {concept.kind}{concept.years ? ` · ${concept.years}` : ''}
            </div>
          </div>
          <Sunburst size={88} color="var(--cit-butter)" behindColor="var(--cit-brick)"/>
          {onToggleFavorite && (
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} onPointerDown={e => e.stopPropagation()} style={{
              position: 'absolute', top: 6, right: 6, zIndex: 6,
              background: isFavorite ? 'var(--cit-butter)' : 'transparent',
              color: isFavorite ? 'var(--cit-navy-dk)' : 'var(--cit-butter)',
              border: '2px solid var(--cit-butter)',
              fontFamily: "'Alfa Slab One', serif", fontSize: 18,
              padding: '2px 10px', cursor: 'pointer',
              boxShadow: isFavorite ? '2px 2px 0 var(--cit-navy-dk)' : 'none',
            }} title={isFavorite ? 'Retirer favori' : 'Marquer favori'}>★</button>
          )}
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
                <img src={concept.portrait} alt={concept.name} loading="lazy"
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
  const isContrast = mode === 'contrast';
  const bg = isContrast ? 'var(--cit-brick)' : 'var(--cit-paper-dk)';
  const labelColor = isContrast ? 'var(--cit-cream)' : 'var(--cit-navy-dk)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 32px',
      background: bg,
      borderBottom: isContrast ? '3px solid var(--cit-navy-dk)' : '2px solid var(--cit-navy-dk)',
    }}>
      <span className="cit-condensed" style={{ fontSize: 11, color: labelColor, whiteSpace: 'nowrap' }}>
        ★ Procédure ›
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {MODES.map(m => {
          const on = m.id === mode;
          const activeBg = isContrast ? 'var(--cit-cream)' : 'var(--cit-navy-dk)';
          const activeFg = isContrast ? 'var(--cit-brick)' : 'var(--cit-butter)';
          const idleFg = isContrast ? 'var(--cit-butter)' : 'var(--cit-navy-dk)';
          const idleBorder = isContrast ? 'oklch(0% 0 0 / 0.4)' : 'var(--cit-navy-dk)';
          return (
            <button key={m.id} onClick={() => { playSound('modeChange'); setMode(m.id); }} style={{
              background: on ? activeBg : 'transparent',
              color: on ? activeFg : idleFg,
              border: `2px solid ${on ? activeBg : idleBorder}`,
              padding: '4px 12px',
              fontFamily: "'Oswald', sans-serif",
              fontSize: 12, letterSpacing: '.12em', fontWeight: 600, textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: on ? (isContrast ? '2px 2px 0 var(--cit-navy-dk)' : '2px 2px 0 var(--cit-brick)') : 'none',
            }}>{m.label}</button>
          );
        })}
      </div>
      <div style={{ flex: 1 }}/>
      {isContrast ? (
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
          ★ FISSURATION DE BULLE EN COURS ★
        </span>
      ) : (
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>
          FILE : <span style={{ color: 'var(--cit-brick)', fontWeight: 700 }}>{queueSize}</span>
        </span>
      )}
    </div>
  );
}

// ---- Mode-specific secondary banners ----

function ThematicBanner({ active, toggle, count }: {
  active: Record<string, boolean>; toggle: (k: CategoryKey) => void; count: number;
}) {
  return (
    <div style={{
      padding: '10px 32px',
      background: 'var(--cit-butter)',
      borderBottom: '3px solid var(--cit-navy-dk)',
      boxShadow: 'inset 0 4px 0 oklch(0% 0 0 / 0.08)',
      position: 'relative', zIndex: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Aster size={26}/>
        <span className="cit-h1" style={{ fontSize: 20, lineHeight: 0.9 }}>
          QUELLES CATÉGORIES VOULEZ-VOUS EXAMINER AUJOURD'HUI ?
        </span>
        <div style={{ flex: 1 }}/>
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>
          {count} ACTIVE{count > 1 ? 'S' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CATEGORY_LIST.map(c => {
          const on = !!active[c.key];
          return (
            <button key={c.key} onClick={() => toggle(c.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px 4px 4px',
              background: on ? 'var(--cit-cream)' : 'transparent',
              border: '2.5px solid var(--cit-navy-dk)',
              borderLeft: `8px solid ${c.oklch}`,
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
              letterSpacing: '.10em', textTransform: 'uppercase',
              color: 'var(--cit-navy-dk)', cursor: 'pointer',
              boxShadow: on ? '2px 2px 0 var(--cit-navy-dk)' : 'none',
              opacity: on ? 1 : 0.55,
            }}>
              {on && <span style={{ color: 'var(--cit-brick)' }}>✓</span>}
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CrossBanner({ selection, byId, mixCss }: {
  selection: Array<{ id: string; weight: number }>;
  byId: Record<string, Concept>;
  mixCss: string;
}) {
  return (
    <div style={{
      padding: '10px 32px',
      background: 'var(--cit-cream)',
      borderBottom: '3px solid var(--cit-navy-dk)',
      display: 'flex', alignItems: 'center', gap: 14,
      position: 'relative', zIndex: 3, flexWrap: 'wrap',
    }}>
      <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', whiteSpace: 'nowrap' }}>★ Croisement ›</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {selection.length === 0 ? (
          <span className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
            Aucun concept sélectionné — adoptez d'abord puis revenez ici.
          </span>
        ) : selection.map(s => {
          const c = byId[s.id];
          if (!c) return null;
          const color = conceptDominant(c.cats).css;
          return (
            <span key={s.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px 3px 3px',
              background: 'var(--cit-cream)',
              border: '2px solid var(--cit-navy-dk)',
              borderLeft: `8px solid ${color}`,
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
              letterSpacing: '.06em', color: 'var(--cit-navy-dk)',
            }}>{c.name}<span style={{ color: 'var(--cit-brick)' }}>{s.weight}%</span></span>
          );
        })}
      </div>
      <div style={{ flex: 1 }}/>
      <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>RÉSULTANTE ›</span>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: mixCss, border: '2.5px solid var(--cit-navy-dk)',
        boxShadow: '2px 2px 0 var(--cit-navy-dk)',
      }}/>
    </div>
  );
}

function ExplorationAnchorPanel({ anchor }: { anchor: Concept | null }) {
  if (!anchor) {
    return (
      <CitPanel title="Concept de référence">
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 6 }}>
          ★ POINT D'ANCRAGE
        </div>
        <p className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
          Adoptez d'abord un concept pour qu'il serve d'ancrage à l'exploration.
        </p>
      </CitPanel>
    );
  }
  const color = conceptDominant(anchor.cats).css;
  const short = anchor.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return (
    <CitPanel title="Concept de référence">
      <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 6 }}>
        ★ POINT D'ANCRAGE DE L'EXPLORATION
      </div>
      <div style={{
        padding: '8px 12px',
        background: 'var(--cit-butter)',
        border: '2.5px solid var(--cit-navy-dk)',
        borderLeft: `12px solid ${color}`,
        boxShadow: '3px 3px 0 var(--cit-navy-dk)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          width: 36, height: 36, borderRadius: '50%',
          background: color,
          border: '2px solid var(--cit-navy-dk)',
          display: 'grid', placeItems: 'center',
          fontFamily: "'Alfa Slab One', serif", fontSize: 12, color: 'var(--cit-cream)',
          textShadow: '1px 1px 0 var(--cit-navy-dk)',
        }}>{short}</span>
        <div style={{ minWidth: 0 }}>
          <div className="cit-h1" style={{ fontSize: 16, lineHeight: 0.95 }}>{anchor.name}</div>
          <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ Adopté</div>
        </div>
      </div>
      <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', lineHeight: 1.5, marginTop: 10 }}>
        Le Bureau cherche des concepts qui éclairent <strong style={{ color: 'var(--cit-brick)' }}>{anchor.name}</strong> par voisinage sémantique.
      </div>
      <CitButton size="sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>
        ↻ Changer d'ancrage
      </CitButton>
    </CitPanel>
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

const FOOTERS: Record<SwipeMode, string> = {
  random:   'MODE ALÉATOIRE · LE BUREAU LANCE LES DÉS POUR VOUS',
  themed:   'MODE THÉMATIQUE · LE BUREAU TIRE DANS VOS CATÉGORIES',
  explore:  'MODE EXPLORATION · LE BUREAU TIRE DEPUIS UN CONCEPT-PIVOT',
  contrast: 'MODE CONTRASTE · LE BUREAU CHERCHE CE QUI VOUS DÉRANGE',
  cross:    'MODE CROISEMENT · LE BUREAU TIRE DES FICHES À L\'INTERSECTION',
  free:     'MODE LIBRE · LE BUREAU SUIT VOS CURSEURS D\'ALGORITHME',
};

/** Tire une source selon les proportions des curseurs algo (exploration/aléatoire/contraste/trending). */
function pickSourceFromWeights(weights?: { explore: number; random: number; contrast: number; trending: number }): SwipeMode {
  const w = weights ?? { explore: 35, random: 30, contrast: 20, trending: 15 };
  // Trending est désactivé en mono-user → on le redistribue sur Aléatoire
  const explore = w.explore;
  const random = w.random + w.trending;
  const contrast = w.contrast;
  const total = explore + random + contrast;
  if (total <= 0) return 'random';
  const r = Math.random() * total;
  if (r < explore) return 'explore';
  if (r < explore + random) return 'random';
  return 'contrast';
}

export function SwipeScreen({ onTabChange }: { onTabChange?: (id: string) => void }) {
  const [mode, setMode] = useState<SwipeMode>('random');
  const [loading, setLoading] = useState(true);
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [thematicCats, setThematicCats] = useState<Record<string, boolean>>(
    { philosophie: true, sciences: false, humaines: false, economie: false,
      litterature: true, arts: false, musique: false, cinema: false,
      jeuvideo: false, histoire: false, geographie: false, personnages: false }
  );
  const [explorationAnchorId, setExplorationAnchorId] = useState<string | null>(null);

  const swipe = useSwipeDeck(FALLBACK_CONCEPTS, () => setDetailOpen(true));
  const [rawDeck, setRawDeck] = useState<Concept[]>([]);
  const [currentFavorite, setCurrentFavorite] = useState(false);
  const [boostLabel, setBoostLabel] = useState<string | null>(null);
  const [boostInitial, setBoostInitial] = useState(0);
  const [freeSource, setFreeSource] = useState<SwipeMode>('random');
  const [algoWeights, setAlgoWeights] = useState<{ explore: number; random: number; contrast: number; trending: number } | undefined>(undefined);
  const [showHints, setShowHints] = useState(false);
  const [todayCounts, setTodayCounts] = useState({ valid: 0, reject: 0, skip: 0, favs: 0 });
  const toast = useToast();

  // Bilan du jour : compteurs depuis minuit local (refresh à chaque verdict)
  const refreshTodayCounts = async () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const ints = await db.interactions.toArray();
    const todayInts = ints.filter(i => +i.timestamp >= midnight);
    const favs = (await db.concepts.filter(c => c.isFavorite === true).count()) ?? 0;
    setTodayCounts({
      valid:  todayInts.filter(i => i.verdict === 'valid').length,
      reject: todayInts.filter(i => i.verdict === 'reject').length,
      skip:   todayInts.filter(i => i.verdict === 'skip').length,
      favs,
    });
  };
  useEffect(() => { refreshTodayCounts(); }, [swipe.counts, currentFavorite]);

  // Alerte bulle contextuelle : palier ou saturation catégorie
  const contextualAlert = (() => {
    const totalAdopted = adopted.length;
    if (totalAdopted >= 200 && totalAdopted < 210) return { tone: 'milestone' as const, text: `★ Palier atteint : ${totalAdopted} concepts adoptés !` };
    if (totalAdopted >= 100 && totalAdopted < 110) return { tone: 'milestone' as const, text: `★ Cap des 100 concepts franchi !` };
    if (totalAdopted >= 50 && totalAdopted < 55) return { tone: 'milestone' as const, text: `★ Cap des 50 concepts. Pensez au Boost.` };
    // Détection saturation : la cat dominante > 50% des cats adoptées
    if (adopted.length >= 10) {
      const catCount: Record<string, number> = {};
      adopted.forEach(c => c.cats.forEach(([k, w]) => { catCount[k] = (catCount[k] ?? 0) + w; }));
      const total = Object.values(catCount).reduce((s, v) => s + v, 0);
      const [topKey, topVal] = (Object.entries(catCount).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]) as [string, number];
      if (total > 0 && topVal / total > 0.5) {
        return {
          tone: 'saturation' as const,
          text: `Saturation ${CATEGORIES[topKey as CategoryKey]?.label ?? topKey} ${Math.round((topVal / total) * 100)}%. Essayez le mode Contraste.`,
        };
      }
    }
    return null;
  })();

  // First-use hint
  useEffect(() => {
    getSettings().then(s => {
      if (!s?.hintsSeen?.swipe) setShowHints(true);
    });
  }, []);

  const dismissHints = async () => {
    setShowHints(false);
    const s = await getSettings();
    await saveSettings({ hintsSeen: { ...(s?.hintsSeen ?? {}), swipe: true } });
  };

  // Load algo weights once (for 'free' mode)
  useEffect(() => {
    getSettings().then(s => {
      if (s?.algorithmWeights) setAlgoWeights(s.algorithmWeights);
    });
  }, []);

  // En mode 'free', re-pick la source à chaque changement de carte courante
  const currentCardId = swipe.current?.id;
  useEffect(() => {
    if (mode === 'free') setFreeSource(pickSourceFromWeights(algoWeights));
  }, [mode, algoWeights, currentCardId]);

  // Initial big pool fetch — consomme un éventuel boost-deck en priorité
  useEffect(() => {
    (async () => {
      try {
        // Boost mode : si une série a été préparée, l'utiliser comme deck initial
        const boostPending = consumePendingSwipeDeck();
        if (boostPending && boostPending.deck.length > 0) {
          await Promise.all(boostPending.deck.map(c => cacheConcept(c)));
          setRawDeck(boostPending.deck);
          setBoostLabel(boostPending.label);
          setBoostInitial(boostPending.deck.length);
          setLoading(false);
          return;
        }
        const [concepts, excluded] = await Promise.all([
          fetchRandomConcepts(40),
          getExcludedConceptIds(),
        ]);
        const filtered = concepts.filter(c => !excluded.has(c.id));
        const pool = filtered.length > 0 ? filtered : concepts;
        await Promise.all(pool.map(c => cacheConcept(c)));
        setRawDeck(pool);
      } catch { /* keep fallback */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    getAdoptedConcepts().then(c => {
      setAdopted(c);
      if (c.length > 0 && !explorationAnchorId) setExplorationAnchorId(c[0].id);
    });
  }, []);

  // Mode-driven deck filtering : the visible deck changes when the user
  // toggles modes / categories / anchors.
  const activeThematicCatKeys = (Object.entries(thematicCats).filter(([, on]) => on).map(([k]) => k)) as CategoryKey[];
  useEffect(() => {
    if (rawDeck.length === 0) return;
    let deck: Concept[] = rawDeck;

    switch (mode) {
      case 'themed': {
        if (activeThematicCatKeys.length === 0) { deck = rawDeck; break; }
        const matched = rawDeck.filter(c => c.cats.some(([k]) => activeThematicCatKeys.includes(k as CategoryKey)));
        deck = matched.length > 0 ? matched : rawDeck;
        break;
      }
      case 'explore': {
        // anchor's categories drive the filter
        const anchorConcept = adopted.find(c => c.id === explorationAnchorId);
        if (!anchorConcept) { deck = rawDeck; break; }
        const anchorCats = new Set(anchorConcept.cats.map(([k]) => k));
        const matched = rawDeck.filter(c => c.cats.some(([k]) => anchorCats.has(k)));
        deck = matched.length > 0 ? matched : rawDeck;
        break;
      }
      case 'contrast': {
        // concepts that share NO categories with user's adopted ones
        if (adopted.length === 0) { deck = rawDeck; break; }
        const userCats = new Set<string>();
        adopted.forEach(c => c.cats.forEach(([k]) => userCats.add(k)));
        const matched = rawDeck.filter(c => !c.cats.some(([k]) => userCats.has(k)));
        deck = matched.length > 0 ? matched : rawDeck;
        break;
      }
      case 'cross': {
        // concepts that share categories with ALL 3 most-recent adopted
        const top = adopted.slice(0, 3);
        if (top.length < 2) { deck = rawDeck; break; }
        const topCatSets = top.map(c => new Set(c.cats.map(([k]) => k)));
        const matched = rawDeck.filter(c =>
          c.cats.some(([k]) => topCatSets.every(cats => cats.has(k)))
        );
        deck = matched.length > 0 ? matched : rawDeck;
        break;
      }
      case 'free':
        // Le mode libre = mix de plusieurs sources selon les curseurs
        deck = rawDeck;
        break;
      case 'random':
      default:
        deck = rawDeck;
    }
    swipe.setDeck(deck);
  }, [mode, activeThematicCatKeys.join(','), explorationAnchorId, rawDeck.length, adopted.length]);

  // #11 — Couche Wikidata réelle pour Exploration & Croisement : on remplace
  // le deck filtré client-side par de vrais voisins sémantiques (P31/P279/…)
  // dès qu'ils arrivent. Fallback silencieux sur le filtre client-side si vide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === 'explore') {
          const anchorConcept = adopted.find(c => c.id === explorationAnchorId);
          const qid = anchorConcept?.wikidataId;
          if (!qid) return;
          const [neighbors, excluded] = await Promise.all([
            fetchNeighborConcepts([qid], 25),
            getExcludedConceptIds(),
          ]);
          const fresh = neighbors.filter(c => !excluded.has(c.id));
          if (!cancelled && fresh.length >= 3) {
            await Promise.all(fresh.map(c => cacheConcept(c)));
            swipe.setDeck(fresh);
          }
        } else if (mode === 'cross') {
          const qids = adopted.slice(0, 4).map(c => c.wikidataId).filter((q): q is string => !!q);
          if (qids.length < 2) return;
          const [common, excluded] = await Promise.all([
            fetchCommonNeighborConcepts(qids, 25),
            getExcludedConceptIds(),
          ]);
          const fresh = common.filter(c => !excluded.has(c.id));
          if (!cancelled && fresh.length >= 3) {
            await Promise.all(fresh.map(c => cacheConcept(c)));
            swipe.setDeck(fresh);
          }
        }
      } catch { /* fallback : on garde le deck client-side */ }
    })();
    return () => { cancelled = true; };
  }, [mode, explorationAnchorId, adopted.length]);

  const current = swipe.current;
  const anchor = adopted.find(c => c.id === explorationAnchorId) ?? null;

  // Sync favorite state when current changes
  useEffect(() => {
    if (!current) { setCurrentFavorite(false); return; }
    getCachedConcept(current.id).then(c => setCurrentFavorite(!!c?.isFavorite));
  }, [current?.id]);
  const activeThematicCats = activeThematicCatKeys;

  // Cross mode: use up to 3 most recent adopted as the cross selection
  const crossSelection = useMemo(() => {
    const top = adopted.slice(0, 3);
    if (top.length === 0) return [];
    const evenWeight = Math.round(100 / top.length);
    return top.map(c => ({ id: c.id, weight: evenWeight }));
  }, [adopted]);
  const crossById = Object.fromEntries(adopted.map(c => [c.id, c]));
  const crossMix = combinationMix(crossSelection
    .map(s => ({ cats: crossById[s.id]?.cats ?? [], weight: s.weight }))
    .filter(s => s.cats.length > 0));

  // Per-mode card props
  const cardProps = (() => {
    if (!current) return {};
    switch (mode) {
      case 'random':
        return { sourceOverride: 'TIRAGE ALÉATOIRE', badge: <PixelDie size={18}/> };
      case 'themed': {
        const labels = activeThematicCats.slice(0, 2).map(k => CATEGORIES[k].label).join(' + ');
        return { sourceOverride: labels ? `Tiré dans ${labels}` : 'Mode thématique · sélectionnez des catégories' };
      }
      case 'explore':
        return { sourceOverride: anchor ? `LIÉ À ${anchor.name.toUpperCase()}` : 'Exploration · choisissez un ancrage' };
      case 'contrast':
        return { sourceOverride: 'Contraste · loin de votre univers', contrast: true };
      case 'cross':
        return { sourceOverride: `Croisement · à l'intersection de ${crossSelection.length} concepts`, leftBorder: crossSelection.length > 0 ? crossMix.css : undefined };
      case 'free': {
        const picked = freeSource;
        const labelMap: Record<SwipeMode, string> = {
          random: 'Aléatoire', explore: 'Exploration', contrast: 'Contraste',
          themed: 'Thématique', cross: 'Croisement', free: 'Libre',
        };
        return { sourceOverride: `Libre · ${labelMap[picked].toLowerCase()} sélectionné par vos curseurs` };
      }
      default: return {};
    }
  })();

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Bonjour,"
        title="CITOYEN"
        active="swipe"
        onTabChange={onTabChange}
        right={<>
          {boostLabel && (
            <Stamp tone="brick" rotate={-3}>
              ★ BOOST · {Math.min(boostInitial - swipe.deck.length + 1, boostInitial)}/{boostInitial}
            </Stamp>
          )}
          <CitButton size="sm" onClick={() => onTabChange?.('search')}>⌕ Recherche</CitButton>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      {boostLabel && (
        <div style={{
          padding: '8px 32px',
          background: 'var(--cit-brick)',
          color: 'var(--cit-cream)',
          borderBottom: '2px solid var(--cit-navy-dk)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'relative', zIndex: 3,
        }}>
          <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)', letterSpacing: '.14em' }}>
            ★ MODE BOOST · {boostLabel.toUpperCase()}
          </span>
          <button onClick={() => { setBoostLabel(null); setBoostInitial(0); }} style={{
            background: 'var(--cit-cream)', color: 'var(--cit-brick)',
            border: '2px solid var(--cit-navy-dk)',
            padding: '2px 10px', cursor: 'pointer',
            fontFamily: "'Alfa Slab One', serif", fontSize: 12,
          }}>✕ Sortir du boost</button>
        </div>
      )}

      <ModeBar mode={mode} setMode={setMode} queueSize={swipe.deck.length}/>

      {/* Mode-specific banners */}
      {mode === 'themed' && (
        <ThematicBanner
          active={thematicCats}
          toggle={(k) => setThematicCats(p => ({ ...p, [k]: !p[k] }))}
          count={activeThematicCats.length}
        />
      )}
      {mode === 'cross' && (
        <CrossBanner selection={crossSelection} byId={crossById} mixCss={crossMix.css}/>
      )}

      <div style={{
        flex: 1, padding: '20px 32px',
        display: 'grid', gridTemplateColumns: '220px 1fr 220px',
        gap: 22, alignItems: 'start',
        overflow: 'auto',
      }}>
        {/* Left panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ScorePanel counts={todayCounts}/>
          <CitPanel title="Alerte bulle" accent={contextualAlert?.tone === 'saturation' ? 'brick' : 'butter'}>
            {contextualAlert ? (
              <p className="cit-typed" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0, color: contextualAlert.tone === 'saturation' ? 'var(--cit-cream)' : 'var(--cit-navy-dk)' }}>
                <strong>{contextualAlert.text}</strong>
              </p>
            ) : (
              <p className="cit-typed" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
                {mode === 'random'   && <>Mode <strong>ALÉATOIRE</strong>. Le Bureau tire sans tenir compte de votre profil.</>}
                {mode === 'themed'   && <>Mode <strong>THÉMATIQUE</strong>. {activeThematicCats.length} catégorie{activeThematicCats.length > 1 ? 's' : ''} active{activeThematicCats.length > 1 ? 's' : ''}.</>}
                {mode === 'explore'  && <>Mode <strong>EXPLORATION</strong>. Voisinages sémantiques d'un concept-pivot.</>}
                {mode === 'contrast' && <>Mode <strong>CONTRASTE</strong>. Le Bureau cherche des concepts éloignés de votre profil.</>}
                {mode === 'cross'    && <>Mode <strong>CROISEMENT</strong>. Tirage à l'intersection sémantique de vos concepts.</>}
                {mode === 'free'     && <>Mode <strong>LIBRE</strong>. Le Bureau suit vos curseurs d'algorithme.</>}
              </p>
            )}
          </CitPanel>
        </div>

        {/* Card column */}
        <div>
          <div style={{ position: 'relative', padding: mode === 'contrast' ? '24px 18px 0' : 0 }}>
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
                isFavorite={currentFavorite}
                onToggleFavorite={async () => {
                  await cacheConcept(current);
                  const next = await toggleFavorite(current.id);
                  setCurrentFavorite(next);
                  if (next) playSound('favorite');
                }}
                {...cardProps}
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
            <CitizenActions onAction={(v) => {
              if (v === 'back') {
                if (!swipe.canBack) {
                  toast.show({ tone: 'warning', title: 'Limite de retour arrière', body: 'Vous ne pouvez pas remonter au-delà de 10 actions ou avant le début de la session.' });
                  return;
                }
                swipe.back();
              } else {
                swipe.cycle(v);
              }
            }}/>
          </div>

          {current && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => setDetailOpen(true)} style={{
                background: 'transparent',
                color: 'var(--cit-navy-dk)',
                border: '2px solid var(--cit-navy-dk)',
                padding: '6px 14px',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
                letterSpacing: '.14em', textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 var(--cit-navy-dk)',
              }}>★ Voir la fiche complète ↗</button>
            </div>
          )}

          {mode === 'random' && (
            <div className="cit-script" style={{
              fontSize: 22, color: 'var(--cit-navy)', marginTop: 14,
              textAlign: 'center', transform: 'rotate(-0.8deg)',
            }}>
              La chance vous sourit, citoyen !
            </div>
          )}
        </div>

        {/* Right panel — Exploration replaces with anchor panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'explore' ? (
            <>
              <ExplorationAnchorPanel anchor={anchor}/>
              <RegistrePanel history={swipe.history}/>
            </>
          ) : (
            <>
              <RegistrePanel history={swipe.history}/>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <StarBurst size={120} rotate={-8}>NOUVELLE<br/>FICHE<br/>EXAMINÉE</StarBurst>
              </div>
            </>
          )}
        </div>
      </div>

      <CitizenFooter right={FOOTERS[mode]}/>

      <ConceptDetailModal
        concept={current ?? null}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      {showHints && (
        <div onClick={dismissHints} style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'oklch(0% 0 0 / 0.6)',
          display: 'grid', placeItems: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--cit-cream)',
            border: '3px solid var(--cit-navy-dk)',
            boxShadow: '8px 8px 0 var(--cit-navy-dk)',
            padding: '20px 24px', maxWidth: 480, width: '100%',
          }}>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>★ PREMIÈRE VISITE</div>
            <h3 className="cit-h1" style={{ fontSize: 28, lineHeight: 0.95, margin: '4px 0 12px' }}>
              COMMANDES DU SWIPE<span style={{ color: 'var(--cit-brick)' }}>!</span>
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', rowGap: 8, columnGap: 14, alignItems: 'center' }}>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 16, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 12px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>→</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Adopter (ou swipe à droite)</span>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 16, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 12px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>←</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Recycler (ou swipe à gauche)</span>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 16, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 12px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>↑</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Plus tard (ou swipe vers le haut)</span>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 16, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 12px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>⌫</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Retour arrière (10 max)</span>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 12, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 8px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>tap</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Ouvre la fiche détaillée du concept</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <CitButton tone="brick" onClick={dismissHints}>★ Compris !</CitButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
