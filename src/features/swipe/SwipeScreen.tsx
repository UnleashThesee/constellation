import { useState, useEffect, useMemo, useRef } from 'react';
import { useSwipeDeck } from './useSwipeDeck';
import { Sunburst, Stamp, PixelDie, Aster, SkeletonCard } from '../../components/ui/atoms';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { ConceptDetailModal } from '../../components/ui/ConceptDetailModal';
import { CATEGORIES, CATEGORY_LIST, gradientForWeights, conceptDominant, combinationMix } from '../../lib/categories';
import { fetchRandomConcepts, fetchNeighborConcepts, fetchConceptsByConstraintsLive, searchConcepts, fetchSemanticRelations, fetchWikipediaExtract, type SemanticRelation } from '../../services/wikidata';
import { getAdoptedConcepts, getExcludedConceptIds, cacheConcept, toggleFavorite, getCachedConcept, getSettings, saveSettings, getConceptsByVerdict, recordConstraintUsage, getAllConstraints, db } from '../../stores/db';
import { useToast } from '../../lib/toast';
import { playSound } from '../../lib/sounds';
import { consumePendingSwipeDeck } from '../../lib/pending';
import { embedConcepts, centroid, cosineSim, embeddingsStatus } from '../../services/embeddings';
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

const MODES: Array<{ id: SwipeMode; label: string; hint: string }> = [
  { id: 'random',   label: 'Aléatoire', hint: 'Tirage au hasard, sans tenir compte de votre profil. Pour découvrir large.' },
  { id: 'targeted', label: 'Ciblé',     hint: 'Vos thèmes (résolus en direct sur Wikidata) et/ou un concept ancré pilotent la pioche.' },
  { id: 'contrast', label: 'Contraste', hint: 'Le Bureau cherche ce qui vous dérange : loin de tout, ou dans le voisinage de vos adoptés / rejetés.' },
];

/** Entrelace plusieurs listes proportionnellement à des poids (mode « mélange »). */
function interleaveWeighted(lists: Concept[][], weights: number[]): Concept[] {
  const out: Concept[] = [];
  const seen = new Set<string>();
  const pos = lists.map(() => 0);
  const acc = lists.map(() => 0);
  const tot = weights.reduce((s, w) => s + Math.max(1, w), 0) || 1;
  let left = lists.reduce((s, l) => s + l.length, 0);
  while (left > 0) {
    let any = false;
    for (let i = 0; i < lists.length; i++) {
      acc[i] += Math.max(1, weights[i] ?? 1) / tot;
      if (acc[i] >= 1 && pos[i] < lists[i].length) {
        acc[i] -= 1;
        const c = lists[i][pos[i]++]; left--; any = true;
        if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
      }
    }
    if (!any) {
      for (let i = 0; i < lists.length; i++) {
        while (pos[i] < lists[i].length) {
          const c = lists[i][pos[i]++]; left--;
          if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
        }
      }
      break;
    }
  }
  return out;
}

type ContrastSub = 'far' | 'adopted' | 'rejected';
const CONTRAST_SUBS: Array<{ id: ContrastSub; label: string; hint: string }> = [
  { id: 'far',      label: 'Loin de tout',          hint: 'Ni proche de vos adoptés ni de vos rejetés' },
  { id: 'adopted',  label: 'Proche de mes adoptés', hint: 'Voisinage de ce que vous gardez' },
  { id: 'rejected', label: 'Proche de mes rejetés', hint: 'Voisinage de ce que vous écartez' },
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
function CitIconFav() {
  return <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 3l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 16.9 6.5 19.9l1.3-6.1L3.2 9.4l6.2-.7z"/></svg>;
}
function CitIconNeutral() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"><path d="M5 12H19"/></svg>;
}

function CitCat({ catKey, weight, small }: { catKey: CategoryKey; weight?: number; small?: boolean }) {
  const c = CATEGORIES[catKey];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: small ? 4 : 6,
      fontFamily: "'Oswald', sans-serif",
      fontSize: small ? 9.5 : 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600,
      padding: small ? '2px 6px' : '3px 9px',
      background: 'var(--cit-cream)',
      border: '2px solid var(--cit-navy-dk)',
      color: 'var(--cit-navy-dk)',
    }}>
      <span style={{ width: small ? 7 : 9, height: small ? 7 : 9, background: c.oklch, border: '1.5px solid var(--cit-navy-dk)', display: 'inline-block' }}/>
      {c.label}
      {weight !== undefined && <span style={{ color: 'var(--cit-brick)' }}>{Math.round(weight * 100)}%</span>}
    </span>
  );
}

function CitizenCard({ concept, tilt, dragOffset, animClass, onPointerDown, sourceOverride, badge, leftBorder, contrast, isFavorite, onToggleFavorite, relations, extract }: {
  concept: Concept;
  tilt: 'right' | 'left' | 'up' | 'down' | null;
  dragOffset: { x: number; y: number };
  animClass: string;
  onPointerDown: (e: React.PointerEvent) => void;
  sourceOverride?: string;
  badge?: React.ReactNode;
  leftBorder?: string;
  contrast?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  relations?: SemanticRelation[];
  extract?: string;
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
          <div style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translate(-50%,-50%) rotate(-3deg)', zIndex: 5, pointerEvents: 'none' }}>
            <Stamp tone="mustard" size={32}>★ Coup de cœur</Stamp>
          </div>
        )}
        {tilt === 'down' && (
          <div style={{ position: 'absolute', bottom: '20%', left: '50%', transform: 'translate(-50%,50%) rotate(2deg)', zIndex: 5, pointerEvents: 'none' }}>
            <Stamp tone="navy" size={32}>Neutre</Stamp>
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
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <p className="cit-typed" style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.62, color: 'var(--cit-navy-dk)' }}>
              {extract || concept.blurb}
            </p>

            {relations && relations.length > 0 && (
              <>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', margin: '0 0 4px' }}>
                  ★ Relations Wikidata
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {relations.slice(0, 12).map((r, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
                      background: 'var(--cit-cream)', border: '2px solid var(--cit-navy-dk)',
                      borderLeft: '5px solid var(--cit-navy)',
                      fontFamily: "'Oswald', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em',
                      color: 'var(--cit-navy-dk)',
                    }}>
                      <span style={{ color: 'var(--cit-brick)', fontSize: 9, textTransform: 'uppercase' }}>{r.propertyLabel}</span>
                      <span style={{ textTransform: 'uppercase' }}>{r.targetLabel}</span>
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Bas de fiche : références + catégories, discrets */}
            <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1.5px dashed var(--cit-navy-dk)', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
              {concept.refs.length > 0 && (
                <div>
                  <div className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>★ Voir aussi</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {concept.refs.map((r, i) => (
                      <span key={i} className="cit-condensed" style={{
                        fontSize: 9.5, padding: '2px 7px',
                        background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', fontWeight: 600,
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>★ Catégories</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {concept.cats.map(([k]) => <CitCat key={k} catKey={k} small/>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CitizenActions({ onAction }: { onAction: (v: 'reject' | 'skip' | 'valid' | 'favorite' | 'back') => void }) {
  const items = [
    { key: 'reject'   as const, label: 'Rejeter',  tone: 'brick'  as const, icon: <CitIconReject/>,  kbd: '←' },
    { key: 'skip'     as const, label: 'Neutre',   tone: undefined,         icon: <CitIconNeutral/>, kbd: '↓' },
    { key: 'favorite' as const, label: 'Favori',   tone: 'mustard' as const, icon: <CitIconFav/>,    kbd: '↑' },
    { key: 'valid'    as const, label: 'Adopter',  tone: 'butter' as const, icon: <CitIconValid/>,   kbd: '→' },
    { key: 'back'     as const, label: 'Annuler',  tone: 'navy'   as const, icon: <CitIconBack/>,    kbd: '⌫' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      {items.map(it => (
        <CitButton key={it.key} tone={it.tone === 'mustard' ? undefined : it.tone} icon={it.icon} kbd={it.kbd} onClick={() => onAction(it.key)} style={{ minWidth: 124, ...(it.tone === 'mustard' ? { background: 'var(--cit-mustard)' } : {}) }}>
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

function CibleBanner({ themes, onAdd, onRemove, onWeight, mixThemes, onToggleMix, anchors, onAddAnchor, onRemoveAnchor, onAnchorWeight, suggestions, loading }: {
  themes: Array<{ text: string; weight: number }>;
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  onWeight: (t: string, w: number) => void;
  mixThemes: boolean;
  onToggleMix: () => void;
  anchors: Array<{ qid: string; name: string; weight: number }>;
  onAddAnchor: (c: Concept) => void;
  onRemoveAnchor: (qid: string) => void;
  onAnchorWeight: (qid: string, w: number) => void;
  suggestions: string[];
  loading: boolean;
}) {
  const [input, setInput] = useState('');
  const submit = () => { const v = input.trim(); if (v) { onAdd(v); setInput(''); } };
  const free = suggestions.filter(s => !themes.some(t => t.text.toLowerCase() === s.toLowerCase())).slice(0, 6);
  return (
    <div style={{
      padding: '10px 32px', background: 'var(--cit-butter)',
      borderBottom: '3px solid var(--cit-navy-dk)', position: 'relative', zIndex: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <Aster size={24}/>
        <span className="cit-h1" style={{ fontSize: 18, lineHeight: 0.9 }}>CIBLAGE DE LA PIOCHE</span>
        <div style={{ flex: 1 }}/>
        {loading && <span className="cit-condensed cit-pulse-brick" style={{ fontSize: 10, color: 'var(--cit-brick)' }}>★ INTERROGATION WIKIDATA…</span>}
        <button onClick={onToggleMix} title={mixThemes ? 'Mélange pondéré : tirage proportionnel' : 'Intersection stricte : concepts respectant TOUS les thèmes'} style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)',
          padding: '4px 12px', cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
          letterSpacing: '.1em', textTransform: 'uppercase',
        }}>{mixThemes ? '⇆ Mélange pondéré' : '∩ Intersection'}</button>
      </div>

      <p className="cit-typed" style={{ fontSize: 10.5, color: 'var(--cit-navy-lt)', margin: '0 0 8px', fontStyle: 'italic' }}>
        {mixThemes
          ? 'Mélange : chaque entrée contribue à la pioche selon son poids (curseurs).'
          : 'Intersection : on ne garde que les concepts qui respectent toutes les entrées à la fois.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>★ THÈMES (familles)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="guerre, citations, instruments…"
              style={{
                flex: 1, minWidth: 120, padding: '6px 12px',
                border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)',
              }}/>
            <CitButton size="sm" tone="navy" onClick={submit}>+ Thème</CitButton>
          </div>
        </div>
        <div>
          <div className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>⚓ CONCEPTS ANCRÉS (voisinage)</div>
          <InlineAddConcept onPick={onAddAnchor} placeholder="⚓ Ancrer un concept : Kant, Daft Punk…"/>
        </div>
      </div>

      {themes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {themes.map(t => (
            <span key={t.text} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px',
              background: 'var(--cit-cream)', border: '2.5px solid var(--cit-navy-dk)',
              boxShadow: '2px 2px 0 var(--cit-navy-dk)',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--cit-navy-dk)',
            }}>
              {t.text}
              {mixThemes && (
                <input type="range" min={5} max={100} value={t.weight} onChange={e => onWeight(t.text, +e.target.value)} style={{ width: 60 }} title={`Poids ${t.weight}%`}/>
              )}
              {mixThemes && <span style={{ color: 'var(--cit-brick)', fontSize: 10 }}>{t.weight}%</span>}
              <button onClick={() => onRemove(t.text)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cit-brick)', fontFamily: "'Alfa Slab One', serif", fontSize: 12 }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {anchors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {anchors.map(a => (
            <span key={a.qid} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px',
              background: 'var(--cit-cream)', border: '2.5px solid var(--cit-navy)',
              boxShadow: '2px 2px 0 var(--cit-navy)',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--cit-navy-dk)',
            }}>
              ⚓ {a.name}
              {mixThemes && (
                <input type="range" min={5} max={100} value={a.weight} onChange={e => onAnchorWeight(a.qid, +e.target.value)} style={{ width: 60 }} title={`Poids ${a.weight}%`}/>
              )}
              {mixThemes && <span style={{ color: 'var(--cit-brick)', fontSize: 10 }}>{a.weight}%</span>}
              <button onClick={() => onRemoveAnchor(a.qid)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cit-brick)', fontFamily: "'Alfa Slab One', serif", fontSize: 12 }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {free.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)' }}>RÉCENTS ›</span>
          {free.map(s => (
            <button key={s} onClick={() => onAdd(s)} style={{
              background: 'transparent', border: '1.5px dashed var(--cit-navy-dk)', cursor: 'pointer',
              padding: '2px 8px', fontFamily: "'Oswald', sans-serif", fontSize: 10, color: 'var(--cit-navy-dk)',
            }}>+ {s}</button>
          ))}
        </div>
      )}

      {themes.length === 0 && anchors.length === 0 && (
        <p className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', margin: '8px 0 0', fontStyle: 'italic' }}>
          Écrivez un thème (une famille) et/ou ancrez des concepts précis (leur voisinage). Sans rien, on tire au hasard.
        </p>
      )}
    </div>
  );
}

function ContrasteBanner({ sub, onSet }: { sub: ContrastSub; onSet: (s: ContrastSub) => void }) {
  return (
    <div style={{
      padding: '10px 32px', background: 'var(--cit-brick)',
      borderBottom: '3px solid var(--cit-navy-dk)', position: 'relative', zIndex: 3,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)', whiteSpace: 'nowrap' }}>★ Contraste ›</span>
      {CONTRAST_SUBS.map(s => {
        const on = s.id === sub;
        return (
          <button key={s.id} onClick={() => onSet(s.id)} title={s.hint} style={{
            background: on ? 'var(--cit-cream)' : 'transparent',
            color: on ? 'var(--cit-brick)' : 'var(--cit-cream)',
            border: `2px solid ${on ? 'var(--cit-cream)' : 'oklch(100% 0 0 / 0.5)'}`,
            padding: '4px 12px', cursor: 'pointer', fontFamily: "'Oswald', sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          }}>{s.label}</button>
        );
      })}
      <span className="cit-typed" style={{ fontSize: 10.5, color: 'var(--cit-cream)', marginLeft: 'auto' }}>
        {CONTRAST_SUBS.find(s => s.id === sub)?.hint}
      </span>
    </div>
  );
}

/** Recherche de concept Wikidata (autocomplétion) → onPick. Réutilisé pour l'ajout direct et les ancrages. */
function InlineAddConcept({ onPick, placeholder = '✚ Ajouter votre propre concept (ex. Spinoza, le jazz modal…)' }: { onPick: (c: Concept) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Concept[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) { setResults([]); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try { const r = await searchConcepts(v, 6); if (!cancelled) setResults(r); }
      catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setBusy(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);
  const pick = (c: Concept) => { onPick(c); setQ(''); setResults([]); setOpen(false); };
  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '7px 12px', border: '2.5px solid var(--cit-navy-dk)',
            background: 'var(--cit-cream)', fontFamily: "'Special Elite', monospace",
            fontSize: 13, color: 'var(--cit-navy-dk)',
          }}/>
        {busy && <span className="cit-condensed cit-pulse-brick" style={{ fontSize: 10, color: 'var(--cit-brick)', whiteSpace: 'nowrap' }}>★ RECHERCHE…</span>}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
          background: 'var(--cit-cream)', border: '2.5px solid var(--cit-navy-dk)',
          boxShadow: '4px 4px 0 var(--cit-navy-dk)', maxHeight: 260, overflow: 'auto',
        }}>
          {results.map(c => (
            <button key={c.id} onClick={() => pick(c)} style={{
              display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
              border: 'none', borderBottom: '1px dashed var(--cit-navy-dk)', cursor: 'pointer',
              padding: '7px 12px', fontFamily: "'Oswald', sans-serif",
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--cit-navy-dk)' }}>{c.name}</span>
              {c.blurb && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--cit-navy-lt)', fontFamily: "'Special Elite', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.blurb}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScorePanel({ counts }: { counts: { valid: number; reject: number; skip: number; favs: number } }) {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
  const rows: Array<[string, number, string]> = [
    ['Adoptés',  counts.valid,  'var(--cit-navy)'],
    ['Rejetés',  counts.reject, 'var(--cit-brick)'],
    ['Neutres',  counts.skip,   'var(--cit-navy-lt)'],
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

/** Contrainte de pioche, valable dans toutes les procédures (filtre par classe Wikidata). */
function ConstraintPanel({ value, onSet }: { value: string; onSet: (v: string) => void }) {
  const [input, setInput] = useState('');
  return (
    <CitPanel title="Contrainte de la pioche">
      <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 6, letterSpacing: '.04em' }}>
        Ne montrer qu'un type, quel que soit le mode (ex. personnages, objets, films).
      </div>
      {value ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px',
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
          fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
        }}>
          ⊓ {value}
          <button onClick={() => onSet('')} title="Retirer la contrainte" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cit-butter)', fontFamily: "'Alfa Slab One', serif", fontSize: 12 }}>✕</button>
        </span>
      ) : (
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onSet(input.trim()); setInput(''); } }}
          placeholder="Filtrer : personnages, objets…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '6px 10px',
            border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
            fontFamily: "'Special Elite', monospace", fontSize: 12, color: 'var(--cit-navy-dk)',
          }}/>
      )}
    </CitPanel>
  );
}

const FOOTERS: Partial<Record<SwipeMode, string>> = {
  random:   'MODE ALÉATOIRE · LE BUREAU LANCE LES DÉS POUR VOUS',
  targeted: 'MODE CIBLÉ · LE BUREAU TIRE SELON VOS THÈMES ET ANCRAGE',
  contrast: 'MODE CONTRASTE · LE BUREAU CHERCHE CE QUI VOUS DÉRANGE',
};

export function SwipeScreen({ onTabChange }: { onTabChange?: (id: string) => void }) {
  const [mode, setMode] = useState<SwipeMode>('random');
  const [loading, setLoading] = useState(true);
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  // Mode Ciblé : thèmes (texte libre, résolus via Wikidata) + ancrage + intersection/mélange
  const [themes, setThemes] = useState<Array<{ text: string; weight: number }>>([]);
  const [mixThemes, setMixThemes] = useState(false);
  const [anchors, setAnchors] = useState<Array<{ qid: string; name: string; weight: number }>>([]);
  const [contrastSub, setContrastSub] = useState<ContrastSub>('far');
  const [savedThemes, setSavedThemes] = useState<string[]>([]);
  const [targetedLoading, setTargetedLoading] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const incognitoRef = useRef(incognito);
  incognitoRef.current = incognito;
  const [constraint, setConstraint] = useState('');

  const swipe = useSwipeDeck(FALLBACK_CONCEPTS, () => setDetailOpen(true), () => incognitoRef.current);
  const [rawDeck, setRawDeck] = useState<Concept[]>([]);
  const [currentFavorite, setCurrentFavorite] = useState(false);
  const [boostLabel, setBoostLabel] = useState<string | null>(null);
  const [boostInitial, setBoostInitial] = useState(0);
  const [showHints, setShowHints] = useState(false);
  const [todayCounts, setTodayCounts] = useState({ valid: 0, reject: 0, skip: 0, favs: 0 });
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [currentRelations, setCurrentRelations] = useState<SemanticRelation[]>([]);
  const [currentExtract, setCurrentExtract] = useState<string | null>(null);
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

  // Préférences au montage : contraste sémantique + incognito + thèmes récents
  useEffect(() => {
    getSettings().then(s => {
      if (s?.semanticContrastEnabled) setSemanticEnabled(true);
      if (s?.incognito) setIncognito(true);
    });
    getAllConstraints().then(cs => setSavedThemes(cs.sort((a, b) => b.useCount - a.useCount).map(c => c.text)));
  }, []);

  const enableSemanticContrast = async () => {
    setSemanticEnabled(true);
    await saveSettings({ semanticContrastEnabled: true });
  };

  // Gestion des thèmes (mode Ciblé) — chaque thème ajouté est mémorisé dans la
  // bibliothèque de contraintes (partagée avec l'onglet Croiser).
  const addTheme = (text: string) => {
    const t = text.trim();
    if (!t || themes.some(x => x.text.toLowerCase() === t.toLowerCase())) return;
    setThemes(prev => [...prev, { text: t, weight: 50 }]);
    recordConstraintUsage(t).then(() => getAllConstraints().then(cs => setSavedThemes(cs.sort((a, b) => b.useCount - a.useCount).map(c => c.text))));
  };
  const removeTheme = (text: string) => setThemes(prev => prev.filter(x => x.text !== text));
  const setThemeWeight = (text: string, w: number) => setThemes(prev => prev.map(x => x.text === text ? { ...x, weight: w } : x));
  // Ancrages : concepts précis écrits librement (résolus Wikidata) → leur voisinage pilote la pioche
  const addAnchor = (c: Concept) => {
    const qid = c.wikidataId;
    if (!qid) return;
    setAnchors(prev => prev.find(a => a.qid === qid) ? prev : [...prev, { qid, name: c.name, weight: 50 }]);
  };
  const removeAnchor = (qid: string) => setAnchors(prev => prev.filter(a => a.qid !== qid));
  const setAnchorWeight = (qid: string, w: number) => setAnchors(prev => prev.map(a => a.qid === qid ? { ...a, weight: w } : a));

  const toggleIncognito = async () => {
    const next = !incognito;
    setIncognito(next);
    await saveSettings({ incognito: next });
    toast.show(next
      ? { tone: 'info', title: 'Mode incognito activé', body: 'Vos décisions sont privées (exclues d\'un univers partagé).' }
      : { tone: 'info', title: 'Mode incognito désactivé', body: 'Vos décisions redeviennent publiques.' });
  };

  // En mode 'free', re-pick la source à chaque changement de carte courante
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
    });
  }, []);

  // Deck piloté par le mode (#refonte) :
  //  · random  → pool aléatoire tel quel
  //  · targeted → thèmes (Wikidata, intersection ou mélange) + ancrage optionnel
  //  · contrast → sous-mode loin de tout / proche adoptés / proche rejetés
  // Fallback silencieux sur le pool aléatoire si rien ne remonte.
  useEffect(() => {
    if (rawDeck.length === 0) return;
    if (mode === 'random' && !constraint.trim()) { swipe.setDeck(rawDeck); return; }
    let cancelled = false;
    (async () => {
      setTargetedLoading(true);
      try {
        const excluded = await getExcludedConceptIds();
        let fresh: Concept[] = mode === 'random' ? rawDeck : [];

        if (mode === 'targeted') {
          const themeTexts = themes.map(t => t.text);

          let themeResults: Concept[] = [];
          if (themeTexts.length > 0) {
            if (mixThemes && themeTexts.length > 1) {
              const per = await Promise.all(themeTexts.map(t => fetchConceptsByConstraintsLive([t], 18)));
              themeResults = interleaveWeighted(per, themes.map(t => t.weight));
            } else {
              themeResults = await fetchConceptsByConstraintsLive(themeTexts, 40);
            }
          }

          let anchorResults: Concept[] = [];
          if (anchors.length > 0) {
            const per = await Promise.all(anchors.map(a => fetchNeighborConcepts([a.qid], 18)));
            anchorResults = interleaveWeighted(per, anchors.map(a => a.weight));
          }

          if (themeResults.length > 0 && anchorResults.length > 0) {
            if (!mixThemes) {
              const aIds = new Set(anchorResults.map(c => c.id));
              const both = themeResults.filter(c => aIds.has(c.id));
              fresh = both.length >= 3 ? both : interleaveWeighted([themeResults, anchorResults], [1, 1]);
            } else {
              fresh = interleaveWeighted([themeResults, anchorResults], [1, 1]);
            }
          } else if (themeResults.length > 0) {
            fresh = themeResults;
          } else if (anchorResults.length > 0) {
            fresh = anchorResults;
          } else {
            fresh = rawDeck;
          }
        } else if (mode === 'contrast') {
          if (contrastSub === 'far') {
            const rejected = await getConceptsByVerdict('reject');
            const userCats = new Set<string>();
            adopted.forEach(c => c.cats.forEach(([k]) => userCats.add(k)));
            rejected.forEach(c => c.cats.forEach(([k]) => userCats.add(k)));
            fresh = rawDeck.filter(c => !c.cats.some(([k]) => userCats.has(k)));
            if (fresh.length < 3) fresh = rawDeck;
          } else if (contrastSub === 'adopted') {
            const qids = adopted.slice(0, 6).map(c => c.wikidataId).filter((q): q is string => !!q);
            fresh = qids.length ? await fetchNeighborConcepts(qids, 40) : rawDeck;
          } else {
            const rejected = await getConceptsByVerdict('reject');
            const qids = rejected.slice(0, 6).map(c => c.wikidataId).filter((q): q is string => !!q);
            fresh = qids.length ? await fetchNeighborConcepts(qids, 40) : rawDeck;
          }
        }

        // Contrainte (toutes procédures) : restreint la pioche à une classe Wikidata
        const ct = constraint.trim();
        if (ct) {
          const allowed = await fetchConceptsByConstraintsLive([ct], 80);
          const ids = new Set(allowed.map(c => c.wikidataId).filter(Boolean));
          const inter = fresh.filter(c => c.wikidataId && ids.has(c.wikidataId));
          fresh = inter.length >= 1 ? inter : allowed;
        }

        fresh = fresh.filter(c => !excluded.has(c.id));
        if (!cancelled) {
          if (fresh.length >= 1) {
            await Promise.all(fresh.map(c => cacheConcept(c)));
            swipe.setDeck(fresh);
          } else {
            swipe.setDeck(rawDeck);
          }
        }
      } catch {
        if (!cancelled) swipe.setDeck(rawDeck);
      } finally {
        if (!cancelled) setTargetedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, themes, mixThemes, anchors, contrastSub, constraint, rawDeck.length, adopted.length]);

  // #13 — Contraste sémantique réel (opt-in) : on classe le pool par distance
  // cosinus croissante au barycentre sémantique des concepts adoptés. Les plus
  // éloignés (les plus "dérangeants") passent en tête. Fallback silencieux sur
  // le filtre catégoriel si le modèle est indisponible (hors-ligne, échec CDN).
  useEffect(() => {
    if (mode !== 'contrast' || contrastSub !== 'far' || !semanticEnabled) return;
    if (adopted.length === 0 || rawDeck.length === 0) return;
    let cancelled = false;
    (async () => {
      setSemanticBusy(true);
      try {
        const ref = adopted.slice(0, 40);
        const candidates = rawDeck.slice(0, 60);
        const refVecs = await embedConcepts(ref);
        if (cancelled) return;
        const center = centroid([...refVecs.values()]);
        if (!center) return;
        const candVecs = await embedConcepts(candidates);
        if (cancelled || candVecs.size === 0) return;
        const ranked = [...rawDeck]
          .filter(c => candVecs.has(c.id))
          .map(c => ({ c, sim: cosineSim(center, candVecs.get(c.id)!) }))
          .sort((a, b) => a.sim - b.sim)
          .map(x => x.c);
        if (!cancelled && ranked.length >= 3) swipe.setDeck(ranked);
      } catch { /* garde le deck catégoriel */ } finally {
        if (!cancelled) setSemanticBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, contrastSub, semanticEnabled, adopted.length, rawDeck.length]);

  const current = swipe.current;

  // Ajout inline d'un concept (toute procédure) → tête de pioche, prêt à être jugé
  const addOwnConcept = async (c: Concept) => {
    await cacheConcept(c);
    swipe.setDeck([c, ...swipe.deck.filter(x => x.id !== c.id)]);
    toast.show({ tone: 'success', title: 'Concept ajouté', body: `${c.name} est placé en tête de votre pioche.` });
  };

  // Sync favorite state when current changes
  useEffect(() => {
    if (!current) { setCurrentFavorite(false); return; }
    getCachedConcept(current.id).then(c => setCurrentFavorite(!!c?.isFavorite));
  }, [current?.id]);

  // Relations Wikidata + description longue (Wikipédia) de la carte courante (cache 30j)
  useEffect(() => {
    setCurrentRelations([]);
    setCurrentExtract(null);
    if (!current) return;
    let cancelled = false;
    if (current.wikidataId) {
      fetchSemanticRelations(current.wikidataId).then(r => { if (!cancelled) setCurrentRelations(r); }).catch(() => {});
    }
    fetchWikipediaExtract(current.name).then(ext => { if (!cancelled && ext) setCurrentExtract(ext); }).catch(() => {});
    return () => { cancelled = true; };
  }, [current?.id]);

  // Raccourci clavier « F » → ouvre/ferme la fiche complète
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'f' || e.key === 'F') && current) setDetailOpen(o => !o);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [current]);

  // Per-mode card props
  const cardProps = (() => {
    if (!current) return {};
    switch (mode) {
      case 'random':
        return { sourceOverride: 'TIRAGE ALÉATOIRE', badge: <PixelDie size={18}/> };
      case 'targeted': {
        const parts: string[] = [];
        if (themes.length > 0) parts.push(themes.map(t => t.text).join(mixThemes ? ' / ' : ' ∩ '));
        if (anchors.length > 0) parts.push(anchors.map(a => `⚓ ${a.name}`).join(' · '));
        return { sourceOverride: parts.length ? `Ciblé · ${parts.join(' · ')}` : 'Ciblé · ajoutez un thème ou un ancrage' };
      }
      case 'contrast':
        return {
          sourceOverride: `Contraste · ${CONTRAST_SUBS.find(s => s.id === contrastSub)?.label.toLowerCase()}`,
          contrast: contrastSub === 'far',
        };
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
          <button onClick={toggleIncognito} title={incognito ? 'Incognito activé — cliquez pour repasser en public' : 'Activer le mode incognito (décisions privées)'} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: incognito ? 'var(--cit-navy-dk)' : 'transparent',
            color: incognito ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
            border: '2px solid var(--cit-navy-dk)', padding: '5px 12px', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
            letterSpacing: '.12em', textTransform: 'uppercase',
          }}>{incognito ? '● Incognito' : '○ Public'}</button>
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
      {mode === 'targeted' && (
        <CibleBanner
          themes={themes}
          onAdd={addTheme}
          onRemove={removeTheme}
          onWeight={setThemeWeight}
          mixThemes={mixThemes}
          onToggleMix={() => setMixThemes(v => !v)}
          anchors={anchors}
          onAddAnchor={addAnchor}
          onRemoveAnchor={removeAnchor}
          onAnchorWeight={setAnchorWeight}
          suggestions={savedThemes}
          loading={targetedLoading}
        />
      )}
      {mode === 'contrast' && (
        <ContrasteBanner sub={contrastSub} onSet={setContrastSub}/>
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
          <CitPanel title="La procédure" accent={contextualAlert?.tone === 'saturation' ? 'brick' : 'butter'}>
            <p className="cit-typed" style={{ fontSize: 11.5, lineHeight: 1.55, margin: 0, color: 'var(--cit-navy-dk)' }}>
              {mode === 'random' && <><strong>ALÉATOIRE.</strong> Le Bureau tire au hasard dans tout le catalogue, sans tenir compte de votre profil. Pour découvrir large.</>}
              {mode === 'targeted' && <><strong>CIBLÉ.</strong> Vous composez la pioche : des <strong>thèmes</strong> (familles de concepts) et/ou des <strong>concepts ancrés</strong> dont le Bureau propose le voisinage.</>}
              {mode === 'contrast' && <><strong>CONTRASTE.</strong> Le Bureau vous confronte à l'inattendu — {CONTRAST_SUBS.find(s => s.id === contrastSub)?.hint?.toLowerCase()}.</>}
            </p>
            {contextualAlert && (
              <p className="cit-typed" style={{
                fontSize: 11, lineHeight: 1.4, margin: '8px 0 0', padding: '6px 8px',
                background: contextualAlert.tone === 'saturation' ? 'var(--cit-brick)' : 'var(--cit-butter)',
                color: contextualAlert.tone === 'saturation' ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
                border: '1.5px solid var(--cit-navy-dk)',
              }}>
                <strong>{contextualAlert.text}</strong>
              </p>
            )}
            {mode === 'contrast' && contrastSub === 'far' && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--cit-navy-dk)' }}>
                {!semanticEnabled ? (
                  <>
                    <p className="cit-typed" style={{ fontSize: 10.5, lineHeight: 1.5, margin: '0 0 8px' }}>
                      Contraste <strong>catégoriel</strong>. Activez le contraste <strong>sémantique</strong> pour un calcul de distance réelle (télécharge un modèle ~25 Mo, mis en cache).
                    </p>
                    <CitButton size="sm" tone="navy" onClick={enableSemanticContrast}>⚛ Activer le sémantique</CitButton>
                  </>
                ) : (
                  <p className="cit-condensed" style={{ fontSize: 10, letterSpacing: '.1em', margin: 0, textTransform: 'uppercase', color: 'var(--cit-navy-dk)' }}>
                    {semanticBusy || embeddingsStatus() === 'loading'
                      ? '⚛ Chargement du modèle sémantique…'
                      : embeddingsStatus() === 'error'
                        ? '⚠ Modèle indisponible · repli catégoriel'
                        : '⚛ Contraste sémantique actif'}
                  </p>
                )}
              </div>
            )}
          </CitPanel>
        </div>

        {/* Card column */}
        <div>
          <InlineAddConcept onPick={addOwnConcept}/>
          <div style={{ position: 'relative', padding: mode === 'contrast' ? '24px 18px 0' : 0 }}>
            {loading && !current ? (
              <SkeletonCard />
            ) : current ? (
              <CitizenCard
                concept={current}
                tilt={swipe.tilt}
                dragOffset={swipe.drag}
                animClass={swipe.animClass}
                onPointerDown={swipe.onPointerDown}
                isFavorite={currentFavorite}
                relations={currentRelations}
                extract={currentExtract ?? undefined}
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

          {current && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => setDetailOpen(true)} style={{
                background: 'var(--cit-navy-dk)',
                color: 'var(--cit-butter)',
                border: '2.5px solid var(--cit-navy-dk)',
                padding: '9px 22px',
                fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 700,
                letterSpacing: '.14em', textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '3px 3px 0 var(--cit-brick)',
              }}>★ Voir la fiche complète ↗ <span style={{ opacity: 0.65, fontSize: 11 }}>· touche F</span></button>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <CitizenActions onAction={(v) => {
              if (v === 'back') {
                if (!swipe.canBack) {
                  toast.show({ tone: 'warning', title: 'Limite de retour arrière', body: 'Vous ne pouvez pas remonter au-delà de 10 actions ou avant le début de la session.' });
                  return;
                }
                swipe.back();
              } else if (v === 'favorite') {
                swipe.favorite();
              } else {
                swipe.cycle(v);
              }
            }}/>
          </div>

          {mode === 'random' && (
            <div className="cit-script" style={{
              fontSize: 22, color: 'var(--cit-navy)', marginTop: 14,
              textAlign: 'center', transform: 'rotate(-0.8deg)',
            }}>
              La chance vous sourit, citoyen !
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ConstraintPanel value={constraint} onSet={setConstraint}/>
          <RegistrePanel history={swipe.history}/>
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
              <span className="cit-typed" style={{ fontSize: 12 }}>Rejeter (ou swipe à gauche)</span>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 16, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 12px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>↑</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Favori — adopte + ★ (ou swipe vers le haut)</span>
              <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 16, background: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '4px 12px', textAlign: 'center', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>↓</kbd>
              <span className="cit-typed" style={{ fontSize: 12 }}>Neutre (ou swipe vers le bas)</span>
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
