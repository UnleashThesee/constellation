import type { ReactNode } from 'react';

// Atoms CRT : Led, SegBar, MiniBars, CornerMarks

export function Led({ tone = 'phos', on = true }: { tone?: 'phos' | 'amber' | 'red'; on?: boolean }) {
  const cls = [
    'cst-led',
    tone === 'amber' ? 'cst-led--amber' : tone === 'red' ? 'cst-led--red' : '',
    !on ? 'cst-led--dim' : '',
  ].filter(Boolean).join(' ');
  return <i className={cls} />;
}

export function SegBar({ count = 24, filled = 14, warn = false }: { count?: number; filled?: number; warn?: boolean }) {
  return (
    <div className="cst-segbar">
      {Array.from({ length: count }, (_, i) => {
        const active = i < filled;
        const cls = active ? (warn && i >= filled - 2 ? 'warn' : 'on') : '';
        return <i key={i} className={cls} />;
      })}
    </div>
  );
}

export function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="cst-mini-bars">
      {values.map((v, i) => (
        <i key={i} className={v >= max * 0.6 ? 'hi' : ''} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}

export function CornerMarks({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="cst-corners" style={style}>
      <span className="c-tl" /><span className="c-bl" />
      {children}
    </div>
  );
}

// ---- Citizen atoms ----

export function Sunburst({ size = 180, color = 'var(--cit-butter)', behindColor, rays = 36 }: {
  size?: number; color?: string; behindColor?: string; rays?: number;
}) {
  const lines = Array.from({ length: rays }, (_, i) => {
    const angle = (i * 360) / rays;
    const len = i % 2 === 0 ? size / 2 : size / 2 - 18;
    return (
      <line key={i}
        x1={size / 2} y1={size / 2}
        x2={size / 2 + Math.cos(angle * Math.PI / 180) * len}
        y2={size / 2 + Math.sin(angle * Math.PI / 180) * len}
        stroke={color} strokeWidth={i % 2 === 0 ? 5 : 3}
      />
    );
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {behindColor && <circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill={behindColor} />}
      {lines}
      <circle cx={size / 2} cy={size / 2} r={size / 4} fill={color} />
      <circle cx={size / 2} cy={size / 2} r={size / 4 - 6} fill="none" stroke="var(--cit-navy-dk)" strokeWidth="2" />
    </svg>
  );
}

export function FileSeal({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block' }}>
      <circle cx="32" cy="32" r="29" fill="none" stroke="var(--cit-navy-dk)" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--cit-navy-dk)" strokeWidth="1" />
      <circle cx="32" cy="32" r="11" fill="var(--cit-butter)" stroke="var(--cit-navy-dk)" strokeWidth="2" />
      <path d="M32 22 L33.5 30 L42 32 L33.5 34 L32 42 L30.5 34 L22 32 L30.5 30 Z" fill="var(--cit-navy-dk)" />
      <text x="32" y="9" fontFamily="Oswald, sans-serif" fontSize="6" fontWeight="700" letterSpacing="1.5" textAnchor="middle" fill="var(--cit-navy-dk)">CONSTELLATION</text>
      <text x="32" y="60" fontFamily="Oswald, sans-serif" fontSize="6" fontWeight="700" letterSpacing="1.5" textAnchor="middle" fill="var(--cit-navy-dk)">★ BUREAU ★</text>
    </svg>
  );
}

export function Aster({ size = 32, rotate = 0 }: { size?: number; rotate?: number }) {
  return (
    <span style={{
      display: 'inline-grid', placeItems: 'center',
      width: size, height: size, background: 'var(--cit-butter)',
      borderRadius: '50%', border: '2px solid var(--cit-navy-dk)',
      fontFamily: "'Alfa Slab One', serif", fontSize: size * 0.6, color: 'var(--cit-navy-dk)',
      boxShadow: '2px 2px 0 var(--cit-navy-dk)', transform: `rotate(${rotate}deg)`,
    }}>★</span>
  );
}

export function PixelDie({ size = 22 }: { size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 22 22" style={{ shapeRendering: 'crispEdges', display: 'inline-block' }}>
      <rect x="2" y="2" width="18" height="18" fill="var(--cit-butter)" stroke="var(--cit-navy-dk)" strokeWidth="2"/>
      <rect x="5" y="5" width="3" height="3" fill="var(--cit-navy-dk)"/>
      <rect x="14" y="5" width="3" height="3" fill="var(--cit-navy-dk)"/>
      <rect x="9.5" y="9.5" width="3" height="3" fill="var(--cit-navy-dk)"/>
      <rect x="5" y="14" width="3" height="3" fill="var(--cit-navy-dk)"/>
      <rect x="14" y="14" width="3" height="3" fill="var(--cit-navy-dk)"/>
    </svg>
  );
}

export function StarBurst({ size = 120, rotate = 0, children }: {
  size?: number; rotate?: number; children?: ReactNode;
}) {
  const pts = 12;
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size / 2 - 2;
  const r2 = size * 0.34;
  const points = Array.from({ length: pts * 2 }, (_, i) => {
    const angle = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
  }).join(' ');
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block', transform: `rotate(${rotate}deg)` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
        <polygon points={points} fill="var(--cit-butter)" stroke="var(--cit-navy-dk)" strokeWidth="2.5" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: "'Alfa Slab One', serif", fontSize: size * 0.1, lineHeight: 1.25,
        color: 'var(--cit-navy-dk)', letterSpacing: '.04em', textTransform: 'uppercase',
        padding: '20%',
      }}>{children}</div>
    </div>
  );
}

export function Stamp({ children, tone = 'brick', rotate = 0, size = 13 }: {
  children: React.ReactNode; tone?: 'brick' | 'navy' | 'mustard'; rotate?: number; size?: number;
}) {
  const color = tone === 'navy' ? 'var(--cit-navy-dk)' : tone === 'mustard' ? 'var(--cit-mustard)' : 'var(--cit-brick)';
  return (
    <span style={{
      fontFamily: "'Alfa Slab One', serif", letterSpacing: '.06em', color,
      border: '4px double currentColor', padding: '5px 14px', display: 'inline-block',
      background: 'oklch(96% 0.02 85 / 0.3)', filter: 'blur(0.15px)',
      textTransform: 'uppercase', fontSize: size, transform: `rotate(${rotate}deg)`,
    }}>{children}</span>
  );
}

// Skeleton loader (#21) : bloc shimmer aux dimensions arbitraires.
export function Skeleton({ width = '100%', height = 16, style }: {
  width?: number | string; height?: number | string; style?: React.CSSProperties;
}) {
  return <div className="cit-skel cit-no-print" style={{ width, height, ...style }} aria-hidden />;
}

// Carte-fantôme reproduisant la silhouette d'une CitizenCard pendant le fetch.
export function SkeletonCard() {
  return (
    <div className="cit-card cit-no-print" style={{ height: 500, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }} aria-label="Chargement en cours" role="status">
      <Skeleton width={120} height={22} />
      <Skeleton width="70%" height={34} />
      <Skeleton width={180} height={14} />
      <Skeleton height={170} style={{ marginTop: 4 }} />
      <Skeleton height={12} />
      <Skeleton height={12} />
      <Skeleton width="85%" height={12} />
      <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
        <Skeleton width={90} height={30} />
        <Skeleton width={90} height={30} />
        <Skeleton width={90} height={30} />
      </div>
    </div>
  );
}
