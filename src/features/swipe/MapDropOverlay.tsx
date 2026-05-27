import { useEffect, useState } from 'react';
import type { Concept, SwipeVerdict } from '../../types';
import { DomainBlob, domainZone, dominantCat, domainColor, DOMAIN_ORDER } from '../../lib/domainArt';
import { useConceptImage, spriteStyle } from '../../services/sprites';

const VERDICT_RING: Record<SwipeVerdict, string> = {
  valid:  'oklch(52% 0.13 150)',
  reject: 'var(--cit-brick)',
  skip:   'var(--cit-navy-lt)',
};
const VERDICT_TITLE: Record<SwipeVerdict, (n: string) => string> = {
  valid:  (n) => `★ ${n} rejoint votre univers`,
  reject: (n) => `${n} · écarté`,
  skip:   (n) => `${n} · mis de côté`,
};

/**
 * Overlay bref affiché à chaque swipe : une mini-map apparaît, le concept
 * « tombe » dans la zone de son domaine, puis l'overlay disparaît.
 * Non bloquant (pointerEvents: none) → on peut continuer à swiper dessous.
 */
export function MapDropOverlay({ concept, verdict, onDone }: { concept: Concept; verdict: SwipeVerdict; onDone: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'land' | 'out'>('enter');
  const img = useConceptImage(concept);
  const st = spriteStyle(concept);
  const cat = dominantCat(concept.cats);
  const zone = domainZone(cat, concept.id);
  const ring = VERDICT_RING[verdict];

  useEffect(() => {
    const r = requestAnimationFrame(() => setPhase('land'));
    const t1 = setTimeout(() => setPhase('out'), 950);
    const t2 = setTimeout(onDone, 1250);
    return () => { cancelAnimationFrame(r); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entering = phase === 'enter';
  const out = phase === 'out';

  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none',
      display: 'grid', placeItems: 'center',
      background: out ? 'transparent' : 'oklch(0% 0 0 / 0.18)',
      transition: 'background .3s ease',
    }}>
      <div style={{
        position: 'relative', width: 'min(340px, 78vw)', aspectRatio: '1 / 1',
        background: 'radial-gradient(circle at 50% 50%, var(--cit-paper) 0%, var(--cit-paper-dk) 100%)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow: '6px 6px 0 var(--cit-navy-dk)',
        overflow: 'hidden',
        transform: out ? 'scale(0.92)' : 'scale(1)',
        opacity: out ? 0 : 1,
        transition: 'opacity .3s ease, transform .3s ease',
      }}>
        {/* Grille */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background:
            'repeating-linear-gradient(0deg, oklch(0% 0 0 / 0.05) 0 1px, transparent 1px 28px),' +
            'repeating-linear-gradient(90deg, oklch(0% 0 0 / 0.05) 0 1px, transparent 1px 28px)' }}/>

        {/* Zones de domaine */}
        {DOMAIN_ORDER.map(k => {
          const z = domainZone(k);
          return <DomainBlob key={k} cat={k} leftPct={z.x} topPct={z.y} sizePct={34}/>;
        })}

        {/* Libellé */}
        <div style={{
          position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center',
          fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: '.16em',
          color: 'var(--cit-navy-lt)', textTransform: 'uppercase',
        }}>★ Votre univers</div>

        {/* Onde au point d'atterrissage */}
        <div style={{
          position: 'absolute', left: `${zone.x}%`, top: `${zone.y}%`,
          width: 54, height: 54, marginLeft: -27, marginTop: -27,
          borderRadius: '50%', border: `2.5px solid ${ring}`,
          opacity: entering ? 0 : out ? 0 : 0.7,
          transform: `scale(${entering ? 0.2 : 1.6})`,
          transition: 'transform .7s ease-out .15s, opacity .7s ease-out .15s',
          pointerEvents: 'none',
        }}/>

        {/* Marqueur du concept */}
        <div style={{
          position: 'absolute',
          left: entering ? '50%' : `${zone.x}%`,
          top: entering ? '46%' : `${zone.y}%`,
          width: 38, height: 38, marginLeft: -19, marginTop: -19,
          borderRadius: '50%', overflow: 'hidden',
          border: `3px solid ${ring}`,
          background: img ? 'var(--cit-cream)' : st.color,
          display: 'grid', placeItems: 'center',
          boxShadow: '2px 2px 0 var(--cit-navy-dk)',
          transform: `scale(${entering ? 0.4 : 1})`,
          opacity: entering ? 0 : 1,
          transition: 'left .6s cubic-bezier(.2,.85,.25,1), top .6s cubic-bezier(.2,.85,.25,1), transform .6s cubic-bezier(.2,.85,.25,1), opacity .3s ease',
          zIndex: 2,
        }}>
          {img
            ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            : <span style={{ fontSize: 18, lineHeight: 1 }}>{st.glyph}</span>}
        </div>

        {/* Bandeau titre */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
          padding: '7px 10px', textAlign: 'center',
          fontFamily: "'Oswald', sans-serif", fontSize: 11.5, fontWeight: 700,
          letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{VERDICT_TITLE[verdict](concept.name)}</div>
      </div>
    </div>
  );
}
