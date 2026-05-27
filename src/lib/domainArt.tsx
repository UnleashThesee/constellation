import { useId } from 'react';
import type { ReactNode } from 'react';
import type { CategoryKey } from '../types';
import { CATEGORIES } from './categories';

// Ordre stable des domaines (= ordre des clés de palette) — sert au placement
// déterministe sur la mini-map de l'overlay.
export const DOMAIN_ORDER: CategoryKey[] = [
  'philosophie', 'sciences', 'humaines', 'economie', 'litterature', 'arts',
  'musique', 'cinema', 'jeuvideo', 'histoire', 'geographie', 'personnages',
];

export function domainColor(cat: CategoryKey): string {
  return (CATEGORIES[cat] ?? CATEGORIES.personnages).oklch;
}

export function dominantCat(cats?: [string, number?][] | string[][]): CategoryKey {
  const first = (cats?.[0] as unknown[] | undefined)?.[0];
  return (typeof first === 'string' ? first : 'personnages') as CategoryKey;
}

// ── Motifs procéduraux par domaine ───────────────────────────────────────────
// Chaque motif est un dessin line-art (parfois rempli) répété en tuile. `c` est
// la couleur du domaine. Style commun : trait rond, ~2.2px, sobre.
interface Motif { tile: number; rotate?: number; draw: (c: string) => ReactNode }

const S = (c: string) => ({ stroke: c, fill: 'none', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

const MOTIFS: Record<CategoryKey, Motif> = {
  // Colonne grecque (piliers) — la philosophie.
  philosophie: { tile: 60, draw: (c) => (<g {...S(c)}>
    <line x1={20} y1={20} x2={40} y2={20}/><line x1={18} y1={24} x2={42} y2={24}/>
    <line x1={18} y1={42} x2={42} y2={42}/><line x1={20} y1={46} x2={40} y2={46}/>
    <line x1={24} y1={24} x2={24} y2={42}/><line x1={30} y1={24} x2={30} y2={42}/><line x1={36} y1={24} x2={36} y2={42}/>
  </g>) },
  // Fiole / erlenmeyer — sciences exactes.
  sciences: { tile: 60, draw: (c) => (<g {...S(c)}>
    <line x1={25} y1={16} x2={35} y2={16}/><line x1={26} y1={16} x2={26} y2={26}/><line x1={34} y1={16} x2={34} y2={26}/>
    <path d="M26 26 L19 44 L41 44 L34 26"/><line x1={23} y1={38} x2={37} y2={38}/>
  </g>) },
  // Deux silhouettes — sciences humaines.
  humaines: { tile: 60, draw: (c) => (<g {...S(c)}>
    <circle cx={23} cy={25} r={4}/><path d="M17 43 C17 34 29 34 29 43"/>
    <circle cx={39} cy={27} r={3.6}/><path d="M33 44 C33 36 45 36 45 44"/>
  </g>) },
  // Barres croissantes + flèche — économie.
  economie: { tile: 60, draw: (c) => (<g {...S(c)}>
    <rect x={18} y={36} width={5} height={8}/><rect x={27} y={30} width={5} height={14}/><rect x={36} y={23} width={5} height={21}/>
    <path d="M18 32 L28 26 L40 18"/><path d="M40 18 L34 18 M40 18 L40 24"/>
  </g>) },
  // Livre ouvert — littérature.
  litterature: { tile: 60, draw: (c) => (<g {...S(c)}>
    <line x1={30} y1={20} x2={30} y2={43}/>
    <path d="M30 21 C25 18 19 19 16 21 L16 41 C19 39 25 39 30 42"/>
    <path d="M30 21 C35 18 41 19 44 21 L44 41 C41 39 35 39 30 42"/>
  </g>) },
  // Palette de peintre — arts visuels.
  arts: { tile: 60, draw: (c) => (<g {...S(c)}>
    <path d="M30 18 C39 18 43 25 42 31 C41 36 36 35 35 39 C34 43 28 43 24 42 C18 40 17 33 19 27 C21 21 25 18 30 18 Z"/>
    <circle cx={25} cy={34} r={2.4} fill={c} stroke="none"/>
    <circle cx={33} cy={23} r={1.8} fill={c} stroke="none"/><circle cx={38} cy={28} r={1.8} fill={c} stroke="none"/>
  </g>) },
  // Notes croches — musique.
  musique: { tile: 60, draw: (c) => (<g {...S(c)}>
    <line x1={23} y1={16} x2={40} y2={14}/><line x1={23} y1={16} x2={23} y2={38}/><line x1={40} y1={14} x2={40} y2={34}/>
    <ellipse cx={20} cy={39} rx={3.4} ry={2.6} fill={c} stroke="none"/><ellipse cx={37} cy={35} rx={3.4} ry={2.6} fill={c} stroke="none"/>
  </g>) },
  // Pellicule de film — cinéma.
  cinema: { tile: 60, draw: (c) => (<g {...S(c)}>
    <rect x={22} y={15} width={16} height={30}/>
    <rect x={16} y={18} width={3} height={3}/><rect x={16} y={27} width={3} height={3}/><rect x={16} y={36} width={3} height={3}/>
    <rect x={41} y={18} width={3} height={3}/><rect x={41} y={27} width={3} height={3}/><rect x={41} y={36} width={3} height={3}/>
    <line x1={22} y1={30} x2={38} y2={30}/>
  </g>) },
  // Manette / d-pad — jeu vidéo.
  jeuvideo: { tile: 60, draw: (c) => (<g {...S(c)}>
    <rect x={15} y={23} width={30} height={16} rx={6}/>
    <path d="M24 28 L24 36 M20 32 L28 32"/>
    <circle cx={37} cy={30} r={1.8} fill={c} stroke="none"/><circle cx={40} cy={35} r={1.8} fill={c} stroke="none"/>
  </g>) },
  // Amphore antique — histoire.
  histoire: { tile: 60, draw: (c) => (<g {...S(c)}>
    <path d="M27 18 L33 18 M28 18 C25 24 24 26 24 31 C24 39 36 39 36 31 C36 26 35 24 32 18"/>
    <path d="M27 21 C22 22 21 27 24 29"/><path d="M33 21 C38 22 39 27 36 29"/>
    <line x1={28} y1={40} x2={32} y2={40}/>
  </g>) },
  // Rose des vents — géographie.
  geographie: { tile: 60, draw: (c) => (<g {...S(c)}>
    <circle cx={30} cy={30} r={12}/>
    <path d="M30 18 L33 30 L30 42 L27 30 Z" fill={c} stroke="none"/>
    <path d="M18 30 L30 27 L42 30 L30 33 Z" fill={c} stroke="none" opacity={0.6}/>
  </g>) },
  // Buste / portrait — personnages.
  personnages: { tile: 60, draw: (c) => (<g {...S(c)}>
    <circle cx={30} cy={24} r={7}/><path d="M18 44 C18 34 24 32 30 32 C36 32 42 34 42 44"/>
  </g>) },
};

/**
 * Fond procédural d'un domaine : teinte de base + motif répété, tous deux
 * dérivés de la couleur du domaine. Se place en `position:absolute; inset:0`
 * sur un parent en `overflow:hidden`. Volontairement discret (lisibilité).
 */
export function DomainBackdrop({ cat, baseOpacity = 0.07, motifOpacity = 0.16, color: colorProp, style }: {
  cat: CategoryKey; baseOpacity?: number; motifOpacity?: number; color?: string; style?: React.CSSProperties;
}) {
  const rid = useId().replace(/[:]/g, '');
  const color = colorProp ?? domainColor(cat);
  const m = MOTIFS[cat] ?? MOTIFS.personnages;
  const pid = `dm-${cat}-${rid}`;
  return (
    <svg aria-hidden width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}>
      <defs>
        <pattern id={pid} width={m.tile} height={m.tile} patternUnits="userSpaceOnUse"
          patternTransform={m.rotate ? `rotate(${m.rotate})` : undefined}>
          <g opacity={motifOpacity}>{m.draw(color)}</g>
        </pattern>
      </defs>
      {baseOpacity > 0 && <rect width="100%" height="100%" fill={color} opacity={baseOpacity}/>}
      <rect width="100%" height="100%" fill={`url(#${pid})`}/>
    </svg>
  );
}

/** Tache douce d'un domaine pour la carto : dégradé radial teinté + motif léger, clippé en cercle. */
export function DomainBlob({ cat, leftPct, topPct, sizePct }: {
  cat: CategoryKey; leftPct: number; topPct: number; sizePct: number;
}) {
  const color = domainColor(cat);
  return (
    <div style={{
      position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
      width: `${sizePct}%`, height: `${sizePct}%`, transform: 'translate(-50%, -50%)',
      borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
    }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, transparent 68%)`, opacity: 0.14 }}/>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
        WebkitMaskImage: 'radial-gradient(circle, #000 38%, transparent 70%)',
        maskImage: 'radial-gradient(circle, #000 38%, transparent 70%)' }}>
        <DomainBackdrop cat={cat} baseOpacity={0} motifOpacity={0.5}/>
      </div>
    </div>
  );
}

/** Position déterministe (%) d'un domaine sur la mini-map (secteur radial + léger jitter par id). */
export function domainZone(cat: CategoryKey, id?: string): { x: number; y: number } {
  const i = Math.max(0, DOMAIN_ORDER.indexOf(cat));
  const ang = (i / DOMAIN_ORDER.length) * Math.PI * 2 - Math.PI / 2;
  const R = 33;
  let jx = 0, jy = 0;
  if (id) { let h = 0; for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0; jx = ((h % 13) - 6); jy = (((h >> 4) % 13) - 6); }
  return { x: 50 + Math.cos(ang) * R + jx * 0.5, y: 50 + Math.sin(ang) * R + jy * 0.5 };
}
