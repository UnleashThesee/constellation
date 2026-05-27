import { useState, useEffect, useMemo, useRef } from 'react';
import { useSwipeDeck } from './useSwipeDeck';
import { SwipeQueue } from './SwipeQueue';
import { Sunburst, Stamp, PixelDie, Aster, SkeletonCard } from '../../components/ui/atoms';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { ConceptDetailModal } from '../../components/ui/ConceptDetailModal';
import { CATEGORIES, CATEGORY_LIST, gradientForWeights, conceptDominant, combinationMix } from '../../lib/categories';
import { DomainBackdrop, dominantCat } from '../../lib/domainArt';
import { MapDropOverlay } from './MapDropOverlay';
import { fetchRandomConcepts, fetchNeighborConcepts, fetchConceptsForConstraints, filterConceptsByConstraints, fetchConceptsForEntry, searchConcepts, fetchSemanticRelations, fetchWikipediaExtract, fetchConceptImage, type SemanticRelation } from '../../services/wikidata';
import { getAdoptedConcepts, getExcludedConceptIds, cacheConcept, toggleFavorite, getCachedConcept, getSettings, saveSettings, getConceptsByVerdict, recordConstraintUsage, getAllConstraints, addTagToConcept, db } from '../../stores/db';
import { useToast } from '../../lib/toast';
import { playSound } from '../../lib/sounds';
import { consumePendingSwipeDeck } from '../../lib/pending';
import { embedConcepts, centroid, cosineSim, embeddingsStatus } from '../../services/embeddings';
import type { Concept, SwipeMode, CategoryKey, SwipeVerdict, AppSettings } from '../../types';
import { buildAiCrossConcepts } from '../../services/llm';

// Contrôles flottants de l'interface immersive v3
const ROUND_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  minWidth: 38, height: 38, padding: '0 12px', borderRadius: 999,
  background: 'rgba(0,0,0,.3)', color: 'var(--cit-cream)', border: '2px solid var(--cit-butter)',
  cursor: 'pointer', fontFamily: "'Alfa Slab One', serif", fontSize: 16, lineHeight: 1,
};
const MINI_LINK_BTN: React.CSSProperties = {
  background: 'rgba(0,0,0,.35)', color: 'var(--cit-cream)', border: '2px solid var(--cit-butter)',
  padding: '5px 13px', cursor: 'pointer', borderRadius: 999,
  fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
};
const MODE_SHORT: Record<string, string> = { random: 'Aléa', targeted: 'Ciblé', contrast: 'Contraste' };
const NAV_ITEMS: Array<{ id: string; label: string }> = [
  { id: 'swipe', label: '★ Le Swipe' },
  { id: 'map', label: 'Cartographie' },
  { id: 'combine', label: 'Combiner' },
  { id: 'ideas', label: 'Idées' },
  { id: 'favs', label: 'Favoris' },
  { id: 'search', label: 'Recherche' },
  { id: 'constraints', label: 'Contraintes' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'settings', label: 'Réglages' },
];

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
  ai: 'Croisement IA',
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

// Couronne de lauriers (clin d'œil au cartouche MGM), dessinée en SVG.
function Laurel({ width = 200, color = 'var(--cit-mustard)' }: { width?: number; color?: string }) {
  const branch = (mirror: boolean) => {
    const leaves = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = (-86 + t * 78) * Math.PI / 180;
      const R = 64;
      let x = 100 + R * Math.cos(a);
      let y = 64 + R * Math.sin(a);
      let rot = a * 180 / Math.PI + 96;
      if (mirror) { x = 200 - x; rot = 180 - rot; }
      leaves.push(<ellipse key={(mirror ? 'r' : 'l') + i} cx={x} cy={y} rx={8.5} ry={3.2}
        transform={`rotate(${rot} ${x} ${y})`} fill={color} opacity={0.95 - t * 0.12}/>);
    }
    return leaves;
  };
  return (
    <svg width={width} height={width * 0.34} viewBox="0 0 200 68" style={{ display: 'block', margin: '10px auto 0', opacity: 0.92 }} aria-hidden="true">
      {branch(false)}{branch(true)}
      <circle cx={100} cy={60} r={3.4} fill={color}/>
    </svg>
  );
}

function CitizenCard({ concept, tilt, dragOffset, animClass, onPointerDown, sourceOverride, badge, contrast, isFavorite, onToggleFavorite, extract, imageUrl }: {
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
  const rotate = isDragging ? `rotate(${dragOffset.x * 0.03}deg)` : 'rotate(0deg)';
  const translate = isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : '';

  const imageSrc = imageUrl ?? (concept.portrait?.startsWith('http') ? concept.portrait : undefined);
  const initials = concept.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const domColor = conceptDominant(concept.cats).css;
  const catKey = dominantCat(concept.cats);
  const source = sourceOverride ?? SOURCE_LABELS[concept.sourceKind ?? 'random'] ?? 'Sélection aléatoire';

  const RINGS = 'radial-gradient(circle at 50% 50%,'
    + ' var(--cit-navy-dk) 0 63.5%,'
    + ' var(--cit-butter) 63.5% 66%,'
    + ' var(--cit-navy-dk) 66% 68%,'
    + ' var(--cit-mustard) 68% 78%,'
    + ' var(--cit-brick) 78% 81%,'
    + ' var(--cit-navy-dk) 81% 90%,'
    + ' var(--cit-butter) 90% 93%,'
    + ' var(--cit-mustard) 93% 100%)';

  return (
    <div
      className={animClass || ''}
      style={{
        position: 'relative',
        width: 'min(74vh, 94vw, 700px)',
        height: 'min(74vh, 94vw, 700px)',
        transform: `${translate} ${rotate}`.trim(),
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'transform .28s cubic-bezier(.2,.7,.3,1)',
      }}
      onPointerDown={onPointerDown}
    >
      {/* Cible / bullseye : anneaux concentriques */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: RINGS,
        boxShadow: '0 22px 60px rgba(0,0,0,.55), inset 0 0 0 3px var(--cit-navy-dk)',
      }}>
        <div className="cit-halftone" style={{ position: 'absolute', inset: 0, borderRadius: '50%', opacity: 0.08, pointerEvents: 'none' }}/>
      </div>

      {contrast && (
        <span className="cit-pulse-brick" style={{ position: 'absolute', inset: -10, zIndex: 12, borderRadius: '50%', border: '3px dashed var(--cit-brick)', pointerEvents: 'none' }}/>
      )}

      {/* Disque central — contenu */}
      <div style={{
        position: 'absolute', inset: '18%', borderRadius: '50%',
        background: 'var(--cit-paper)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow: 'inset 0 0 0 4px var(--cit-butter), inset 0 0 24px rgba(0,0,0,.12)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '7% 13%',
      }}>
        <DomainBackdrop cat={catKey} baseOpacity={0.06} motifOpacity={0.14}/>
        {onToggleFavorite && (
          <button onClick={onToggleFavorite} title="Favori" style={{
            position: 'absolute', top: '12%', right: '15%', zIndex: 3,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 20, lineHeight: 1, color: isFavorite ? 'var(--cit-brick)' : 'var(--cit-navy-lt)',
          }}>{isFavorite ? '★' : '☆'}</button>
        )}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
          <div className="cit-condensed" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9.5, letterSpacing: '.07em', color: 'var(--cit-brick)', textTransform: 'uppercase' }}>
            {badge}<span>★ {source} ★</span>
          </div>
          <div style={{
            width: 'clamp(56px, 13vmin, 104px)', aspectRatio: '1 / 1', borderRadius: '50%',
            border: '3px solid var(--cit-mustard)', background: 'var(--cit-butter)',
            boxShadow: '0 0 0 3px var(--cit-navy-dk)', overflow: 'hidden', position: 'relative', margin: '2px 0',
          }}>
            {imageSrc ? (
              <img src={imageSrc} alt={concept.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: domColor, display: 'grid', placeItems: 'center' }}>
                <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.25 }}/>
                <span style={{ position: 'relative', fontFamily: "'Alfa Slab One', serif", fontSize: 'clamp(20px,6vmin,40px)', color: 'var(--cit-cream)', textShadow: '2px 2px 0 rgba(0,0,0,.4)' }}>{initials || '★'}</span>
              </div>
            )}
          </div>
          <h2 className="cit-h1" style={{
            margin: '2px 0 0', fontSize: 'clamp(22px, 4.6vmin, 42px)', lineHeight: 0.95,
            color: 'var(--cit-navy-dk)', wordBreak: 'break-word',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          } as React.CSSProperties}>
            {concept.name}<span style={{ color: 'var(--cit-brick)' }}>!</span>
          </h2>
          <div className="cit-condensed" style={{ fontSize: 'clamp(9px,1.7vmin,12px)', color: 'var(--cit-navy-lt)', letterSpacing: '.06em' }}>
            {concept.kind}{concept.years ? ` · ${concept.years}` : ''}
          </div>
          <p className="cit-typed" style={{
            margin: '5px 0 0', fontSize: 'clamp(11px, 1.9vmin, 15px)', lineHeight: 1.5, color: 'var(--cit-navy-dk)',
            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          } as React.CSSProperties}>
            {extract || concept.blurb}
          </p>
          {concept.aiGenerated && (
            <div className="cit-condensed" style={{ marginTop: 2, fontSize: 9, letterSpacing: '.07em', color: 'var(--cit-brick)' }}>
              ✦ PROPOSÉ PAR L'IA{concept.sourceWork ? ` · ${concept.sourceWork.name}` : ''}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 5 }}>
            {concept.cats.slice(0, 3).map(([k]) => <CitCat key={k} catKey={k} small/>)}
          </div>
        </div>
      </div>

      {/* Lauriers MGM, chevauchant le bas de l'anneau */}
      <div style={{ position: 'absolute', left: '50%', bottom: '4%', transform: 'translateX(-50%)', zIndex: 2, width: '52%', pointerEvents: 'none' }}>
        <Laurel width={320} color="var(--cit-butter)"/>
      </div>

      {/* Verdict overlays */}
      {tilt === 'left' && (<div style={{ position: 'absolute', top: '34%', left: '50%', transform: 'translate(-50%,-50%) rotate(-12deg)', zIndex: 6, pointerEvents: 'none' }}><Stamp tone="brick" size={32}>Retour à l'expéditeur</Stamp></div>)}
      {tilt === 'right' && (<div style={{ position: 'absolute', top: '34%', left: '50%', transform: 'translate(-50%,-50%) rotate(10deg)', zIndex: 6, pointerEvents: 'none' }}><Stamp tone="navy" size={32}>Bienvenue !</Stamp></div>)}
      {tilt === 'up' && (<div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(-3deg)', zIndex: 6, pointerEvents: 'none' }}><Stamp tone="mustard" size={30}>★ Coup de cœur</Stamp></div>)}
      {tilt === 'down' && (<div style={{ position: 'absolute', top: '62%', left: '50%', transform: 'translate(-50%,-50%) rotate(2deg)', zIndex: 6, pointerEvents: 'none' }}><Stamp tone="navy" size={30}>Neutre</Stamp></div>)}
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
      padding: '7px 24px 8px', background: 'var(--cit-butter)',
      borderBottom: '2px solid var(--cit-navy-dk)', position: 'relative', zIndex: 3,
    }}>
      {/* Ligne compacte : titre · saisie · bascule combinaison */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', whiteSpace: 'nowrap', letterSpacing: '.06em' }}>★ CIBLER ›</span>
        <div style={{ flex: '1 1 280px', minWidth: 200 }}>
          <InlineAddConcept
            onPick={c => onAdd(c.name, c.wikidataId)}
            onSubmitText={t => onAdd(t)}
            placeholder="guerre, instruments, Kant… (famille ou concept précis)"/>
        </div>
        {entries.length >= 2 && (
          <div style={{ display: 'inline-flex', border: '2px solid var(--cit-navy-dk)', flexShrink: 0 }}>
            {([['inter', '∩ Intersection'], ['mix', '⇆ Mélange']] as const).map(([k, label]) => {
              const on = (k === 'mix') === mixThemes;
              return (
                <button key={k} onClick={() => { if ((k === 'mix') !== mixThemes) onToggleMix(); }}
                  title={k === 'inter' ? 'Concepts respectant TOUTES les entrées à la fois' : 'Doser le % de chaque entrée avec les curseurs sur les puces'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', cursor: 'pointer',
                    background: on ? 'var(--cit-navy-dk)' : 'transparent', color: on ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
                    border: 'none', borderRight: k === 'inter' ? '2px solid var(--cit-navy-dk)' : 'none',
                    fontFamily: "'Oswald', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                  }}><SchemaMix kind={k}/> {label}</button>
              );
            })}
          </div>
        )}
        {loading && <span className="cit-condensed cit-pulse-brick" style={{ fontSize: 10, color: 'var(--cit-brick)', flexShrink: 0 }}>★ WIKIDATA…</span>}
      </div>
      {entries.length >= 2 && mixThemes && (
        <div className="cit-typed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)', margin: '4px 0 0', fontStyle: 'italic' }}>
          Mélange : réglez le poids (%) de chaque entrée avec les curseurs sur les puces ci-dessous.
        </div>
      )}

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
          position: 'absolute', top: '100%', right: 0, zIndex: 20,
          minWidth: 'max(100%, 300px)', maxWidth: 380,
          background: 'var(--cit-cream)', border: '2.5px solid var(--cit-navy-dk)',
          boxShadow: '4px 4px 0 var(--cit-navy-dk)', maxHeight: 300, overflow: 'auto',
        }}>
          {results.map(c => (
            <button key={c.id} onClick={() => pick(c)} style={{
              display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
              border: 'none', borderBottom: '1px dashed var(--cit-navy-dk)', cursor: 'pointer',
              padding: '7px 12px', fontFamily: "'Oswald', sans-serif",
            }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--cit-navy-dk)' }}>{c.name}</span>
              {c.blurb && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--cit-navy-lt)', fontFamily: "'Special Elite', monospace", lineHeight: 1.3, marginTop: 1, whiteSpace: 'normal' }}>{c.blurb}</span>}
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
function ConstraintPanel({ constraints, onAdd, onRemove, note, onAiComplete, aiBusy, llmReady }: { constraints: Array<{ text: string; qid?: string }>; onAdd: (t: string, qid?: string) => void; onRemove: (t: string) => void; note: string; onAiComplete?: () => void; aiBusy?: boolean; llmReady?: boolean }) {
  const active = constraints.length > 0;
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
          Ne garde que ces <strong>types</strong> — choisissez dans la liste pour viser le bon concept.
        </div>
        <InlineAddConcept
          onPick={c => onAdd(c.name, c.wikidataId)}
          onSubmitText={t => onAdd(t)}
          placeholder="personnages, objets, livres…"/>
        {constraints.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {constraints.map(c => (
              <span key={c.text} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 5px 3px 9px',
                background: 'var(--cit-brick)', color: 'var(--cit-cream)',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
              }}>
                ▽ {c.text}
                <button onClick={() => onRemove(c.text)} title="Retirer" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cit-cream)', fontFamily: "'Alfa Slab One', serif", fontSize: 11 }}>✕</button>
              </span>
            ))}
          </div>
        )}
        {note === 'empty' && (
          <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-brick)', lineHeight: 1.35, marginTop: 8, fontStyle: 'italic' }}>
            ⚠ Ce type n'a pas de concepts dans Wikidata (les <em>citations</em>, par ex., n'y sont pas répertoriées comme objets).
          </div>
        )}
        {note === 'widen' && (
          <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-brick)', lineHeight: 1.35, marginTop: 8, fontStyle: 'italic' }}>
            ⚠ Aucune carte ne croise cette contrainte avec vos critères — on élargit au type seul.
          </div>
        )}
        {note === 'ai' && (
          <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy)', lineHeight: 1.35, marginTop: 8, fontStyle: 'italic' }}>
            ✦ Croisement complété par l'IA — cartes marquées « IA », sourcées à leur œuvre.
          </div>
        )}
        {onAiComplete && (
          <>
            <button onClick={onAiComplete} disabled={aiBusy} title={llmReady ? 'Compléter ce croisement avec votre LLM' : 'Configurez votre clé API dans Réglages'} style={{
              marginTop: 8, width: '100%', padding: '7px 10px', cursor: aiBusy ? 'wait' : 'pointer',
              background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', border: '2.5px solid var(--cit-navy-dk)',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
              boxShadow: '2px 2px 0 var(--cit-brick)', opacity: aiBusy ? 0.7 : 1,
            }}>
              {aiBusy ? '✦ Génération…' : '✦ Compléter avec l\'IA'}
            </button>
            {!llmReady && (
              <div className="cit-typed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', marginTop: 4, fontStyle: 'italic' }}>
                Nécessite votre clé API (Réglages).
              </div>
            )}
          </>
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

export function SwipeScreenV3({ onTabChange }: { onTabChange?: (id: string) => void }) {
  const [mode, setMode] = useState<SwipeMode>('random');
  const [loading, setLoading] = useState(true);
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [constraintOpen, setConstraintOpen] = useState(false);
  // Mode Ciblé : thèmes (texte libre, résolus via Wikidata) + ancrage + intersection/mélange
  const [entries, setEntries] = useState<Array<{ text: string; qid?: string; weight: number }>>([]);
  const [mixThemes, setMixThemes] = useState(false);
  const [contrastSub, setContrastSub] = useState<ContrastSub>('far');
  const [savedThemes, setSavedThemes] = useState<string[]>([]);
  const [targetedLoading, setTargetedLoading] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const incognitoRef = useRef(incognito);
  incognitoRef.current = incognito;
  const [constraints, setConstraints] = useState<Array<{ text: string; qid?: string }>>([]);
  const [constraintNote, setConstraintNote] = useState('');
  // Complément IA d'un croisement maigre (clé LLM de l'utilisateur, cf. Réglages).
  const [aiBusy, setAiBusy] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const aiSettingsRef = useRef<AppSettings | null>(null);
  const aiAttemptKeyRef = useRef<string>('');
  const addConstraint = (t: string, qid?: string) => { const v = t.trim(); if (v) setConstraints(prev => prev.some(x => x.text.toLowerCase() === v.toLowerCase()) ? prev : [...prev, { text: v, qid }]); };
  const removeConstraint = (t: string) => setConstraints(prev => prev.filter(x => x.text !== t));

  const [drop, setDrop] = useState<{ concept: Concept; verdict: SwipeVerdict; fav: boolean; key: number } | null>(null);
  const swipe = useSwipeDeck(
    [],
    () => setDetailOpen(true),
    () => incognitoRef.current,
    (e) => setDrop({ concept: e.concept, verdict: e.verdict, fav: e.fav, key: Date.now() }),
  );
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

  // Alerte bulle contextuelle : uniquement les paliers (positifs). Pas d'alerte de saturation.
  const contextualAlert = (() => {
    const totalAdopted = adopted.length;
    if (totalAdopted >= 200 && totalAdopted < 210) return { tone: 'milestone' as const, text: `★ Palier atteint : ${totalAdopted} concepts adoptés !` };
    if (totalAdopted >= 100 && totalAdopted < 110) return { tone: 'milestone' as const, text: `★ Cap des 100 concepts franchi !` };
    if (totalAdopted >= 50 && totalAdopted < 55) return { tone: 'milestone' as const, text: `★ Cap des 50 concepts. Pensez au Boost.` };
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
      aiSettingsRef.current = s ?? null;
      setLlmReady(!!s?.llmKey?.trim());
    });
    getAllConstraints().then(cs => setSavedThemes(cs.sort((a, b) => b.useCount - a.useCount).map(c => c.text)));
  }, []);

  const enableSemanticContrast = async () => {
    setSemanticEnabled(true);
    await saveSettings({ semanticContrastEnabled: true });
  };

  // Complément IA manuel : génère des concepts au croisement (thèmes × contraintes),
  // ancrés à une source réelle, et les ajoute à la pioche.
  const completeWithAi = async () => {
    if (aiBusy) return;
    const s = aiSettingsRef.current;
    if (!s?.llmKey?.trim()) {
      toast.show({ tone: 'warning', title: 'Clé IA manquante', body: 'Ajoutez votre clé API dans Réglages pour utiliser le complément IA.' });
      return;
    }
    const themes = entries.map(e => e.text);
    const cons = constraints.map(c => c.text);
    if (themes.length === 0 && cons.length === 0) {
      toast.show({ tone: 'warning', title: 'Rien à croiser', body: 'Ajoutez un thème (mode Ciblé) et/ou une contrainte.' });
      return;
    }
    setAiBusy(true);
    try {
      const exclude = [...swipe.deck.map(c => c.name), ...swipe.treatedLog.map(t => t.concept.name)];
      const ai = await buildAiCrossConcepts({ settings: s, themes, constraints: cons, exclude, count: 10 });
      if (ai.length > 0) {
        await Promise.all(ai.map(c => cacheConcept(c)));
        swipe.appendDeck(ai);
        toast.show({ tone: 'success', title: `★ ${ai.length} carte${ai.length > 1 ? 's' : ''} ajoutée${ai.length > 1 ? 's' : ''} par l'IA` });
      } else {
        toast.show({ tone: 'warning', title: 'Aucun résultat IA', body: "L'IA n'a pas trouvé d'item vérifiable pour ce croisement." });
      }
    } catch (e) {
      toast.show({ tone: 'warning', title: 'Échec du complément IA', body: e instanceof Error ? e.message : 'Erreur inconnue.' });
    } finally {
      setAiBusy(false);
    }
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
      } catch {
        // Hors-ligne / échec : repli sur quelques fiches, mélangées (pas toujours les mêmes)
        setRawDeck([...FALLBACK_CONCEPTS].sort(() => Math.random() - 0.5));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    getAdoptedConcepts().then(c => {
      setAdopted(c);
    });
  }, [swipe.counts.valid]);

  // Deck piloté par le mode (#refonte) :
  //  · random  → pool aléatoire tel quel
  //  · targeted → thèmes (Wikidata, intersection ou mélange) + ancrage optionnel
  //  · contrast → sous-mode loin de tout / proche adoptés / proche rejetés
  // Fallback silencieux sur le pool aléatoire si rien ne remonte.
  useEffect(() => {
    if (rawDeck.length === 0) return;
    if (mode === 'random' && constraints.length === 0) {
      swipe.setDeck(rawDeck.filter(c => !swipe.treatedIds.has(c.id)));
      return;
    }
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

        // Contraintes : restreint au(x) type(s) Wikidata demandé(s).
        if (constraints.length > 0) {
          const themed = (mode === 'targeted' && entries.length > 0) || mode === 'contrast';
          if (themed && fresh.length > 0) {
            // Croise le thème avec la contrainte : on garde les concepts du thème
            // QUI SONT du type voulu (ex. « objets liés aux héros »).
            const filtered = await filterConceptsByConstraints(fresh, constraints, 120);
            if (filtered.length >= 1) {
              fresh = filtered;
              if (!cancelled) setConstraintNote('');
            } else {
              // Aucun concept du thème n'est de ce type : on élargit au type seul.
              const allowed = await fetchConceptsForConstraints(constraints, 80);
              if (!cancelled) setConstraintNote(allowed.length === 0 ? 'empty' : 'widen');
              fresh = allowed;
            }
          } else {
            // Sans thème (aléatoire) : pioche d'items du type demandé.
            const allowed = await fetchConceptsForConstraints(constraints, 80);
            const ids = new Set(allowed.map(c => c.wikidataId).filter(Boolean));
            const inter = fresh.filter(c => c.wikidataId && ids.has(c.wikidataId));
            if (!cancelled) setConstraintNote(allowed.length === 0 ? 'empty' : '');
            fresh = inter.length >= 1 ? inter : allowed;
          }
        } else if (!cancelled) {
          setConstraintNote('');
        }

        // Complément IA (auto) : croisement thème × contrainte trop maigre côté Wikidata.
        const aiKey = `${mode}|${entries.map(e => e.text).join(',')}|${constraints.map(c => c.text).join(',')}`;
        if (mode === 'targeted' && entries.length > 0 && constraints.length > 0
            && fresh.length < 6 && aiSettingsRef.current?.llmKey?.trim()
            && aiAttemptKeyRef.current !== aiKey) {
          aiAttemptKeyRef.current = aiKey;
          try {
            const exclude = [...fresh.map(c => c.name), ...swipe.treatedLog.map(t => t.concept.name)];
            const ai = await buildAiCrossConcepts({
              settings: aiSettingsRef.current, themes: entries.map(e => e.text),
              constraints: constraints.map(c => c.text), exclude, count: 10,
            });
            if (!cancelled && ai.length > 0) {
              const have = new Set(fresh.map(c => c.id));
              fresh = [...fresh, ...ai.filter(c => !have.has(c.id))];
              setConstraintNote('ai');
            }
          } catch { /* clé invalide / quota : on garde le résultat Wikidata */ }
        }

        fresh = fresh.filter(c => !excluded.has(c.id) && !swipe.treatedIds.has(c.id));
        if (!cancelled) {
          if (fresh.length >= 1) {
            await Promise.all(fresh.map(c => cacheConcept(c)));
            swipe.setDeck(fresh);
          } else {
            // Repli : pioche aléatoire MAIS sans les cartes déjà traitées
            const clean = rawDeck.filter(c => !excluded.has(c.id) && !swipe.treatedIds.has(c.id));
            swipe.setDeck(clean);
          }
        }
      } catch {
        if (!cancelled) swipe.setDeck(rawDeck.filter(c => !swipe.treatedIds.has(c.id)));
      } finally {
        if (!cancelled) setTargetedLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // On NE met PAS `adopted` en dépendance : sinon chaque adoption relancerait
    // cet effet et reconstruirait toute la pioche (cartes déjà vues qui
    // reviennent). Les modes Contraste se reconstruisent au changement de
    // sous-mode et se regarnissent via l'effet de refill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entries, mixThemes, contrastSub, constraints, rawDeck.length]);

  // Variété dans TOUS les modes : à mesure qu'on swipe, recharge un lot frais
  // (avec pagination/décalage) et l'ajoute à la pioche — évite le bouclage partout.
  const lastRefillRef = useRef(0);
  const refillPageRef = useRef(0);
  const refillBusyRef = useRef(false);
  useEffect(() => { refillPageRef.current = 0; }, [mode, entries, constraints, contrastSub]);
  useEffect(() => {
    const total = swipe.counts.valid + swipe.counts.reject + swipe.counts.skip;
    // Réapprovisionne par paliers (tous les 15 swipes) OU dès que la pioche
    // descend bas — les cartes traitées étant retirées, la pioche se vide,
    // il faut donc la regarnir avant qu'elle ne soit épuisée.
    const milestone = total > 0 && total % 15 === 0 && total !== lastRefillRef.current;
    // « pioche basse » : seulement après le 1er swipe, pour ne pas déclencher
    // un fetch parasite au démarrage (deck transitoirement à 0 avant setDeck).
    const low = rawDeck.length > 0 && total > 0 && swipe.deck.length <= 6;
    if (!milestone && !low) return;
    if (refillBusyRef.current) return;
    if (milestone) lastRefillRef.current = total;
    refillBusyRef.current = true;
    const page = ++refillPageRef.current;
    (async () => {
      try {
        const excluded = await getExcludedConceptIds();
        let batch: Concept[] = [];
        if (constraints.length > 0) {
          batch = await fetchConceptsForConstraints(constraints, 24, page * 24);
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
        batch = batch.filter(c => !excluded.has(c.id) && !swipe.treatedIds.has(c.id));
        if (batch.length) { await Promise.all(batch.map(c => cacheConcept(c))); swipe.appendDeck(batch); }
      } catch { /* ignore */ } finally { refillBusyRef.current = false; }
    })();
  }, [swipe.counts, swipe.deck.length, rawDeck.length, mode, entries, contrastSub, constraints, adopted]);

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
          .filter(c => candVecs.has(c.id) && !swipe.treatedIds.has(c.id))
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
    <div className="citizen" style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: 'radial-gradient(circle at 50% 36%, var(--cit-navy) 0%, var(--cit-navy-dk) 72%)' }}>
      <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none' }}/>

      {/* Barre flottante minimale */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 45, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
          <button onClick={() => { setMenuOpen(o => !o); setConstraintOpen(false); }} title="Menu" style={ROUND_BTN}>≡</button>
          <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,.28)', borderRadius: 999, padding: 3, border: '2px solid var(--cit-butter)' }}>
            {(['random', 'targeted', 'contrast'] as SwipeMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                cursor: 'pointer', border: 'none', borderRadius: 999, padding: '5px 12px',
                fontFamily: "'Oswald', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                background: mode === m ? 'var(--cit-butter)' : 'transparent',
                color: mode === m ? 'var(--cit-navy-dk)' : 'var(--cit-cream)',
              }}>{MODE_SHORT[m]}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
          {boostLabel && <Stamp tone="brick" rotate={-3}>★ BOOST {Math.min(boostInitial - swipe.deck.length + 1, boostInitial)}/{boostInitial}</Stamp>}
          <button onClick={toggleIncognito} title={incognito ? 'Incognito · privé' : 'Public · visible'} style={{ ...ROUND_BTN, background: incognito ? 'var(--cit-brick)' : ROUND_BTN.background, color: incognito ? 'var(--cit-cream)' : ROUND_BTN.color }}><EyeIcon off={incognito}/></button>
          <button onClick={() => { setConstraintOpen(o => !o); setMenuOpen(false); }} title="Contraindre / compléter la pioche" style={{ ...ROUND_BTN, background: (constraints.length > 0 || constraintOpen) ? 'var(--cit-brick)' : ROUND_BTN.background, color: (constraints.length > 0 || constraintOpen) ? 'var(--cit-cream)' : ROUND_BTN.color }}>▽{constraints.length > 0 ? ` ${constraints.length}` : ''}</button>
        </div>
      </div>

      {/* Backdrop de fermeture des popovers */}
      {(menuOpen || constraintOpen) && (
        <div onClick={() => { setMenuOpen(false); setConstraintOpen(false); }} style={{ position: 'absolute', inset: 0, zIndex: 30 }}/>
      )}

      {/* Menu de navigation */}
      {menuOpen && (
        <div style={{ position: 'absolute', top: 58, left: 16, zIndex: 40, background: 'var(--cit-cream)', border: '3px solid var(--cit-navy-dk)', boxShadow: '5px 5px 0 var(--cit-navy-dk)', minWidth: 196 }}>
          {NAV_ITEMS.map(it => (
            <button key={it.id} onClick={() => { setMenuOpen(false); if (it.id !== 'swipe') onTabChange?.(it.id); }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
              background: it.id === 'swipe' ? 'var(--cit-butter)' : 'transparent', border: 'none', borderBottom: '1px solid var(--cit-navy-dk)',
              cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cit-navy-dk)',
            }}>{it.label}</button>
          ))}
        </div>
      )}

      {/* Popover contrainte / IA */}
      {constraintOpen && (
        <div style={{ position: 'absolute', top: 58, right: 16, zIndex: 40, width: 360, maxWidth: '92vw' }}>
          <div style={{ background: 'var(--cit-cream)', border: '3px solid var(--cit-navy-dk)', boxShadow: '5px 5px 0 var(--cit-navy-dk)', padding: 10, maxHeight: '80vh', overflow: 'auto' }}>
            <ConstraintPanel constraints={constraints} onAdd={addConstraint} onRemove={removeConstraint} note={constraintNote} onAiComplete={completeWithAi} aiBusy={aiBusy} llmReady={llmReady}/>
            <div style={{ marginTop: 8 }}>
              <InlineAddConcept onPick={addOwnConcept} label="Ajouter votre propre concept"/>
            </div>
          </div>
        </div>
      )}

      {/* Saisie ciblage / contraste (compacte) */}
      {(mode === 'targeted' || mode === 'contrast') && (
        <div style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 25, width: 'min(680px, 94vw)' }}>
          {mode === 'targeted' && (
            <CibleBanner entries={entries} onAdd={addEntry} onRemove={removeEntry} onWeight={setEntryWeight} mixThemes={mixThemes} onToggleMix={() => setMixThemes(v => !v)} suggestions={savedThemes} loading={targetedLoading}/>
          )}
          {mode === 'contrast' && <ContrasteBanner sub={contrastSub} onSet={setContrastSub}/>}
        </div>
      )}

      {/* Scène centrale : médaillon */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '60px 12px 104px' }}>
        {loading && !current ? (
          <div style={{ width: 'min(70vh,92vw,660px)', aspectRatio: '1 / 1', borderRadius: '50%', background: 'var(--cit-navy)', border: '3px solid var(--cit-navy-dk)', display: 'grid', placeItems: 'center' }}>
            <span className="cit-condensed" style={{ color: 'var(--cit-cream)', letterSpacing: '.22em', fontSize: 12 }}>CHARGEMENT…</span>
          </div>
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
        ) : (
          <div className="cit-script" style={{ color: 'var(--cit-cream)', fontSize: 24 }}>Plus de cartes pour le moment…</div>
        )}
      </div>

      {/* Étiquetage (overlay) */}
      {current && tagOpen && (
        <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 35, display: 'flex', gap: 8, background: 'var(--cit-cream)', border: '2.5px solid var(--cit-rust)', padding: 8, boxShadow: '3px 3px 0 var(--cit-navy-dk)' }}>
          <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTag(); else if (e.key === 'Escape') { setTagOpen(false); setTagInput(''); } }} placeholder={`Étiquette pour « ${current.name} »…`} style={{ flex: '0 1 320px', padding: '7px 12px', border: '2px solid var(--cit-navy-dk)', background: 'var(--cit-paper)', fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)' }}/>
          <CitButton size="sm" tone="brick" onClick={submitTag}>✎</CitButton>
        </div>
      )}

      {/* Actions flottantes */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '0 0 14px' }}>
        {current && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setDetailOpen(true)} style={MINI_LINK_BTN}>★ Fiche <span style={{ opacity: 0.55 }}>F</span></button>
            <button onClick={() => setTagOpen(o => !o)} style={{ ...MINI_LINK_BTN, ...(tagOpen ? { background: 'var(--cit-rust)' } : {}) }}>✎ Étiqueter <span style={{ opacity: 0.55 }}>T</span></button>
          </div>
        )}
        <CitizenActions onAction={(v) => {
          if (v === 'back') {
            if (!swipe.canBack) { toast.show({ tone: 'warning', title: 'Limite de retour arrière', body: 'Vous ne pouvez pas remonter au-delà de 10 actions ou avant le début de la session.' }); return; }
            swipe.back();
          } else if (v === 'favorite') { swipe.favorite(); } else { swipe.cycle(v); }
        }}/>
      </div>

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

      {drop && (
        <MapDropOverlay key={drop.key} concept={drop.concept} verdict={drop.verdict} fav={drop.fav} onDone={() => setDrop(null)}/>
      )}
    </div>
  );
}
