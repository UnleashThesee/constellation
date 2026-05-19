import type { Concept } from '../../types';
import { CATEGORIES, gradientForWeights, dominantColor } from '../../lib/categories';

const SOURCE_LABELS: Record<string, { label: string; sym: string }> = {
  linked:   { label: 'LIÉ',         sym: '↳' },
  random:   { label: 'ALÉATOIRE',   sym: '?' },
  explore:  { label: 'EXPLORATION', sym: '✧' },
  contrast: { label: 'CONTRASTE',   sym: '⇌' },
  cross:    { label: 'CROISEMENT',  sym: '⊕' },
};

function SourceTag({ kind }: { kind?: string }) {
  const meta = SOURCE_LABELS[kind ?? 'random'] ?? SOURCE_LABELS.random;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: 'var(--amber)',
      padding: '3px 8px', border: '1px solid var(--amber-dim)',
      background: 'oklch(10% 0.01 150 / 0.6)',
    }}>
      <span style={{ fontFamily: 'var(--display)', fontSize: 14, lineHeight: 1 }}>{meta.sym}</span>
      {meta.label}
    </span>
  );
}

function CatChip({ catKey }: { catKey: string }) {
  const c = CATEGORIES[catKey as keyof typeof CATEGORIES];
  if (!c) return null;
  return (
    <span className="cst-chip">
      <i className="cst-led" style={{ background: c.oklch, boxShadow: `0 0 6px ${c.oklch}` }} />
      {c.label}
    </span>
  );
}

interface Props {
  concept: Concept;
  tilt?: 'right' | 'left' | 'up' | null;
  dragOffset?: { x: number; y: number };
  animClass?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  compact?: boolean;
}

export function ConceptCard({ concept, tilt, dragOffset, animClass, onPointerDown, compact = false }: Props) {
  const gradient = gradientForWeights(concept.cats);
  const dominant = dominantColor(concept.cats);

  const tiltClass = tilt === 'right' ? 'tilting--right'
    : tilt === 'left' ? 'tilting--left'
    : tilt === 'up' ? 'tilting--up' : '';

  const dx = dragOffset?.x ?? 0;
  const dy = dragOffset?.y ?? 0;
  const isDragging = dx !== 0 || dy !== 0;

  return (
    <div
      className={`cst-card-shell ${animClass ?? ''}`}
      style={{
        '--card-gradient': gradient,
        '--card-glow': dominant,
        transform: isDragging ? `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)` : undefined,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'transform .25s cubic-bezier(.2,.7,.3,1)',
      } as React.CSSProperties}
      onPointerDown={onPointerDown}
    >
      <div className={`cst-card cst-enter ${tiltClass}`}>
        {/* Verdict overlays */}
        <div className="cst-verdict cst-verdict--reject">REJET</div>
        <div className="cst-verdict cst-verdict--valid">GARDE</div>
        <div className="cst-verdict cst-verdict--skip">PASSE</div>

        {/* Header strip */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid oklch(8% 0.01 150)',
          background: 'oklch(11% 0.012 150)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="cst-tag" style={{ color: 'var(--phos)' }}>{concept.rec ?? concept.id}</span>
            <span className="cst-tag">·</span>
            <span className="cst-tag">{concept.kind.toUpperCase()}</span>
          </div>
          <SourceTag kind={concept.sourceKind} />
        </div>

        {/* Portrait */}
        <div className="cst-portrait" style={{ height: compact ? 220 : 300, position: 'relative' }}>
          {concept.portrait && concept.portrait.startsWith('http') ? (
            <img
              src={concept.portrait}
              alt={concept.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85, position: 'relative', zIndex: 1 }}
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--display)',
                fontSize: compact ? 42 : 62,
                letterSpacing: '0.18em',
                color: 'oklch(60% 0.05 80 / 0.45)',
                textAlign: 'center', lineHeight: 0.95,
                textShadow: '0 0 24px oklch(0% 0 0 / 0.6)',
              }}>
                {concept.portrait ?? concept.name.split(' ')[0].toUpperCase()}
              </div>
            </div>
          )}
          <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-dim)', letterSpacing: '.15em', zIndex: 2 }}>◰ PORTRAIT.IMG</span>
          <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-dim)', letterSpacing: '.15em', zIndex: 2 }}>RES: 256×256</span>
          <span style={{ position: 'absolute', bottom: 8, left: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-dim)', letterSpacing: '.15em', zIndex: 2 }}>SRC: WIKIMEDIA</span>
          <span style={{ position: 'absolute', bottom: 8, right: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-dim)', letterSpacing: '.15em', zIndex: 2 }}>CRT-FX: ON</span>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <h2 className="cst-flicker" style={{
              margin: 0, fontFamily: 'var(--display)',
              fontSize: compact ? 36 : 46, lineHeight: 0.95,
              color: 'var(--phos-bright)',
              textShadow: '0 0 10px oklch(60% 0.15 140 / 0.5)',
              letterSpacing: '0.01em',
            }}>
              {concept.name}
            </h2>
            {concept.years && (
              <span className="cst-tag" style={{ color: 'var(--phos)', whiteSpace: 'nowrap' }}>
                {concept.years}
              </span>
            )}
          </div>

          <p style={{ margin: '8px 0 14px', fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.5, color: 'oklch(82% 0.04 90)' }}>
            {concept.blurb}
          </p>

          {concept.refs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--phos-dim)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              <span style={{ color: 'var(--phos-deep)' }}>RÉFS ≫</span>
              {concept.refs.map((r, i) => (
                <span key={i} style={{ color: 'var(--phos)' }}>{r}{i < concept.refs.length - 1 ? ' · ' : ''}</span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {concept.cats.map(([k]) => <CatChip key={k} catKey={k} />)}
          </div>

          {/* Chromatic signature bar */}
          <div style={{ marginTop: 12 }}>
            <div className="cst-tag" style={{ marginBottom: 4 }}>SIGNATURE CHROMATIQUE</div>
            <div style={{
              height: 6,
              background: gradient,
              boxShadow: `inset 0 0 0 1px oklch(8% 0.01 150), 0 0 12px ${dominant}`,
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-deep)', letterSpacing: '.1em', marginTop: 4 }}>
              {concept.cats.map(([k, w]) => (
                <span key={k}>{CATEGORIES[k as keyof typeof CATEGORIES]?.short} · {Math.round(w * 100)}%</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
