import { useState, useEffect, useMemo, useRef } from 'react';
import { useSwipeDeck } from './useSwipeDeck';
import { Sunburst, Stamp, PixelDie, Aster, SkeletonCard } from '../../components/ui/atoms';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { ConceptDetailModal } from '../../components/ui/ConceptDetailModal';
import { CATEGORIES, CATEGORY_LIST, gradientForWeights, conceptDominant, combinationMix } from '../../lib/categories';
import { fetchRandomConcepts, fetchNeighborConcepts, fetchConceptsByConstraintsLive, fetchConceptsForEntry, searchConcepts, fetchSemanticRelations, fetchWikipediaExtract, fetchConceptImage, type SemanticRelation } from '../../services/wikidata';
import { getAdoptedConcepts, getExcludedConceptIds, cacheConcept, toggleFavorite, getCachedConcept, getSettings, saveSettings, getConceptsByVerdict, recordConstraintUsage, getAllConstraints, addTagToConcept, db } from '../../stores/db';
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

// ---- Mini-schémas explicatifs ----
function SchemaAnchor() {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30" fill="none" stroke="var(--cit-navy)" strokeWidth="1.3" style={{ flexShrink: 0 }}>
      <line x1="23" y1="15" x2="8" y2="6"/><line x1="23" y1="15" x2="39" y2="6"/>
      <line x1="23" y1="15" x2="8" y2="24"/><line x1="23" y1="15" x2="39" y2="24"/>
      <circle cx="8" cy="6" r="2.4" fill="var(--cit-navy)" stroke="none"/><circle cx="39" cy="6" r="2.4" fill="var(--cit-navy)" stroke="none"/>
      <circle cx="8" cy="24" r="2.4" fill="var(--cit-navy)" stroke="none"/><circle cx="39" cy="24" r="2.4" fill="var(--cit-navy)" stroke="none"/>
      <circle cx="23" cy="15" r="5" fill="var(--cit-brick)" stroke="var(--cit-navy-dk)" strokeWidth="1.5"/>
    </svg>
  );
}
function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
      {off && <line x1="3" y1="3" x2="21" y2="21" stroke="var(--cit-brick)" strokeWidth="2.4"/>}
    </svg>
  );
}
function SchemaMix({ kind }: { kind: 'inter' | 'mix' }) {
  return kind === 'inter' ? (
    <svg width="40" height="26" viewBox="0 0 40 26" fill="none" stroke="var(--cit-navy-dk)" strokeWidth="1.4" style={{ flexShrink: 0 }}>
      <circle cx="16" cy="13" r="9"/><circle cx="24" cy="13" r="9"/>
      <ellipse cx="20" cy="13" rx="3" ry="7" fill="var(--cit-brick)" fillOpacity="0.55" stroke="none"/>
    </svg>
  ) : (
    <svg width="40" height="26" viewBox="0 0 40 26" fill="none" stroke="var(--cit-navy-dk)" strokeWidth="1.2" style={{ flexShrink: 0 }}>
      <rect x="6" y="14" width="6" height="8" fill="var(--cit-navy)" stroke="none"/>
      <rect x="16" y="7" width="6" height="15" fill="var(--cit-brick)" stroke="none"/>
      <rect x="26" y="11" width="6" height="11" fill="var(--cit-mustard)" stroke="none"/>
    </svg>
  );
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

function CitizenCard({ concept, tilt, dragOffset, animClass, onPointerDown, sourceOverride, badge, leftBorder, contrast, isFavorite, onToggleFavorite, relations, extract, imageUrl }: {
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
  imageUrl?: string;
}) {
  const isDragging = dragOffset.x !== 0 || dragOffset.y !== 0;
  const rotate = isDragging ? `rotate(${dragOffset.x * 0.04 - 0.6}deg)` : 'rotate(-0.6deg)';
  const translate = isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : '';

  const imageSrc = imageUrl ?? (concept.portrait?.startsWith('http') ? concept.portrait : undefined);
  const initials = concept.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const domColor = conceptDominant(concept.cats).css;

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
              {imageSrc ? (
                <img src={imageSrc} alt={concept.name} loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              ) : (
                <div style={{ position: 'absolute', inset: 0, background: domColor, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.25 }}/>
                  <span style={{
                    position: 'relative', fontFamily: "'Alfa Slab One', serif",
                    fontSize: 54, lineHeight: 1, color: 'var(--cit-cream)',
                    textShadow: '3px 3px 0 oklch(0% 0 0 / 0.4)', letterSpacing: '.02em',
                  }}>{initials || '★'}</span>
                </div>
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

          {/* Text → mini-encadrés */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 10 }}>
            {/* Description */}
            <div style={{
              background: 'var(--cit-paper)', borderLeft: '4px solid var(--cit-mustard)',
              padding: '8px 12px',
            }}>
              <p className="cit-typed" style={{ margin: 0, fontSize: 15, lineHeight: 1.62, color: 'var(--cit-navy-dk)' }}>
                {extract || concept.blurb}
              </p>
            </div>

            {/* Relations Wikidata */}
            {relations && relations.length > 0 && (
              <div style={{
                background: 'var(--cit-paper-dk)', border: '1.5px solid var(--cit-navy-dk)',
                borderLeft: '4px solid var(--cit-navy)', padding: '8px 12px',
              }}>
                <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 5, letterSpacing: '.1em' }}>
                  ★ RELATIONS WIKIDATA
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {relations.slice(0, 14).map((r, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
                      background: 'var(--cit-cream)', border: '2px solid var(--cit-navy-dk)',
                      fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
                      color: 'var(--cit-navy-dk)',
                    }}>
                      <span style={{ color: 'var(--cit-brick)', fontSize: 8.5, textTransform: 'uppercase' }}>{r.propertyLabel}</span>
                      <span style={{ textTransform: 'uppercase' }}>{r.targetLabel}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Catégories & Voir aussi : deux zones distinctes */}
            <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {/* Catégories — fond crème, liseré couleur dominante */}
              <div style={{
                flex: '1 1 140px', minWidth: 0, background: 'var(--cit-cream)',
                border: '1.5px solid var(--cit-navy-dk)', borderLeft: `5px solid ${domColor}`, padding: '6px 10px',
              }}>
                <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', letterSpacing: '.12em', marginBottom: 4 }}>CATÉGORIES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {concept.cats.map(([k]) => <CitCat key={k} catKey={k} small/>)}
                </div>
              </div>
              {/* Voir aussi — bloc navy, forme distincte */}
              {concept.refs.length > 0 && (
                <div style={{ flex: '1 1 140px', minWidth: 0, background: 'var(--cit-navy-dk)', padding: '6px 10px' }}>
                  <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-butter)', letterSpacing: '.12em', marginBottom: 4 }}>↗ VOIR AUSSI</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {concept.refs.map((r, i) => (
                      <span key={i} className="cit-condensed" style={{
                        fontSize: 9.5, padding: '2px 8px',
                        background: 'var(--cit-cream)', color: 'var(--cit-navy-dk)', border: '1.5px solid var(--cit-butter)', fontWeight: 600,
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}
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

const MODE_ACCENT: Partial<Record<SwipeMode, string>> = {
  random:   'var(--cit-navy-lt)',
  targeted: 'var(--cit-rust)',
  contrast: 'var(--cit-navy)',
};
const MODE_TAGLINE: Partial<Record<SwipeMode, string>> = {
  random:   'au hasard, large',
  targeted: 'thèmes & concepts',
  contrast: 'sortir de sa bulle',
};

function ModeSchema({ id, on }: { id: SwipeMode; on: boolean }) {
  const col = on ? 'var(--cit-cream)' : 'var(--cit-navy)';
  const s = { flexShrink: 0 } as const;
  if (id === 'random') return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill={col} stroke="none" style={s}>
      <circle cx="7" cy="8" r="2.4"/><circle cx="21" cy="6" r="2.4"/><circle cx="13" cy="15" r="2.4"/><circle cx="22" cy="20" r="2.4"/><circle cx="6" cy="21" r="2.4"/>
    </svg>
  );
  if (id === 'targeted') return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" stroke={col} strokeWidth="2" style={s}>
      <circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="5"/><circle cx="14" cy="14" r="1.6" fill={col} stroke="none"/>
    </svg>
  );
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" stroke={col} strokeWidth="2" style={s}>
      <circle cx="14" cy="14" r="10"/>
      <path d="M14 4 A10 10 0 0 0 14 24 Z" fill={col} stroke="none"/>
    </svg>
  );
}

function ModeBar({ mode, setMode, queueSize }: { mode: SwipeMode; setMode: (m: SwipeMode) => void; queueSize: number }) {
  return (
    <div style={{ padding: '12px 32px 10px', background: 'var(--cit-paper)', borderBottom: '2px solid var(--cit-navy-dk)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: 18, flexWrap: 'wrap' }}>
        {MODES.map(m => {
          const on = m.id === mode;
          const accent = MODE_ACCENT[m.id] ?? 'var(--cit-navy)';
          return (
            <button key={m.id} onClick={() => { playSound('modeChange'); setMode(m.id); }} style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              minWidth: 188, padding: '8px 18px',
              background: on ? 'var(--cit-navy-dk)' : 'var(--cit-cream)',
              color: on ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
              border: '2.5px solid var(--cit-navy-dk)', borderLeft: `7px solid ${accent}`,
              boxShadow: on ? `4px 4px 0 ${accent}` : 'none',
              opacity: on ? 1 : 0.72, cursor: 'pointer',
            }}>
              <ModeSchema id={m.id} on={on}/>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{m.label}</span>
                <span style={{ display: 'block', fontFamily: "'Special Elite', monospace", fontSize: 10, opacity: 0.8, lineHeight: 1.2 }}>{MODE_TAGLINE[m.id]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 7 }}>
        <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', letterSpacing: '.14em' }}>
          ★ PROCÉDURE · FILE : <span style={{ color: 'var(--cit-rust)', fontWeight: 700 }}>{queueSize}</span>
        </span>
      </div>
    </div>
  );
}

// ---- Mode-specific secondary banners ----

function CibleBanner({ entries, onAdd, onRemove, onWeight, mixThemes, onToggleMix, suggestions, loading }: {
  entries: Array<{ text: string; qid?: string; weight: number }>;
  onAdd: (t: string, qid?: string) => void;
  onRemove: (t: string) => void;
  onWeight: (t: string, w: number) => void;
  mixThemes: boolean;
  onToggleMix: () => void;
  suggestions: string[];
  loading: boolean;
}) {
  const free = suggestions.filter(s => !entries.some(e => e.text.toLowerCase() === s.toLowerCase())).slice(0, 6);
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
      </div>

      <div className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ COMMENT COMBINER VOS ENTRÉES ?</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {([['inter', '∩ Intersection', 'Concepts respectant TOUTES les entrées à la fois'], ['mix', '⇆ Mélange pondéré', 'Chaque entrée contribue selon son poids (curseurs)']] as const).map(([k, label, sub]) => {
          const on = (k === 'mix') === mixThemes;
          return (
            <button key={k} onClick={() => { if ((k === 'mix') !== mixThemes) onToggleMix(); }} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
              background: on ? 'var(--cit-cream)' : 'transparent',
              border: '2.5px solid var(--cit-navy-dk)',
              boxShadow: on ? '3px 3px 0 var(--cit-brick)' : 'none',
              opacity: on ? 1 : 0.55, cursor: 'pointer', padding: '5px 10px',
            }}>
              <SchemaMix kind={k}/>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--cit-navy-dk)' }}>{label}</span>
                <span style={{ display: 'block', fontFamily: "'Special Elite', monospace", fontSize: 9.5, color: 'var(--cit-navy-lt)', lineHeight: 1.2 }}>{sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <SchemaAnchor/>
        <span className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)' }}>★ CE QUI VOUS INTÉRESSE — famille (ses membres) ou concept précis (son voisinage) · choisissez dans la liste ou Entrée</span>
      </div>
      <InlineAddConcept
        onPick={c => onAdd(c.name, c.wikidataId)}
        onSubmitText={t => onAdd(t)}
        placeholder="guerre, instruments, Kant, Daft Punk…"/>

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {entries.map(e => (
            <span key={e.text} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px',
              background: 'var(--cit-cream)', border: '2.5px solid var(--cit-navy-dk)',
              boxShadow: '2px 2px 0 var(--cit-navy-dk)',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--cit-navy-dk)',
            }}>
              {e.text}
              {mixThemes && (
                <input type="range" min={5} max={100} value={e.weight} onChange={ev => onWeight(e.text, +ev.target.value)} style={{ width: 60 }} title={`Poids ${e.weight}%`}/>
              )}
              {mixThemes && <span style={{ color: 'var(--cit-brick)', fontSize: 10 }}>{e.weight}%</span>}
              <button onClick={() => onRemove(e.text)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cit-brick)', fontFamily: "'Alfa Slab One', serif", fontSize: 12 }}>✕</button>
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

      {entries.length === 0 && (
        <p className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', margin: '8px 0 0', fontStyle: 'italic' }}>
          Écrivez ce qui vous intéresse — une famille (« guerre ») ou un concept précis (« Kant »). Le Bureau trouve les concepts liés. Sans rien, on tire au hasard.
        </p>
      )}
    </div>
  );
}

function ContrastSchema({ id, on }: { id: ContrastSub; on: boolean }) {
  const col = on ? 'var(--cit-cream)' : 'var(--cit-navy)';
  const s = { flexShrink: 0 } as const;
  if (id === 'far') return (
    <svg width="26" height="24" viewBox="0 0 28 24" fill="none" stroke={col} strokeWidth="1.6" style={s}>
      <circle cx="8" cy="12" r="5" fill={col} stroke="none"/>
      <line x1="14" y1="12" x2="22" y2="7" strokeDasharray="2 2"/>
      <circle cx="23" cy="6" r="2.4"/>
    </svg>
  );
  // adopted / rejected : un point proche d'un amas
  return (
    <svg width="26" height="24" viewBox="0 0 28 24" fill="none" stroke={col} strokeWidth="1.6" style={s}>
      <circle cx="9" cy="12" r="5" fill={col} stroke="none"/>
      <circle cx="18" cy="12" r="2.6" fill={col} stroke="none"/>
      {id === 'rejected' && <path d="M5 8 L13 16 M13 8 L5 16" stroke="var(--cit-brick)" strokeWidth="2"/>}
    </svg>
  );
}

function ContrasteBanner({ sub, onSet }: { sub: ContrastSub; onSet: (s: ContrastSub) => void }) {
  return (
    <div style={{ padding: '10px 32px', background: 'var(--cit-paper-dk)', borderBottom: '2px solid var(--cit-navy-dk)', position: 'relative', zIndex: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: 14, flexWrap: 'wrap' }}>
        {CONTRAST_SUBS.map(s => {
          const on = s.id === sub;
          return (
            <button key={s.id} onClick={() => onSet(s.id)} title={s.hint} style={{
              display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', minWidth: 198, padding: '7px 14px',
              background: on ? 'var(--cit-navy-dk)' : 'var(--cit-cream)',
              color: on ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
              border: '2.5px solid var(--cit-navy-dk)', borderLeft: '7px solid var(--cit-rust)',
              boxShadow: on ? '4px 4px 0 var(--cit-rust)' : 'none', opacity: on ? 1 : 0.72, cursor: 'pointer',
            }}>
              <ContrastSchema id={s.id} on={on}/>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{s.label}</span>
                <span style={{ display: 'block', fontFamily: "'Special Elite', monospace", fontSize: 9.5, opacity: 0.8, lineHeight: 1.2 }}>{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Recherche de concept Wikidata (autocomplétion) → onPick. Réutilisé pour l'ajout direct et les ancrages. */
function InlineAddConcept({ onPick, onSubmitText, placeholder = 'Cherchez un concept : Spinoza, le jazz modal…', label }: { onPick: (c: Concept) => void; onSubmitText?: (t: string) => void; placeholder?: string; label?: string }) {
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
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && q.trim() && onSubmitText) { onSubmitText(q.trim()); setQ(''); setResults([]); setOpen(false); }
  };
  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      {label ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '2.5px dashed var(--cit-navy-dk)', background: 'var(--cit-cream)', boxShadow: '3px 3px 0 var(--cit-navy-dk)' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, flexShrink: 0, background: 'var(--cit-brick)', color: 'var(--cit-cream)', border: '2px solid var(--cit-navy-dk)', fontFamily: "'Alfa Slab One', serif", fontSize: 22, lineHeight: 1, boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>+</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKey}
              placeholder={placeholder}
              style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)', padding: '2px 0' }}/>
          </div>
          {busy && <span className="cit-condensed cit-pulse-brick" style={{ fontSize: 10, color: 'var(--cit-brick)', whiteSpace: 'nowrap' }}>★ …</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={placeholder}
            style={{
              flex: 1, padding: '7px 12px', border: '2.5px solid var(--cit-navy-dk)',
              background: 'var(--cit-cream)', fontFamily: "'Special Elite', monospace",
              fontSize: 13, color: 'var(--cit-navy-dk)',
            }}/>
          {busy && <span className="cit-condensed cit-pulse-brick" style={{ fontSize: 10, color: 'var(--cit-brick)', whiteSpace: 'nowrap' }}>★ RECHERCHE…</span>}
        </div>
      )}
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

/** Contraintes de pioche (plusieurs possibles, intersection), valables dans toutes les procédures. */
function ConstraintPanel({ constraints, onAdd, onRemove }: { constraints: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
  const [input, setInput] = useState('');
  const active = constraints.length > 0;
  const submit = () => { const v = input.trim(); if (v) { onAdd(v); setInput(''); } };
  return (
    <div style={{ marginBottom: 2 }}>
      {/* Bandeau en entonnoir (trapèze qui se rétrécit) → métaphore du filtrage */}
      <div style={{
        background: active ? 'var(--cit-brick)' : 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
        clipPath: 'polygon(0 0, 100% 0, 82% 100%, 18% 100%)',
        padding: '8px 14px 12px', textAlign: 'center',
        fontFamily: "'Alfa Slab One', serif", fontSize: 13, letterSpacing: '.04em',
      }}>
        ▽ CONTRAINDRE LA PIOCHE
      </div>
      <div style={{ textAlign: 'center', color: active ? 'var(--cit-brick)' : 'var(--cit-navy-dk)', marginTop: -3, fontSize: 13, lineHeight: 1 }}>▼</div>
      <div style={{
        background: 'var(--cit-paper)', border: '2.5px solid var(--cit-navy-dk)', borderTop: '4px solid var(--cit-brick)',
        padding: '8px 12px', boxShadow: '3px 3px 0 var(--cit-navy-dk)',
      }}>
        <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', lineHeight: 1.35, marginBottom: 6 }}>
          Ne garde que ces <strong>types</strong> — cumulez-en plusieurs pour affiner très finement.
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="personnages, objets, livres…"
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '6px 10px',
              border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
              fontFamily: "'Special Elite', monospace", fontSize: 12, color: 'var(--cit-navy-dk)',
            }}/>
          <CitButton size="sm" tone="brick" onClick={submit}>+</CitButton>
        </div>
        {constraints.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {constraints.map(c => (
              <span key={c} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 5px 3px 9px',
                background: 'var(--cit-brick)', color: 'var(--cit-cream)',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
              }}>
                ▽ {c}
                <button onClick={() => onRemove(c)} title="Retirer" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cit-cream)', fontFamily: "'Alfa Slab One', serif", fontSize: 11 }}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const [entries, setEntries] = useState<Array<{ text: string; qid?: string; weight: number }>>([]);
  const [mixThemes, setMixThemes] = useState(false);
  const [contrastSub, setContrastSub] = useState<ContrastSub>('far');
  const [savedThemes, setSavedThemes] = useState<string[]>([]);
  const [targetedLoading, setTargetedLoading] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const incognitoRef = useRef(incognito);
  incognitoRef.current = incognito;
  const [constraints, setConstraints] = useState<string[]>([]);
  const addConstraint = (t: string) => { const v = t.trim(); if (v) setConstraints(prev => prev.some(x => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]); };
  const removeConstraint = (t: string) => setConstraints(prev => prev.filter(x => x !== t));

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
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
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

  // Mode Ciblé — entrées libres (un thème OU un concept précis) ; chaque ajout
  // est mémorisé dans la bibliothèque de contraintes pour les suggestions.
  const addEntry = (text: string, qid?: string) => {
    const t = text.trim();
    if (!t || entries.some(x => x.text.toLowerCase() === t.toLowerCase())) return;
    setEntries(prev => [...prev, { text: t, qid, weight: 50 }]);
    recordConstraintUsage(t).then(() => getAllConstraints().then(cs => setSavedThemes(cs.sort((a, b) => b.useCount - a.useCount).map(c => c.text))));
  };
  const removeEntry = (text: string) => setEntries(prev => prev.filter(x => x.text !== text));
  const setEntryWeight = (text: string, w: number) => setEntries(prev => prev.map(x => x.text === text ? { ...x, weight: w } : x));

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
    if (mode === 'random' && constraints.length === 0) { swipe.setDeck(rawDeck); return; }
    let cancelled = false;
    (async () => {
      setTargetedLoading(true);
      try {
        const excluded = await getExcludedConceptIds();
        let fresh: Concept[] = mode === 'random' ? rawDeck : [];

        if (mode === 'targeted') {
          if (entries.length === 0) {
            fresh = rawDeck;
          } else {
            // Chaque entrée = membres (si famille) + voisinage (si concept précis), fusionnés.
            const per = await Promise.all(entries.map(e => fetchConceptsForEntry(e.text, mixThemes ? 18 : 30, e.qid)));
            if (entries.length === 1) {
              fresh = per[0];
            } else if (mixThemes) {
              fresh = interleaveWeighted(per, entries.map(e => e.weight));
            } else {
              // Intersection : concepts présents dans TOUTES les entrées
              const sets = per.map(list => new Set(list.map(c => c.id)));
              const inter = (per[0] ?? []).filter(c => sets.every(s => s.has(c.id)));
              fresh = inter.length >= 3 ? inter : interleaveWeighted(per, entries.map(e => e.weight));
            }
            if (fresh.length === 0) fresh = rawDeck;
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

        // Contraintes (toutes procédures) : restreint à l'intersection des types Wikidata
        if (constraints.length > 0) {
          const allowed = await fetchConceptsByConstraintsLive(constraints, 80);
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
  }, [mode, entries, mixThemes, contrastSub, constraints, rawDeck.length, adopted.length]);

  // Variété dans TOUS les modes : à mesure qu'on swipe, recharge un lot frais
  // (avec pagination/décalage) et l'ajoute à la pioche — évite le bouclage partout.
  const lastRefillRef = useRef(0);
  const refillPageRef = useRef(0);
  useEffect(() => { refillPageRef.current = 0; }, [mode, entries, constraints, contrastSub]);
  useEffect(() => {
    const total = swipe.counts.valid + swipe.counts.reject + swipe.counts.skip;
    if (total === 0 || total % 15 !== 0 || total === lastRefillRef.current) return;
    lastRefillRef.current = total;
    const page = ++refillPageRef.current;
    (async () => {
      try {
        const excluded = await getExcludedConceptIds();
        let batch: Concept[] = [];
        if (constraints.length > 0) {
          batch = await fetchConceptsByConstraintsLive(constraints, 24, page * 24);
        } else if (mode === 'targeted' && entries.length > 0) {
          const per = await Promise.all(entries.map(e => fetchConceptsForEntry(e.text, 16, e.qid, page * 16)));
          batch = per.flat();
        } else if (mode === 'contrast' && contrastSub !== 'far') {
          const src = contrastSub === 'adopted' ? adopted : await getConceptsByVerdict('reject');
          const qids = src.slice(0, 8).map(c => c.wikidataId).filter((q): q is string => !!q);
          batch = qids.length ? await fetchNeighborConcepts(qids, 30) : [];
        } else {
          batch = await fetchRandomConcepts(20);
        }
        batch = batch.filter(c => !excluded.has(c.id));
        if (batch.length) { await Promise.all(batch.map(c => cacheConcept(c))); swipe.appendDeck(batch); }
      } catch { /* ignore */ }
    })();
  }, [swipe.counts, mode, entries, contrastSub, constraints, adopted]);

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

  // Relations Wikidata + description longue + meilleure image de la carte courante (cache 30j)
  useEffect(() => {
    setCurrentRelations([]);
    setCurrentExtract(null);
    setCurrentImage(null);
    if (!current) return;
    let cancelled = false;
    if (current.wikidataId) {
      fetchSemanticRelations(current.wikidataId).then(r => { if (!cancelled) setCurrentRelations(r); }).catch(() => {});
    }
    fetchWikipediaExtract(current.name).then(ext => { if (!cancelled && ext) setCurrentExtract(ext); }).catch(() => {});
    if (!current.portrait?.startsWith('http')) {
      fetchConceptImage(current.wikidataId, current.name).then(u => { if (!cancelled && u) setCurrentImage(u); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [current?.id]);

  // Raccourcis clavier : « F » fiche complète · « T » étiquette rapide
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!current) return;
      if (e.key === 'f' || e.key === 'F') setDetailOpen(o => !o);
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setTagOpen(o => !o); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [current]);

  // Étiquette rapide sur la carte courante (sans ouvrir la fiche)
  const submitTag = async () => {
    const t = tagInput.trim();
    if (!t || !current) { setTagOpen(false); return; }
    await cacheConcept(current);
    await addTagToConcept(current.id, t).catch(() => {});
    setTagInput('');
    setTagOpen(false);
    toast.show({ tone: 'success', title: 'Étiquette ajoutée', body: `« ${t} » → ${current.name}.` });
  };

  // Per-mode card props
  const cardProps = (() => {
    if (!current) return {};
    switch (mode) {
      case 'random':
        return { sourceOverride: 'TIRAGE ALÉATOIRE', badge: <PixelDie size={18}/> };
      case 'targeted': {
        const label = entries.map(e => e.text).join(mixThemes ? ' / ' : ' ∩ ');
        return { sourceOverride: label ? `Ciblé · ${label}` : 'Ciblé · écrivez ce qui vous intéresse' };
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
          <button onClick={toggleIncognito} title={incognito ? 'INCOGNITO : vos décisions sont privées (exclues d’un univers partagé). Cliquez pour repasser en public.' : 'PUBLIC : vos décisions peuvent être partagées. Cliquez pour passer en incognito (privé).'} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: incognito ? 'var(--cit-brick)' : 'transparent',
            color: incognito ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
            border: `2.5px solid ${incognito ? 'var(--cit-brick)' : 'var(--cit-navy-dk)'}`,
            padding: '5px 12px', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
            letterSpacing: '.12em', textTransform: 'uppercase',
            boxShadow: incognito ? '2px 2px 0 var(--cit-navy-dk)' : 'none',
          }}>
            <EyeIcon off={incognito}/>
            {incognito ? 'Incognito · privé' : 'Public · visible'}
          </button>
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
          entries={entries}
          onAdd={addEntry}
          onRemove={removeEntry}
          onWeight={setEntryWeight}
          mixThemes={mixThemes}
          onToggleMix={() => setMixThemes(v => !v)}
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
              {mode === 'targeted' && <><strong>CIBLÉ.</strong> Écrivez ce qui vous intéresse (une famille comme « guerre » ou un concept précis comme « Kant ») : le Bureau pioche les concepts liés. Filtrez par type avec la contrainte à droite.</>}
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
          <CitPanel title="Raccourcis">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 13, background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', border: '2px solid var(--cit-navy-dk)', padding: '2px 9px', boxShadow: '2px 2px 0 var(--cit-brick)' }}>F</kbd>
                <span className="cit-typed" style={{ fontSize: 11.5, color: 'var(--cit-navy-dk)' }}>Ouvrir la <strong>fiche complète</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <kbd style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 13, background: 'var(--cit-rust)', color: 'var(--cit-cream)', border: '2px solid var(--cit-navy-dk)', padding: '2px 9px', boxShadow: '2px 2px 0 var(--cit-navy-dk)' }}>T</kbd>
                <span className="cit-typed" style={{ fontSize: 11.5, color: 'var(--cit-navy-dk)' }}>Poser une <strong>étiquette</strong> sur la carte</span>
              </div>
            </div>
          </CitPanel>
        </div>

        {/* Card column */}
        <div>
          <InlineAddConcept onPick={addOwnConcept} label="Ajouter votre propre concept"/>
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
                imageUrl={currentImage ?? undefined}
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

          {current && tagOpen && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>
              <input
                autoFocus
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitTag(); else if (e.key === 'Escape') { setTagOpen(false); setTagInput(''); } }}
                placeholder={`Étiquette pour « ${current.name} »…`}
                style={{
                  flex: '0 1 340px', padding: '7px 12px', border: '2.5px solid var(--cit-rust)',
                  background: 'var(--cit-cream)', fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)',
                }}/>
              <CitButton size="sm" tone="brick" onClick={submitTag}>✎ Étiqueter</CitButton>
            </div>
          )}

          {current && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
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
              <button onClick={() => setTagOpen(o => !o)} style={{
                background: tagOpen ? 'var(--cit-rust)' : 'transparent',
                color: tagOpen ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
                border: '2.5px solid var(--cit-navy-dk)',
                padding: '9px 18px',
                fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 700,
                letterSpacing: '.14em', textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '3px 3px 0 var(--cit-navy-dk)',
              }}>✎ Étiqueter <span style={{ opacity: 0.65, fontSize: 11 }}>· touche T</span></button>
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
          <ConstraintPanel constraints={constraints} onAdd={addConstraint} onRemove={removeConstraint}/>
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
