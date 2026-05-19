import { useEffect, useMemo, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { CATEGORIES, CATEGORY_LIST, conceptDominant, gradientForWeights } from '../../lib/categories';
import { getAdoptedConcepts, getConceptsByVerdict, giveSecondChance } from '../../stores/db';
import { useToast } from '../../lib/toast';
import type { Concept, CategoryKey } from '../../types';

interface Props { onTabChange?: (id: string) => void }

interface MapNode {
  concept: Concept;
  x: number; y: number;
  size: number;
  dominant: string;
}

interface MapEdge { a: string; b: string }

/** Layout pseudo-radial : grouper par catégorie dominante, étaler en anneau. */
function layoutNodes(concepts: Concept[]): MapNode[] {
  if (concepts.length === 0) return [];

  // Group by dominant category
  const groups: Record<string, Concept[]> = {};
  concepts.forEach(c => {
    const key = c.cats[0]?.[0] ?? 'personnages';
    (groups[key] ??= []).push(c);
  });
  const groupKeys = Object.keys(groups);
  const nGroups = groupKeys.length;

  const nodes: MapNode[] = [];
  groupKeys.forEach((gk, gi) => {
    const baseAngle = (gi / Math.max(1, nGroups)) * Math.PI * 2 - Math.PI / 2;
    const groupConcepts = groups[gk];
    groupConcepts.forEach((c, ci) => {
      const localAngle = baseAngle + ((ci - (groupConcepts.length - 1) / 2) * 0.18);
      const r = 22 + (ci % 3) * 7;
      const x = 50 + Math.cos(localAngle) * r;
      const y = 50 + Math.sin(localAngle) * r;
      nodes.push({
        concept: c,
        x: Math.max(8, Math.min(92, x)),
        y: Math.max(10, Math.min(86, y)),
        size: 14 + Math.min(8, c.cats.length * 2),
        dominant: conceptDominant(c.cats).css,
      });
    });
  });
  return nodes;
}

/** Edges entre nœuds qui partagent au moins une catégorie. */
function buildEdges(nodes: MapNode[]): MapEdge[] {
  const edges: MapEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].concept;
      const b = nodes[j].concept;
      const aCats = new Set(a.cats.map(([k]) => k));
      const shared = b.cats.some(([k]) => aCats.has(k));
      if (shared) edges.push({ a: a.id, b: b.id });
    }
  }
  return edges;
}

function CheckBox({ checked, color, label, count, onClick }: {
  checked: boolean; color: string; label: string; count: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '20px 14px 1fr 30px', gap: 8, alignItems: 'center',
      width: '100%',
      background: checked ? 'var(--cit-cream)' : 'transparent',
      border: '2px solid var(--cit-navy-dk)',
      padding: '4px 8px', cursor: 'pointer',
      fontFamily: "'Oswald', sans-serif",
      fontSize: 12, fontWeight: 600, letterSpacing: '.08em',
      color: 'var(--cit-navy-dk)', textAlign: 'left', textTransform: 'uppercase',
      boxShadow: checked ? '2px 2px 0 var(--cit-navy-dk)' : 'none',
      opacity: checked ? 1 : 0.6,
    }}>
      <span style={{
        width: 16, height: 16, border: '2px solid var(--cit-navy-dk)',
        background: checked ? 'var(--cit-navy-dk)' : 'transparent',
        color: 'var(--cit-butter)',
        display: 'grid', placeItems: 'center',
        fontSize: 12, lineHeight: 1,
      }}>{checked ? '✓' : ''}</span>
      <span style={{ width: 12, height: 12, background: color, border: '1.5px solid var(--cit-navy-dk)' }}/>
      <span style={{ textTransform: 'none' }}>{label}</span>
      <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, color: 'var(--cit-navy-lt)', textAlign: 'right' }}>
        {String(count).padStart(2, '0')}
      </span>
    </button>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: on ? 'var(--cit-butter)' : 'transparent',
      border: '2px solid var(--cit-navy-dk)',
      padding: '4px 10px', cursor: 'pointer',
      fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
      letterSpacing: '.08em', color: 'var(--cit-navy-dk)',
      boxShadow: on ? '2px 2px 0 var(--cit-navy-dk)' : 'none',
    }}>
      <span>{label}</span>
      <span style={{
        width: 32, height: 16, border: '2px solid var(--cit-navy-dk)',
        background: on ? 'var(--cit-navy-dk)' : 'var(--cit-paper-dk)',
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute', left: on ? 14 : 0, top: -2, width: 14, height: 16,
          background: on ? 'var(--cit-butter)' : 'var(--cit-cream)',
          border: '2px solid var(--cit-navy-dk)', transition: 'left .15s',
        }}/>
      </span>
    </button>
  );
}

interface Filters {
  cats: Record<string, boolean>;
  favsOnly: boolean;
  showEdges: boolean;
  showRejected: boolean;
  showSkipped: boolean;
}

type NodeStatus = 'adopted' | 'rejected' | 'skipped';

function MapFilters({ filters, setFilters, search, setSearch, nodes }: {
  filters: Filters;
  setFilters: (f: Filters | ((p: Filters) => Filters)) => void;
  search: string; setSearch: (s: string) => void;
  nodes: MapNode[];
}) {
  return (
    <div style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      borderLeft: 'none',
      boxShadow: '5px 0 0 var(--cit-navy-dk)',
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      <div style={{
        background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
        padding: '8px 14px',
      }}>
        <div className="cit-h1" style={{ fontSize: 18, color: 'var(--cit-butter)', textShadow: '1px 1px 0 oklch(0% 0 0)' }}>
          FILTRES
        </div>
      </div>

      <div style={{ padding: '12px 14px' }}>
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Recherche</div>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Foucault, Borges…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px 8px 32px',
              border: '2.5px solid var(--cit-navy-dk)',
              background: 'var(--cit-paper)',
              fontFamily: "'Special Elite', monospace",
              fontSize: 13, color: 'var(--cit-navy-dk)',
              boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
            }}/>
          <span style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            fontFamily: "'Alfa Slab One', serif", fontSize: 14, color: 'var(--cit-brick)',
          }}>⌕</span>
        </div>

        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Affichage</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <Toggle label="Favoris uniquement"  on={filters.favsOnly}     onClick={() => setFilters(f => ({ ...f, favsOnly: !f.favsOnly }))}/>
          <Toggle label="Inclure les rejetés" on={filters.showRejected} onClick={() => setFilters(f => ({ ...f, showRejected: !f.showRejected }))}/>
          <Toggle label="Inclure les passés"  on={filters.showSkipped}  onClick={() => setFilters(f => ({ ...f, showSkipped: !f.showSkipped }))}/>
          <Toggle label="Voir les liaisons"   on={filters.showEdges}    onClick={() => setFilters(f => ({ ...f, showEdges: !f.showEdges }))}/>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ Catégories</span>
          <button style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: '.14em',
            color: 'var(--cit-brick)', fontWeight: 700, textTransform: 'uppercase',
          }} onClick={() => {
            const allOn = CATEGORY_LIST.every(c => filters.cats[c.key]);
            const next: Record<string, boolean> = {};
            CATEGORY_LIST.forEach(c => next[c.key] = !allOn);
            setFilters(f => ({ ...f, cats: next }));
          }}>tout</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {CATEGORY_LIST.map(c => {
            const count = nodes.filter(n => n.concept.cats[0]?.[0] === c.key).length;
            return (
              <CheckBox key={c.key}
                checked={!!filters.cats[c.key]}
                color={c.oklch}
                label={c.label}
                count={count}
                onClick={() => setFilters(f => ({ ...f, cats: { ...f.cats, [c.key]: !f.cats[c.key] } }))}/>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '10px 14px', background: 'var(--cit-paper-dk)', borderTop: '2px solid var(--cit-navy-dk)' }}>
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>AFFICHE</div>
        <div className="cit-h1" style={{ fontSize: 28, color: 'var(--cit-navy-dk)', lineHeight: 1 }}>
          {nodes.length} NŒUDS
        </div>
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>
          adoptés au total.
        </div>
      </div>
    </div>
  );
}

function NodeDetailPanel({ node, edges, allNodes, status, onClose, onSecondChance }: {
  node: MapNode | null; edges: MapEdge[]; allNodes: MapNode[];
  status: NodeStatus;
  onClose: () => void;
  onSecondChance: () => void;
}) {
  if (!node) return null;
  const portrait = node.concept.name.split(' ').slice(0, 2).join(' ').toUpperCase();
  const neighbors = edges
    .filter(e => e.a === node.concept.id || e.b === node.concept.id)
    .map(e => e.a === node.concept.id ? e.b : e.a)
    .map(id => allNodes.find(n => n.concept.id === id))
    .filter((n): n is MapNode => !!n);

  return (
    <div style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      borderRight: 'none',
      boxShadow: '-5px 0 0 var(--cit-navy-dk)',
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      <div style={{
        background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
        padding: '8px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div className="cit-h1" style={{ fontSize: 18, color: 'var(--cit-butter)', textShadow: '1px 1px 0 oklch(0% 0 0)' }}>
          FICHE
        </div>
        <button onClick={onClose} style={{
          background: 'var(--cit-brick)', color: 'var(--cit-cream)',
          border: '2px solid var(--cit-cream)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 14, padding: '0 8px',
          cursor: 'pointer', lineHeight: 1.2,
        }}>✕</button>
      </div>

      <div style={{
        position: 'relative', borderBottom: '3px solid var(--cit-navy-dk)',
        background: 'var(--cit-butter)', height: 180, overflow: 'hidden',
      }}>
        {node.concept.portrait?.startsWith('http') ? (
          <img src={node.concept.portrait} alt={node.concept.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <>
            <div style={{
              position: 'absolute', inset: '10% 30% 18% 30%',
              background: 'var(--cit-brick)', borderRadius: '50%',
              border: '3px solid var(--cit-navy-dk)',
            }}/>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Alfa Slab One', serif",
              fontSize: 22, lineHeight: 0.95, color: 'var(--cit-cream)',
              textAlign: 'center', textShadow: '2px 2px 0 var(--cit-navy-dk)',
              padding: 12, zIndex: 1,
            }}>{portrait}</div>
          </>
        )}
      </div>

      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ {node.concept.kind}</div>
          <div className="cit-h1" style={{ fontSize: 26, lineHeight: 0.95, marginTop: 2 }}>{node.concept.name}</div>
        </div>

        <div style={{
          height: 8, background: gradientForWeights(node.concept.cats),
          border: '2px solid var(--cit-navy-dk)',
          boxShadow: '2px 2px 0 var(--cit-navy-dk)',
        }}/>

        <p className="cit-typed" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--cit-navy-dk)' }}>
          {node.concept.blurb}
        </p>

        <div>
          <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Catégories</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {node.concept.cats.map(([k, w]) => {
              const c = CATEGORIES[k];
              return (
                <span key={k} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                  letterSpacing: '.12em', textTransform: 'uppercase',
                  padding: '3px 8px',
                  border: '2px solid var(--cit-navy-dk)',
                  background: 'var(--cit-cream)',
                }}>
                  <span style={{ width: 10, height: 10, background: c.oklch, border: '1.5px solid var(--cit-navy-dk)' }}/>
                  {c.label} <span style={{ color: 'var(--cit-brick)' }}>{Math.round(w * 100)}%</span>
                </span>
              );
            })}
          </div>
        </div>

        {neighbors.length > 0 && (
          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Liaisons sémantiques</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {neighbors.slice(0, 6).map(n => (
                <span key={n.concept.id} className="cit-condensed" style={{
                  fontSize: 11, padding: '3px 8px',
                  background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)', fontWeight: 600,
                }}>{n.concept.name}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
          {status === 'rejected' && (
            <CitButton tone="brick" size="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={onSecondChance}>
              ↻ Donner une seconde chance
            </CitButton>
          )}
          {status === 'skipped' && (
            <CitButton tone="butter" size="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={onSecondChance}>
              ↻ Remettre en circulation
            </CitButton>
          )}
          {node.concept.wikidataId && (
            <a href={`https://www.wikidata.org/wiki/${node.concept.wikidataId}`} target="_blank" rel="noopener noreferrer">
              <CitButton tone="navy" size="sm" style={{ width: '100%', justifyContent: 'center' }}>
                Ouvrir sur Wikidata ↗
              </CitButton>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MapGraph({ nodes, edges, selectedId, onSelect, showEdges, statusFor }: {
  nodes: MapNode[]; edges: MapEdge[];
  selectedId: string | null; onSelect: (id: string) => void;
  showEdges: boolean;
  statusFor: (id: string) => NodeStatus;
}) {
  return (
    <div style={{
      position: 'relative',
      background: 'radial-gradient(circle at 50% 50%, var(--cit-paper) 0%, var(--cit-paper-dk) 100%)',
      border: '3px solid var(--cit-navy-dk)',
      overflow: 'hidden', height: '100%',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'repeating-linear-gradient(0deg, oklch(0% 0 0 / 0.04) 0 1px, transparent 1px 32px),' +
          'repeating-linear-gradient(90deg, oklch(0% 0 0 / 0.04) 0 1px, transparent 1px 32px)',
        pointerEvents: 'none',
      }}/>

      <div className="cit-halftone" style={{ position: 'absolute', top: 12, right: 12, width: 90, height: 90, opacity: 0.5 }}/>
      <div className="cit-halftone" style={{ position: 'absolute', bottom: 12, left: 12, width: 90, height: 90, opacity: 0.5 }}/>

      <div style={{
        position: 'absolute', top: 8, left: 12,
        fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: '.18em',
        color: 'var(--cit-navy-lt)', textTransform: 'uppercase',
      }}>
        ★ VOTRE UNIVERS · ÉCHELLE 1:1
      </div>
      <div style={{
        position: 'absolute', top: 8, right: 12,
        fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: '.18em',
        color: 'var(--cit-navy-lt)', textTransform: 'uppercase', textAlign: 'right',
      }}>
        {nodes.length} NŒUDS · {edges.length} LIAISONS
      </div>

      {showEdges && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
          {edges.map((e, i) => {
            const A = nodes.find(n => n.concept.id === e.a);
            const B = nodes.find(n => n.concept.id === e.b);
            if (!A || !B) return null;
            const isSelected = selectedId === e.a || selectedId === e.b;
            return (
              <line key={i}
                x1={`${A.x}%`} y1={`${A.y}%`}
                x2={`${B.x}%`} y2={`${B.y}%`}
                stroke={isSelected ? 'var(--cit-brick)' : 'var(--cit-navy-dk)'}
                strokeWidth={isSelected ? 2.2 : 1.2}
                strokeDasharray={isSelected ? '' : '3 3'}
                opacity={isSelected ? 1 : 0.5}/>
            );
          })}
        </svg>
      )}

      {nodes.map(n => {
        const isSelected = selectedId === n.concept.id;
        const status = statusFor(n.concept.id);
        const isReject = status === 'rejected';
        const isSkip = status === 'skipped';
        const radius = n.size + (isSelected ? 6 : 0);
        const opacity = isReject ? 0.3 : isSkip ? 0.5 : 1;
        return (
          <div key={n.concept.id} onClick={() => onSelect(n.concept.id)}
            style={{
              position: 'absolute',
              left: `${n.x}%`, top: `${n.y}%`,
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              zIndex: isSelected ? 4 : 2,
              opacity,
              filter: isReject ? 'grayscale(0.6)' : isSkip ? 'hue-rotate(180deg) saturate(0.5)' : 'none',
            }}>
            <div style={{
              width: radius * 2, height: radius * 2,
              background: n.dominant,
              border: `3px solid ${isSelected ? 'var(--cit-brick)' : 'var(--cit-navy-dk)'}`,
              borderRadius: '50%',
              boxShadow: isSelected
                ? '4px 4px 0 var(--cit-navy-dk), 0 0 0 8px oklch(96% 0.02 85 / 0.6)'
                : '3px 3px 0 var(--cit-navy-dk)',
              transition: 'all .2s ease',
              position: 'relative',
            }}>
              {n.concept.isFavorite && (
                <span style={{
                  position: 'absolute', top: -8, right: -8,
                  fontFamily: "'Alfa Slab One', serif", fontSize: 14,
                  color: 'var(--cit-mustard)',
                  textShadow: '1px 1px 0 var(--cit-navy-dk)',
                }}>★</span>
              )}
              {isReject && (
                <span style={{
                  position: 'absolute', inset: 0,
                  fontFamily: "'Alfa Slab One', serif", color: 'var(--cit-brick)',
                  display: 'grid', placeItems: 'center', fontSize: radius * 1.4,
                  lineHeight: 1,
                }}>×</span>
              )}
            </div>
            <div style={{
              position: 'absolute', left: '50%', top: '100%',
              transform: 'translate(-50%, 4px)',
              fontFamily: isSelected ? "'Alfa Slab One', serif" : "'Oswald', sans-serif",
              fontSize: isSelected ? 13 : Math.max(9, n.size / 2),
              fontWeight: 600, color: 'var(--cit-navy-dk)',
              whiteSpace: 'nowrap', letterSpacing: '.04em',
              textShadow: '1px 1px 0 var(--cit-cream)',
              pointerEvents: 'none',
            }}>{n.concept.name}</div>
          </div>
        );
      })}

      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'var(--cit-cream)',
        border: '2.5px solid var(--cit-navy-dk)',
        padding: '5px 12px', boxShadow: '3px 3px 0 var(--cit-navy-dk)',
        maxWidth: '92%', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-dk)' }}>★ LÉGENDE :</span>
        {CATEGORY_LIST.map(c => (
          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 9, height: 9, background: c.oklch, border: '1.5px solid var(--cit-navy-dk)' }}/>
            <span className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-dk)' }}>{c.short}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MapScreen({ onTabChange }: Props) {
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [rejected, setRejected] = useState<Concept[]>([]);
  const [skipped, setSkipped] = useState<Concept[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    cats: Object.fromEntries(CATEGORY_LIST.map(c => [c.key, true])),
    favsOnly: false,
    showEdges: true,
    showRejected: false,
    showSkipped: false,
  });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();

  const loadAll = async () => {
    const [a, r, s] = await Promise.all([
      getAdoptedConcepts(),
      getConceptsByVerdict('reject'),
      getConceptsByVerdict('skip'),
    ]);
    setAdopted(a); setRejected(r); setSkipped(s); setLoaded(true);
  };

  useEffect(() => { loadAll().catch(() => setLoaded(true)); }, []);

  const statusFor = (id: string): NodeStatus =>
    adopted.find(c => c.id === id) ? 'adopted'
    : rejected.find(c => c.id === id) ? 'rejected'
    : 'skipped';

  // Combine concepts based on toggles
  const allConcepts = useMemo(() => {
    const list = [...adopted];
    if (filters.showRejected) list.push(...rejected);
    if (filters.showSkipped) list.push(...skipped);
    return list;
  }, [adopted, rejected, skipped, filters.showRejected, filters.showSkipped]);

  const allNodes = useMemo(() => layoutNodes(allConcepts), [allConcepts]);
  const filteredNodes = useMemo(() => allNodes.filter(n => {
    const dominantCat = n.concept.cats[0]?.[0] as CategoryKey | undefined;
    if (dominantCat && !filters.cats[dominantCat]) return false;
    if (filters.favsOnly && !n.concept.isFavorite) return false;
    if (search && !n.concept.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [allNodes, filters, search]);

  const edges = useMemo(() => buildEdges(filteredNodes), [filteredNodes]);
  const selected = filteredNodes.find(n => n.concept.id === selectedId) ?? null;

  if (loaded && adopted.length === 0) {
    return (
      <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CitizenMasthead
          kicker="Voici votre"
          title="UNIVERS"
          active="map"
          onTabChange={onTabChange}
          right={<>
            <Stamp tone="brick" rotate={-5} size={12}>0 NŒUD ADOPTÉ</Stamp>
            <Sunburst size={68} color="var(--cit-mustard)"/>
          </>}
        />
        <div style={{ flex: 1, padding: '40px 32px', background: 'var(--cit-paper-2)', display: 'grid', placeItems: 'center' }}>
          <div style={{
            padding: '60px 40px', textAlign: 'center', maxWidth: 520,
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 32, marginTop: 16 }}>Univers vide</h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8, lineHeight: 1.5 }}>
              Votre carte se construira au fur et à mesure que vous adoptez des concepts depuis l'écran de swipe.
            </p>
            <div style={{ marginTop: 18 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('swipe')}>★ ALLER AU SWIPE</CitButton>
            </div>
          </div>
        </div>
        <CitizenFooter right="CLIQUEZ UN NŒUD POUR LA FICHE"/>
      </div>
    );
  }

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Voici votre"
        title="UNIVERS"
        active="map"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-5} size={12}>★ {adopted.length} NŒUDS ADOPTÉS</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: selected ? '280px 1fr 340px' : '280px 1fr',
        gap: 0, zIndex: 3, position: 'relative', overflow: 'hidden',
      }}>
        <MapFilters
          filters={filters} setFilters={setFilters}
          search={search} setSearch={setSearch}
          nodes={allNodes}
        />

        <div style={{ padding: '0 14px' }}>
          <MapGraph
            nodes={filteredNodes} edges={edges}
            selectedId={selectedId} onSelect={setSelectedId}
            showEdges={filters.showEdges}
            statusFor={statusFor}
          />
        </div>

        {selected && (
          <NodeDetailPanel
            node={selected} edges={edges} allNodes={filteredNodes}
            status={statusFor(selected.concept.id)}
            onClose={() => setSelectedId(null)}
            onSecondChance={async () => {
              await giveSecondChance(selected.concept.id);
              toast.show({
                tone: 'success', title: 'Concept réhabilité',
                body: `« ${selected.concept.name} » pourra à nouveau apparaître au swipe.`,
              });
              setSelectedId(null);
              loadAll();
            }}
          />
        )}
      </div>

      <CitizenFooter right="CLIQUEZ UN NŒUD POUR LA FICHE"/>
    </div>
  );
}
