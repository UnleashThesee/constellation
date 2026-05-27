import { useEffect, useRef } from 'react';
import type { TreatedEntry } from './useSwipeDeck';
import { spriteStyle, useSprite } from '../../services/sprites';
import type { Concept, SwipeVerdict } from '../../types';

const RING: Record<SwipeVerdict, string> = {
  valid:  'oklch(52% 0.13 150)', // vert sourd = adopté
  reject: 'var(--cit-brick)',
  skip:   'var(--cit-navy-lt)',
};
const VERDICT_FILTER: Record<SwipeVerdict, string> = {
  valid:  'none',
  reject: 'grayscale(0.55)',
  skip:   'grayscale(0.7)',
};
const VERDICT_OPACITY: Record<SwipeVerdict, number> = { valid: 1, reject: 0.7, skip: 0.55 };

/** Vignette d'un concept : sprite IA si disponible, sinon placeholder de domaine. */
export function ConceptSprite({ concept, size = 44, delayMs = 0 }: { concept: Concept; size?: number; delayMs?: number }) {
  const url = useSprite(concept, delayMs);
  const st = spriteStyle(concept);
  return (
    <div style={{
      width: size, height: size, display: 'grid', placeItems: 'center',
      background: url ? 'var(--cit-cream)' : st.color,
      borderRadius: 5, overflow: 'hidden',
    }}>
      {url
        ? <img src={url} alt={concept.name} width={size} height={size} style={{ imageRendering: 'pixelated', width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }}>{st.glyph}</span>}
    </div>
  );
}

export function SwipeQueue({ items }: { items: TreatedEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-défile vers la dernière vignette ajoutée.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [items.length]);

  return (
    <div style={{
      background: 'var(--cit-paper-dk)',
      borderTop: '3px solid var(--cit-navy-dk)',
      display: 'flex', alignItems: 'stretch', minHeight: 72,
    }}>
      {/* Étiquette latérale */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 12px', background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
        flexShrink: 0, minWidth: 64,
      }}>
        <span style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 13, lineHeight: 1 }}>FILE</span>
        <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-cream)', letterSpacing: '.08em' }}>
          {items.length} traité{items.length > 1 ? 's' : ''}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="cit-typed" style={{
          flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px',
          fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic',
        }}>
          Traitez une carte — elle tombe ici, dans votre file de concepts.
        </div>
      ) : (
        <div ref={scrollRef} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', overflowX: 'auto', overflowY: 'hidden',
        }}>
          {items.map((e, i) => {
            const ring = RING[e.verdict];
            const isLast = i === items.length - 1;
            return (
              <div
                key={`${e.concept.id}-${i}`}
                title={`${e.concept.name} · ${e.verdict === 'valid' ? (e.fav ? 'favori' : 'adopté') : e.verdict === 'reject' ? 'rejeté' : 'passé'}`}
                className={isLast ? 'cit-queue-pop' : undefined}
                style={{
                  position: 'relative', flexShrink: 0,
                  border: `2.5px solid ${ring}`, borderRadius: 6,
                  boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                  filter: VERDICT_FILTER[e.verdict], opacity: VERDICT_OPACITY[e.verdict],
                }}
              >
                <ConceptSprite concept={e.concept} size={44} />
                {e.fav && (
                  <span style={{
                    position: 'absolute', top: -7, right: -7, fontSize: 13,
                    filter: 'drop-shadow(0 1px 0 var(--cit-navy-dk))',
                  }}>⭐</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
