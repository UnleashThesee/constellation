import { useEffect, useMemo, useState } from 'react';
import type { Concept, SwipeVerdict, CategoryKey } from '../../types';
import { DomainBlob, dominantCat } from '../../lib/domainArt';
import { conceptDominant } from '../../lib/categories';
import { useConceptImage, spriteStyle } from '../../services/sprites';
import { computeForceLayout } from '../map/forceLayout';
import { getAdoptedConcepts, getFilterState } from '../../stores/db';

type SeedMap = Record<string, { x: number; y: number; size: number }>;
type FxKind = 'favorite' | 'valid' | 'reject' | 'skip';

const VERDICT_RING: Record<SwipeVerdict, string> = {
  valid:  'oklch(52% 0.13 150)',
  reject: 'var(--cit-brick)',
  skip:   'var(--cit-navy-lt)',
};
const VERDICT_TITLE: Record<SwipeVerdict, (n: string) => string> = {
  valid:  (n) => `★ ${n} rejoint votre univers`,
  reject: (n) => `${n} · écarté de votre univers`,
  skip:   (n) => `${n} · mis de côté`,
};

// Cache court : évite de relire IndexedDB à chaque swipe rapide.
let universeCache: { at: number; concepts: Concept[]; seed: SeedMap | undefined } | null = null;
async function loadUniverse(): Promise<{ concepts: Concept[]; seed: SeedMap | undefined }> {
  if (universeCache && Date.now() - universeCache.at < 2500) return universeCache;
  const [concepts, seed] = await Promise.all([
    getAdoptedConcepts(),
    getFilterState<SeedMap>('map.positions'),
  ]);
  universeCache = { at: Date.now(), concepts, seed };
  return universeCache;
}

interface NodeView { id: string; x: number; y: number; size: number; cats: string[]; dom: CategoryKey; color: string; name: string; fav: boolean; isNew: boolean }

/**
 * Overlay d'atterrissage : à chaque swipe, on voit son univers EN GRAND avec
 * tous les concepts déjà placés (positions réelles de la carto), et le concept
 * swipé se pose à sa vraie place parmi ses voisins, mis en avant. Puis retour
 * au deck. Non bloquant (pointerEvents: none).
 */
export function MapDropOverlay({ concept, verdict, fav = false, onDone }: { concept: Concept; verdict: SwipeVerdict; fav?: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'focus' | 'out'>('hidden');
  const [sink, setSink] = useState(false);
  const [universe, setUniverse] = useState<{ concepts: Concept[]; seed: SeedMap | undefined } | null>(null);
  const img = useConceptImage(concept);
  const st = spriteStyle(concept);
  const kind: FxKind = fav ? 'favorite' : verdict;
  const ring = fav ? 'var(--cit-mustard)' : VERDICT_RING[verdict];

  useEffect(() => {
    let alive = true;
    loadUniverse().then(u => { if (alive) setUniverse(u); }).catch(() => { if (alive) setUniverse({ concepts: [], seed: undefined }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const r = requestAnimationFrame(() => setPhase('in'));
    const t1 = setTimeout(() => setPhase('focus'), 360);
    // Rejet : le concept tombe dans un trou peu après s'être posé.
    const tSink = verdict === 'reject' && !fav ? setTimeout(() => setSink(true), 1050) : undefined;
    const t2 = setTimeout(() => setPhase('out'), 1750);
    const t3 = setTimeout(onDone, 2100);
    return () => { cancelAnimationFrame(r); clearTimeout(t1); if (tSink) clearTimeout(tSink); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodes = useMemo<NodeView[]>(() => {
    if (!universe) return [];
    const others = universe.concepts.filter(c => c.id !== concept.id);
    const all = [...others, concept];
    const seed = universe.seed;
    const items = all.map(c => ({ id: c.id, cats: c.cats.map(([k]) => k as string), isFavorite: !!c.isFavorite }));
    const needCompute = !seed || all.some(c => !seed[c.id]);
    const computed = needCompute ? computeForceLayout(items, { seed, iterations: all.length > 250 ? 24 : 48 }) : [];
    const cpos = new Map(computed.map(p => [p.id, p]));
    const out = all.map(c => {
      const s = seed?.[c.id];
      const cp = cpos.get(c.id);
      // existants : position sauvegardée (fidèle à la carto) ; nouveau : position calculée
      const pos = c.id === concept.id ? (cp ?? s ?? { x: 50, y: 50, size: 18 }) : (s ?? cp ?? { x: 50, y: 50, size: 16 });
      return {
        id: c.id, x: pos.x, y: pos.y, size: 'size' in pos ? pos.size : 16,
        cats: c.cats.map(([k]) => k as string), dom: dominantCat(c.cats),
        color: conceptDominant(c.cats).css, name: c.name, fav: !!c.isFavorite, isNew: c.id === concept.id,
      };
    });
    return out.length > 600 ? out.filter(n => n.isNew).concat(out.filter(n => !n.isNew).slice(0, 599)) : out;
  }, [universe, concept]);

  const newNode = nodes.find(n => n.isNew);

  const regions = useMemo(() => {
    const g = new Map<CategoryKey, { x: number; y: number }[]>();
    for (const n of nodes) (g.get(n.dom) ?? g.set(n.dom, []).get(n.dom)!).push({ x: n.x, y: n.y });
    return [...g.entries()].map(([cat, pts]) => {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const sp = Math.sqrt(pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / pts.length);
      return { cat, x: cx, y: cy, size: Math.min(70, Math.max(22, sp * 2.6 + 16)) };
    });
  }, [nodes]);

  const edges = useMemo(() => {
    if (!newNode) return [];
    const newCats = new Set(concept.cats.map(([k]) => k as string));
    return nodes
      .filter(n => !n.isNew && n.cats.some(k => newCats.has(k)))
      .map(n => ({ x: n.x, y: n.y, d: Math.hypot(n.x - newNode.x, n.y - newNode.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 14);
  }, [nodes, newNode, concept]);

  const visible = phase !== 'hidden' && phase !== 'out';
  const lit = phase === 'focus' || phase === 'out';

  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none',
      display: 'grid', placeItems: 'center', padding: 16,
      background: visible ? 'oklch(0% 0 0 / 0.34)' : 'transparent',
      transition: 'background .34s ease',
    }}>
      <div style={{
        position: 'relative', width: 'min(97vw, 1280px)', height: 'min(90vh, 880px)',
        background: 'radial-gradient(circle at 50% 50%, var(--cit-paper) 0%, var(--cit-paper-dk) 100%)',
        border: '3px solid var(--cit-navy-dk)', boxShadow: '8px 8px 0 var(--cit-navy-dk)',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.96)',
        transition: 'opacity .34s ease, transform .34s ease',
      }}>
        {/* Grille + halftones */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background:
            'repeating-linear-gradient(0deg, oklch(0% 0 0 / 0.04) 0 1px, transparent 1px 30px),' +
            'repeating-linear-gradient(90deg, oklch(0% 0 0 / 0.04) 0 1px, transparent 1px 30px)' }}/>
        <div className="cit-halftone" style={{ position: 'absolute', top: 10, right: 10, width: 80, height: 80, opacity: 0.5 }}/>
        <div className="cit-halftone" style={{ position: 'absolute', bottom: 10, left: 10, width: 80, height: 80, opacity: 0.5 }}/>
        <div style={{ position: 'absolute', top: 8, left: 12, fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: '.18em', color: 'var(--cit-navy-lt)', textTransform: 'uppercase' }}>
          ★ VOTRE UNIVERS · {nodes.length} NŒUD{nodes.length > 1 ? 'S' : ''}
        </div>

        {/* Régions thématiques */}
        {regions.map(r => <DomainBlob key={r.cat} cat={r.cat} leftPct={r.x} topPct={r.y} sizePct={r.size} intensity={0.7}/>)}

        {/* Liaisons du nouveau concept à ses voisins */}
        {newNode && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} preserveAspectRatio="none">
            {edges.map((e, i) => (
              <line key={i} x1={`${newNode.x}%`} y1={`${newNode.y}%`} x2={`${e.x}%`} y2={`${e.y}%`}
                stroke={ring} strokeWidth={1.5} strokeDasharray="3 3"
                style={{ opacity: lit ? 0.7 : 0, transition: 'opacity .4s ease' }}/>
            ))}
          </svg>
        )}

        {/* Nœuds existants */}
        {nodes.filter(n => !n.isNew).map(n => {
          const d = Math.max(10, n.size * 0.62);
          return (
            <div key={n.id} style={{
              position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, width: d, height: d,
              marginLeft: -d / 2, marginTop: -d / 2, borderRadius: '50%',
              background: n.color, border: '2px solid var(--cit-navy-dk)',
              boxShadow: '0 0 0 2px oklch(96% 0.025 90 / 0.55)',
              opacity: visible ? (lit ? 0.62 : 0.92) : 0,
              transition: 'opacity .4s ease',
            }}/>
          );
        })}

        {/* Marqueur du nouveau concept + effets selon le verdict + libellé */}
        {newNode && (
          <>
            {/* Couche d'effets, centrée sur le point d'atterrissage */}
            <div style={{ position: 'absolute', left: `${newNode.x}%`, top: `${newNode.y}%`, width: 0, height: 0, zIndex: 4, pointerEvents: 'none' }}>
              {lit && <VerdictFx kind={kind}/>}
            </div>

            <div style={{
              position: 'absolute', left: `${newNode.x}%`, top: `${newNode.y}%`,
              width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: '50%',
              overflow: 'hidden', border: `3px solid ${ring}`,
              background: img ? 'var(--cit-cream)' : st.color,
              display: 'grid', placeItems: 'center', zIndex: 5,
              boxShadow: kind === 'favorite' ? `0 0 14px var(--cit-mustard), 2px 2px 0 var(--cit-navy-dk)` : '2px 2px 0 var(--cit-navy-dk)',
              filter: kind === 'skip' && lit ? 'grayscale(0.7)' : undefined,
              transform: `scale(${lit ? 1 : 0.2})`,
              opacity: lit ? 1 : 0,
              transition: 'transform .5s cubic-bezier(.2,1.3,.4,1), opacity .35s ease',
              animation: sink ? 'md-sink .6s cubic-bezier(.5,0,.9,.4) forwards' : undefined,
            }}>
              {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                   : <span style={{ fontSize: 18, lineHeight: 1 }}>{st.glyph}</span>}
            </div>
            <div style={{
              position: 'absolute', left: `${newNode.x}%`, top: `${newNode.y}%`,
              transform: 'translate(-50%, 26px)', zIndex: 5,
              fontFamily: "'Alfa Slab One', serif", fontSize: 14, color: 'var(--cit-navy-dk)',
              whiteSpace: 'nowrap', textShadow: '1px 1px 0 var(--cit-cream), -1px 1px 0 var(--cit-cream)',
              opacity: lit && !sink ? 1 : 0, transition: 'opacity .4s ease .1s', pointerEvents: 'none',
            }}>{concept.name}</div>
          </>
        )}

        {/* Bandeau */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: 'var(--cit-navy-dk)', color: kind === 'favorite' ? 'var(--cit-mustard)' : 'var(--cit-butter)',
          padding: '8px 12px', textAlign: 'center',
          fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 700,
          letterSpacing: '.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{fav ? `★ ${concept.name} — coup de cœur !` : VERDICT_TITLE[verdict](concept.name)}</div>
      </div>
    </div>
  );
}

// Projectiles répartis en cercle autour du point d'atterrissage.
function burst(n: number, dist: number, child: (i: number) => React.ReactNode): React.ReactNode[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const r = dist * (0.7 + Math.random() * 0.5);
    const style: React.CSSProperties = { animationDelay: `${Math.random() * 0.12}s` };
    (style as Record<string, string>)['--dx'] = `${Math.cos(a) * r}px`;
    (style as Record<string, string>)['--dy'] = `${Math.sin(a) * r}px`;
    return <span key={i} className="md-burst" style={style}>{child(i)}</span>;
  });
}

/** Effets visuels selon le choix : éclairs (favori), étincelles (adopté), trou (rejet), onde neutre (passé). */
function VerdictFx({ kind }: { kind: FxKind }) {
  if (kind === 'favorite') return (
    <>
      <div className="md-ring" style={{ width: 76, height: 76, border: '4px solid var(--cit-mustard)', boxShadow: '0 0 0 1.5px var(--cit-navy-dk)' }}/>
      {[0, 45, 90, 135, 180, 225, 270, 315].map(r => {
        const s: React.CSSProperties = {};
        (s as Record<string, string>)['--rot'] = `${r}deg`;
        return (
          <svg key={r} className="md-bolt" width="18" height="70" viewBox="0 0 18 70" style={s}>
            <polyline points="10,2 4,29 12,32 5,68" fill="none" stroke="var(--cit-navy-dk)" strokeWidth="5.5" strokeLinejoin="round" strokeLinecap="round"/>
            <polyline points="10,2 4,29 12,32 5,68" fill="none" stroke="var(--cit-mustard)" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
        );
      })}
      {burst(10, 76, () => <span style={{ fontSize: 18, lineHeight: 1, color: 'var(--cit-mustard)', textShadow: '0 0 2px var(--cit-navy-dk), 1px 1px 0 var(--cit-navy-dk)' }}>★</span>)}
    </>
  );
  if (kind === 'valid') return (
    <>
      <div className="md-ring" style={{ width: 66, height: 66, border: '3px solid oklch(52% 0.13 150)' }}/>
      {burst(14, 66, () => <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: 'oklch(55% 0.15 150)' }}/>)}
    </>
  );
  if (kind === 'reject') return (
    <>
      <div className="md-hole" style={{ width: 96, height: 96,
        background: 'radial-gradient(circle, oklch(0% 0 0) 32%, oklch(0% 0 0 / 0.55) 62%, transparent 76%)',
        boxShadow: 'inset 0 0 14px oklch(0% 0 0)' }}/>
      {burst(8, 56, () => <span style={{ display: 'block', width: 6, height: 10, background: 'var(--cit-brick)', transform: 'rotate(15deg)' }}/>)}
    </>
  );
  return <div className="md-ring" style={{ width: 58, height: 58, border: '2.5px dashed var(--cit-navy-lt)' }}/>;
}
