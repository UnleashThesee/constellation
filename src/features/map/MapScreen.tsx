import { useEffect, useMemo, useState, useRef } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { CATEGORIES, CATEGORY_LIST, conceptDominant, gradientForWeights } from '../../lib/categories';
import {
  getAdoptedConcepts, getConceptsByVerdict, giveSecondChance,
  getAllLinks, createLink, deleteLink, updateLinkNote,
  getAllPersonalCategories, getAllTags, db,
  getFilterState, setFilterState,
} from '../../stores/db';
import { fetchRelatedQids } from '../../services/wikidata';
import { useToast } from '../../lib/toast';
import { computeForceLayout, type LayoutPosition } from './forceLayout';
import type { Concept, CategoryKey, ConceptLink, PersonalCategory, Tag } from '../../types';

interface Props { onTabChange?: (id: string) => void }

// ---- Comparaison « univers d'un ami » (démo : concepts fictifs) ----
const FRIEND_NAME = 'Camille · démo';
type FriendEntry = { name: string; cats: Array<[CategoryKey, number]>; verdict: 'adopted' | 'rejected' };
const FRIEND_UNIVERSE: FriendEntry[] = [
  { name: 'Michel Foucault', cats: [['philosophie', 0.7], ['histoire', 0.3]], verdict: 'adopted' },
  { name: 'Friedrich Nietzsche', cats: [['philosophie', 1]], verdict: 'adopted' },
  { name: 'Hannah Arendt', cats: [['philosophie', 0.6], ['histoire', 0.4]], verdict: 'adopted' },
  { name: 'Jorge Luis Borges', cats: [['litterature', 0.8], ['philosophie', 0.2]], verdict: 'adopted' },
  { name: 'Italo Calvino', cats: [['litterature', 1]], verdict: 'adopted' },
  { name: 'Virginia Woolf', cats: [['litterature', 1]], verdict: 'adopted' },
  { name: 'David Lynch', cats: [['cinema', 1]], verdict: 'adopted' },
  { name: 'Stanley Kubrick', cats: [['cinema', 1]], verdict: 'adopted' },
  { name: 'Hayao Miyazaki', cats: [['cinema', 0.8], ['arts', 0.2]], verdict: 'adopted' },
  { name: 'Aphex Twin', cats: [['musique', 1]], verdict: 'adopted' },
  { name: 'Jean-Sébastien Bach', cats: [['musique', 1]], verdict: 'adopted' },
  { name: 'Dark Souls', cats: [['jeuvideo', 0.8], ['arts', 0.2]], verdict: 'adopted' },
  { name: 'Carl Gustav Jung', cats: [['humaines', 0.7], ['philosophie', 0.3]], verdict: 'adopted' },
  { name: 'Fernand Braudel', cats: [['histoire', 0.6], ['humaines', 0.4]], verdict: 'adopted' },
  { name: 'Marie Curie', cats: [['sciences', 1]], verdict: 'adopted' },
  { name: 'Marvel Cinematic Universe', cats: [['cinema', 1]], verdict: 'rejected' },
  { name: 'Téléréalité', cats: [['humaines', 1]], verdict: 'rejected' },
];
const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
// Position déterministe (à partir du nom) pour les nœuds fantômes de l'ami
function hashPos(s: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = (h >>> 0) / 4294967295;
  const b = (Math.imul((h ^ 0x9e3779b9) >>> 0, 2654435761) >>> 0) / 4294967295;
  return { x: 8 + a * 84, y: 8 + b * 84 };
}

interface MapNode {
  concept: Concept;
  x: number; y: number;
  size: number;
  dominant: string;
}

interface MapEdge { a: string; b: string }

/**
 * Calcule le layout (positions) en réutilisant computeForceLayout puis
 * reconstruit les MapNode (concept + couleur dominante calculée côté main
 * thread car CATEGORIES est mutable selon le thème/palette).
 */
function positionsToNodes(concepts: Concept[], positions: LayoutPosition[]): MapNode[] {
  const byId = new Map(concepts.map(c => [c.id, c]));
  return positions
    .map(p => {
      const concept = byId.get(p.id);
      if (!concept) return null;
      return { concept, x: p.x, y: p.y, size: p.size, dominant: conceptDominant(concept.cats).css };
    })
    .filter((n): n is MapNode => n !== null);
}

type SeedMap = Record<string, { x: number; y: number; size: number }>;

function layoutNodes(concepts: Concept[], seed?: SeedMap): MapNode[] {
  if (concepts.length === 0) return [];
  const allSeeded = seed && concepts.every(c => seed[c.id]);
  const positions = computeForceLayout(
    concepts.map(c => ({ id: c.id, cats: c.cats.map(([k]) => k), isFavorite: !!c.isFavorite })),
    { seed, iterations: allSeeded ? 30 : 80 },
  );
  return positionsToNodes(concepts, positions);
}

/** Exporte la carte courante en PNG (#28) : dessine nœuds + liens sur un canvas
 * hors-écran haute résolution et déclenche un téléchargement. */
function exportMapPng(nodes: MapNode[], edges: Array<{ a: string; b: string }>, showEdges: boolean): void {
  if (nodes.length === 0) return;
  const W = 2000, H = 1400, pad = 60;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = 'oklch(94% 0.02 85)';
  ctx.fillRect(0, 0, W, H);
  const px = (n: MapNode) => ({ x: pad + (n.x / 100) * (W - pad * 2), y: pad + (n.y / 100) * (H - pad * 2) });
  const byId = new Map(nodes.map(n => [n.concept.id, n]));
  if (showEdges) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'oklch(35% 0.07 250 / 0.35)';
    edges.forEach(e => {
      const A = byId.get(e.a), B = byId.get(e.b);
      if (!A || !B) return;
      const pa = px(A), pb = px(B);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  }
  const showLabels = nodes.length <= 140;
  nodes.forEach(n => {
    const p = px(n);
    const r = Math.max(6, n.size);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.dominant; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'oklch(20% 0.07 250)'; ctx.stroke();
    if (showLabels) {
      ctx.fillStyle = 'oklch(20% 0.07 250)';
      ctx.font = '600 18px Oswald, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.concept.name.slice(0, 28), p.x, p.y + r + 20);
    }
  });
  ctx.fillStyle = 'oklch(20% 0.07 250)';
  ctx.font = '700 34px "Alfa Slab One", serif';
  ctx.textAlign = 'left';
  ctx.fillText('CONSTELLATION · MON UNIVERS', pad, 44);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `constellation-univers-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
}

/** Reconstruit les nœuds directement depuis des positions sauvegardées (aucun calcul). */
function nodesFromSeed(concepts: Concept[], seed: SeedMap | undefined): MapNode[] | null {
  if (!seed || concepts.length === 0) return null;
  const positions: LayoutPosition[] = [];
  for (const c of concepts) {
    const p = seed[c.id];
    if (!p) return null;
    positions.push({ id: c.id, x: p.x, y: p.y, size: p.size });
  }
  return positionsToNodes(concepts, positions);
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

function IcoEdges() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="9" r="2.4"/><circle cx="10" cy="19" r="2.4"/><path d="M7 7L17 8.5M8.5 17L6 8.5M12 18L17.5 11"/></svg>;
}
function IcoStar() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 3l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 16.9 6.5 19.9l1.3-6.1L3.2 9.4l6.2-.7z"/></svg>;
}
function IcoSkip() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 5v14M11 5l8 7-8 7z"/></svg>;
}
function IcoReject() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6L18 18M18 6L6 18"/></svg>;
}

function Toggle({ label, on, onClick, icon }: { label: string; on: boolean; onClick: () => void; icon?: React.ReactNode }) {
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ display: 'inline-flex', width: 15, height: 15 }}>{icon}</span>}
        {label}
      </span>
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
  personalCats: Set<string>;   // empty = no filter active
  tags: Set<string>;            // empty = no filter active
  favsOnly: boolean;
  showEdges: boolean;
  showRejected: boolean;
  showSkipped: boolean;
}

type NodeStatus = 'adopted' | 'rejected' | 'skipped';

function MapFilters({ filters, setFilters, search, setSearch, nodes, personalCats, tags, conceptToPersonalCats, conceptToTags, compareFriend, onToggleCompare, friendCompare }: {
  filters: Filters;
  setFilters: (f: Filters | ((p: Filters) => Filters)) => void;
  search: string; setSearch: (s: string) => void;
  nodes: MapNode[];
  personalCats: PersonalCategory[];
  tags: Tag[];
  conceptToPersonalCats: Map<string, Set<string>>;
  conceptToTags: Map<string, Set<string>>;
  compareFriend: boolean;
  onToggleCompare: () => void;
  friendCompare: { common: FriendEntry[]; onlyFriend: FriendEntry[]; onlyYou: Concept[]; commonRejected: FriendEntry[]; similarity: number };
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
        {/* Comparaison avec l'univers d'un ami (démo) */}
        <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '2px dashed var(--cit-navy-dk)' }}>
          <Toggle icon={<span style={{ fontSize: 13 }}>👥</span>} label="Comparer à un ami" on={compareFriend} onClick={onToggleCompare}/>
          {compareFriend && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="cit-h1" style={{ fontSize: 26, color: 'var(--cit-rust)', textShadow: 'none', lineHeight: 0.9 }}>{friendCompare.similarity}%</span>
                <span className="cit-condensed" style={{ fontSize: 9.5, color: 'var(--cit-navy-lt)' }}>de ressemblance · {FRIEND_NAME}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 8 }}>
                {([['En commun', friendCompare.common.length, 'var(--cit-navy)'], ['Que vous', friendCompare.onlyYou.length, 'var(--cit-navy-lt)'], ["Que l'ami", friendCompare.onlyFriend.length, 'var(--cit-rust)'], ['Rejets communs', friendCompare.commonRejected.length, 'var(--cit-brick)']] as const).map(([l, v, c]) => (
                  <div key={l} style={{ border: '2px solid var(--cit-navy-dk)', padding: '3px 6px', background: 'var(--cit-paper)' }}>
                    <div className="cit-h1" style={{ fontSize: 18, color: c, textShadow: 'none', lineHeight: 1 }}>{v}</div>
                    <div className="cit-condensed" style={{ fontSize: 8.5, color: 'var(--cit-navy-lt)' }}>{l}</div>
                  </div>
                ))}
              </div>
              {friendCompare.common.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>★ Concepts communs</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {friendCompare.common.slice(0, 8).map(f => (
                      <span key={f.name} style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9.5, fontWeight: 600, padding: '1px 6px', background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)' }}>{f.name}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="cit-typed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', marginTop: 8, fontStyle: 'italic', lineHeight: 1.35 }}>
                Sur la carte : ⚪ liseré pointillé = concept commun · 👥 = univers de l'ami superposé.
              </div>
            </div>
          )}
        </div>
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
          <Toggle icon={<IcoEdges/>}  label="Voir les liaisons"   on={filters.showEdges}    onClick={() => setFilters(f => ({ ...f, showEdges: !f.showEdges }))}/>
          <Toggle icon={<IcoStar/>}   label="Favoris uniquement"  on={filters.favsOnly}     onClick={() => setFilters(f => ({ ...f, favsOnly: !f.favsOnly }))}/>
          <Toggle icon={<IcoSkip/>}   label="Inclure les passés"  on={filters.showSkipped}  onClick={() => setFilters(f => ({ ...f, showSkipped: !f.showSkipped }))}/>
          <Toggle icon={<IcoReject/>} label="Inclure les rejetés" on={filters.showRejected} onClick={() => setFilters(f => ({ ...f, showRejected: !f.showRejected }))}/>
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

        {personalCats.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Étiquettes personnelles</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {personalCats.map(pc => {
                const count = nodes.filter(n => conceptToPersonalCats.get(n.concept.id)?.has(pc.id)).length;
                const checked = filters.personalCats.has(pc.id);
                return (
                  <CheckBox key={pc.id}
                    checked={checked}
                    color={pc.color}
                    label={pc.name}
                    count={count}
                    onClick={() => setFilters(f => {
                      const next = new Set(f.personalCats);
                      if (next.has(pc.id)) next.delete(pc.id); else next.add(pc.id);
                      return { ...f, personalCats: next };
                    })}/>
                );
              })}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Tags personnels</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tags.map(t => {
                const count = nodes.filter(n => conceptToTags.get(n.concept.id)?.has(t.id)).length;
                if (count === 0) return null;
                const checked = filters.tags.has(t.id);
                return (
                  <button key={t.id} onClick={() => setFilters(f => {
                    const next = new Set(f.tags);
                    if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                    return { ...f, tags: next };
                  })} style={{
                    padding: '2px 8px',
                    background: checked ? 'var(--cit-navy-dk)' : 'transparent',
                    color: checked ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
                    border: '2px solid var(--cit-navy-dk)',
                    fontFamily: "'Special Elite', monospace", fontSize: 11,
                    cursor: 'pointer',
                    boxShadow: checked ? '2px 2px 0 var(--cit-brick)' : 'none',
                  }}>#{t.name} <span style={{ opacity: 0.7 }}>{count}</span></button>
                );
              })}
            </div>
          </div>
        )}
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

function NodeDetailPanel({ node, edges, allNodes, status, links, linkingFrom, onClose, onSecondChance, onStartLink, onDeleteLink, onUpdateLinkNote }: {
  node: MapNode | null; edges: MapEdge[]; allNodes: MapNode[];
  status: NodeStatus;
  links: ConceptLink[];
  linkingFrom: string | null;
  onClose: () => void;
  onSecondChance: () => void;
  onStartLink: () => void;
  onDeleteLink: (linkId: string) => void;
  onUpdateLinkNote: (linkId: string, note: string) => void;
}) {
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkNoteInput, setLinkNoteInput] = useState('');
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
          <img src={node.concept.portrait} alt={node.concept.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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

        {/* Liens manuels existants pour ce nœud */}
        {(() => {
          if (!node) return null;
          const myLinks = links.filter(l => l.conceptAId === node.concept.id || l.conceptBId === node.concept.id);
          if (myLinks.length === 0) return null;
          return (
            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ Liens · {myLinks.length}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {myLinks.map(l => {
                  const otherId = l.conceptAId === node.concept.id ? l.conceptBId : l.conceptAId;
                  const other = allNodes.find(n => n.concept.id === otherId);
                  const typeLabel = l.type === 'wikidata' ? 'Wikidata' : l.type === 'shared-category' ? 'cat. partagée' : 'manuel';
                  const typeBg = l.type === 'wikidata' ? 'var(--cit-navy-dk)' : l.type === 'shared-category' ? 'var(--cit-paper-dk)' : 'var(--cit-butter)';
                  const typeFg = l.type === 'wikidata' ? 'var(--cit-butter)' : 'var(--cit-navy-dk)';
                  return (
                    <div key={l.id} style={{
                      fontFamily: "'Special Elite', monospace", fontSize: 11,
                      padding: '4px 8px',
                      background: typeBg, color: typeFg,
                      border: '2px solid var(--cit-navy-dk)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                        <span><span style={{ opacity: 0.7, fontSize: 9, marginRight: 4 }}>[{typeLabel}]</span>{other?.concept.name ?? otherId.slice(0, 8)}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => {
                            setEditingLinkId(editingLinkId === l.id ? null : l.id);
                            setLinkNoteInput(l.note ?? '');
                          }} style={{
                            background: 'transparent', border: 'none',
                            color: typeFg, cursor: 'pointer', padding: 0, fontSize: 11,
                          }} title={l.note ? 'Modifier la note' : 'Ajouter une note'}>✎</button>
                          <button onClick={() => onDeleteLink(l.id)} style={{
                            background: 'transparent', border: 'none',
                            color: l.type === 'wikidata' ? 'var(--cit-butter)' : 'var(--cit-brick)',
                            cursor: 'pointer', padding: 0, fontSize: 10,
                          }}>✕</button>
                        </div>
                      </div>
                      {editingLinkId === l.id ? (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                          <input value={linkNoteInput} onChange={e => setLinkNoteInput(e.target.value)}
                            placeholder="Note sur ce lien…"
                            autoFocus
                            style={{
                              flex: 1, padding: '2px 6px',
                              border: '1.5px solid var(--cit-navy-dk)',
                              background: 'var(--cit-cream)',
                              fontFamily: "'Special Elite', monospace", fontSize: 10,
                              color: 'var(--cit-navy-dk)',
                            }}/>
                          <button onClick={() => { onUpdateLinkNote(l.id, linkNoteInput); setEditingLinkId(null); }} style={{
                            padding: '1px 6px',
                            background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                            border: 'none', fontFamily: "'Alfa Slab One', serif", fontSize: 10,
                            cursor: 'pointer',
                          }}>✓</button>
                        </div>
                      ) : l.note ? (
                        <div style={{ fontSize: 10, fontStyle: 'italic', marginTop: 2, opacity: 0.85 }}>
                          « {l.note} »
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
          <CitButton size="sm" tone={linkingFrom === node.concept.id ? 'brick' : 'butter'} style={{ width: '100%', justifyContent: 'center' }} onClick={onStartLink}>
            {linkingFrom === node.concept.id ? '⋯ Cliquez un autre nœud pour lier · ✕ pour annuler' : '⊕ Lier à un autre concept'}
          </CitButton>
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

function MapGraph({ nodes, edges, selectedId, onSelect, showEdges, statusFor, fullscreen, onFullscreenToggle, friendNodes, commonNames }: {
  nodes: MapNode[]; edges: MapEdge[];
  selectedId: string | null; onSelect: (id: string) => void;
  showEdges: boolean;
  statusFor: (id: string) => NodeStatus;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
  friendNodes?: MapNode[];
  commonNames?: Set<string>;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [miniMapCollapsed, setMiniMapCollapsed] = useState(false);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const onPanDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPanMove = (e: React.PointerEvent) => {
    if (!panStart.current) return;
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.x),
      y: panStart.current.py + (e.clientY - panStart.current.y),
    });
  };
  const onPanUp = () => { panStart.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    const delta = -e.deltaY * 0.001;
    setZoom(z => Math.max(0.4, Math.min(3, z + delta)));
  };
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const hoverNode = hoverId ? nodes.find(n => n.concept.id === hoverId) : null;

  // Calcule l'ensemble des nœuds connectés au nœud sélectionné
  const connectedSet = useMemo(() => {
    if (!selectedId) return null;
    const s = new Set<string>([selectedId]);
    edges.forEach(e => {
      if (e.a === selectedId) s.add(e.b);
      else if (e.b === selectedId) s.add(e.a);
    });
    return s;
  }, [selectedId, edges]);

  // ---- Mode canvas haute performance au-delà de 500 nœuds ----
  const useCanvas = nodes.length > 500;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!useCanvas) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const W = rect.width, H = rect.height;
    // Reproduit translate(pan) scale(zoom) avec origine centre
    ctx.save();
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    const px = (n: MapNode) => ({ x: (n.x / 100) * W, y: (n.y / 100) * H });

    if (showEdges) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'oklch(20% 0.07 250 / 0.4)';
      edges.forEach(e => {
        const A = nodes.find(n => n.concept.id === e.a);
        const B = nodes.find(n => n.concept.id === e.b);
        if (!A || !B) return;
        const pa = px(A), pb = px(B);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      });
    }
    nodes.forEach(n => {
      const p = px(n);
      const r = Math.max(3, n.size / 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.dominant;
      ctx.fill();
      ctx.lineWidth = selectedId === n.concept.id ? 3 : 1;
      ctx.strokeStyle = selectedId === n.concept.id ? 'var(--cit-brick)' : 'oklch(20% 0.07 250)';
      ctx.stroke();
    });
    ctx.restore();
  }, [useCanvas, nodes, edges, zoom, pan, selectedId, showEdges]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Inversion du transform (translate centre → scale → translate)
    const fx = (cx - (W / 2 + pan.x)) / zoom + W / 2;
    const fy = (cy - (H / 2 + pan.y)) / zoom + H / 2;
    let best: { id: string; d: number } | null = null;
    nodes.forEach(n => {
      const nx = (n.x / 100) * W, ny = (n.y / 100) * H;
      const d = Math.hypot(nx - fx, ny - fy);
      const r = Math.max(6, n.size / 2 + 4);
      if (d <= r && (!best || d < best.d)) best = { id: n.concept.id, d };
    });
    if (best) onSelect((best as { id: string }).id);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerLeave={onPanUp}
      onWheel={onWheel}
      style={{
        position: 'relative',
        background: 'radial-gradient(circle at 50% 50%, var(--cit-paper) 0%, var(--cit-paper-dk) 100%)',
        border: '3px solid var(--cit-navy-dk)',
        overflow: 'hidden', height: '100%',
        cursor: panStart.current ? 'grabbing' : 'grab',
        touchAction: 'none',
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

      {/* Mode canvas (> 500 nœuds) : rendu performant sans DOM par nœud */}
      {useCanvas && (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}

      {/* Couche transformée (pan + zoom) DOM — uniquement ≤ 500 nœuds */}
      {!useCanvas && (
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center center',
        transition: panStart.current ? 'none' : 'transform 0.15s ease',
      }}>
      {showEdges && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
          {edges.map((e, i) => {
            const A = nodes.find(n => n.concept.id === e.a);
            const B = nodes.find(n => n.concept.id === e.b);
            if (!A || !B) return null;
            const isSelected = selectedId === e.a || selectedId === e.b;
            const dimmed = selectedId !== null && !isSelected;
            return (
              <line key={i}
                x1={`${A.x}%`} y1={`${A.y}%`}
                x2={`${B.x}%`} y2={`${B.y}%`}
                stroke={isSelected ? 'var(--cit-brick)' : 'var(--cit-navy-dk)'}
                strokeWidth={isSelected ? 2.5 : 1.2}
                strokeDasharray={isSelected ? '' : '3 3'}
                opacity={dimmed ? 0.1 : (isSelected ? 1 : 0.5)}/>
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
        const baseOpacity = isReject ? 0.3 : isSkip ? 0.5 : 1;
        const dimmed = connectedSet !== null && !connectedSet.has(n.concept.id);
        const opacity = dimmed ? 0.15 : baseOpacity;
        return (
          <div key={n.concept.id} data-node
            onClick={(e) => { e.stopPropagation(); onSelect(n.concept.id); }}
            onPointerEnter={(e) => {
              setHoverId(n.concept.id);
              setHoverPos({ x: e.clientX, y: e.clientY });
            }}
            onPointerMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
            onPointerLeave={() => setHoverId(null)}
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
              backgroundImage: n.concept.portrait?.startsWith('http') ? `url(${n.concept.portrait})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
              border: `3px solid ${isSelected ? 'var(--cit-brick)' : 'var(--cit-navy-dk)'}`,
              borderRadius: '50%',
              boxShadow: isSelected
                ? '4px 4px 0 var(--cit-navy-dk), 0 0 0 8px oklch(96% 0.02 85 / 0.6)'
                : '3px 3px 0 var(--cit-navy-dk)',
              transition: 'all .2s ease',
              position: 'relative',
            }}>
              {commonNames?.has(normName(n.concept.name)) && (
                <span style={{
                  position: 'absolute', inset: -5, borderRadius: '50%',
                  border: '2.5px dashed var(--cit-rust)', pointerEvents: 'none',
                }}/>
              )}
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
            {/* Perf mode : si > 200 nœuds, on cache les labels sauf hover/select */}
            {(nodes.length <= 200 || isSelected || hoverId === n.concept.id) && (
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
            )}
          </div>
        );
      })}
      {/* Nœuds fantômes de l'ami (univers superposé) */}
      {friendNodes?.map(n => (
        <div key={n.concept.id} style={{
          position: 'absolute', left: `${n.x}%`, top: `${n.y}%`,
          transform: 'translate(-50%, -50%)', zIndex: 1, pointerEvents: 'none',
        }}>
          <div style={{
            position: 'relative', width: n.size * 2, height: n.size * 2,
            background: n.dominant, border: '2.5px dashed var(--cit-rust)',
            borderRadius: '50%', opacity: 0.8,
          }}>
            <span style={{ position: 'absolute', top: -8, right: -8, fontSize: 11 }}>👥</span>
          </div>
          <div style={{
            position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 3px)',
            fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 600, color: 'var(--cit-rust)',
            whiteSpace: 'nowrap', textShadow: '1px 1px 0 var(--cit-cream)',
          }}>{n.concept.name}</div>
        </div>
      ))}
      </div>
      )}{/* fin couche transformée */}

      {/* Mini-map repliable */}
      {nodes.length > 0 && miniMapCollapsed && (
        <button onClick={() => setMiniMapCollapsed(false)} title="Afficher la mini-carte" style={{
          position: 'absolute', top: 8, left: 8, zIndex: 5,
          background: 'var(--cit-cream)', color: 'var(--cit-navy-dk)',
          border: '2px solid var(--cit-navy-dk)',
          boxShadow: '2px 2px 0 var(--cit-navy-dk)',
          fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
          letterSpacing: '.12em', textTransform: 'uppercase',
          padding: '4px 8px', cursor: 'pointer',
        }}>▢ Mini-carte</button>
      )}
      {nodes.length > 0 && !miniMapCollapsed && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 5,
          width: 140, height: 100,
          background: 'oklch(96% 0.025 90 / 0.85)',
          border: '2px solid var(--cit-navy-dk)',
          boxShadow: '3px 3px 0 var(--cit-navy-dk)',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--cit-navy-dk)' }}>
            <span className="cit-condensed" style={{ fontSize: 8, color: 'var(--cit-navy-lt)', padding: '2px 4px' }}>
              ★ {nodes.length} NŒUDS
            </span>
            <button onClick={() => setMiniMapCollapsed(true)} title="Replier" style={{
              background: 'transparent', border: 'none', color: 'var(--cit-brick)',
              cursor: 'pointer', fontSize: 11, padding: '0 4px', fontFamily: "'Alfa Slab One', serif",
            }}>−</button>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 80 }}>
            {nodes.map(n => (
              <span key={n.concept.id} style={{
                position: 'absolute',
                left: `${n.x}%`, top: `${n.y}%`,
                width: 4, height: 4,
                transform: 'translate(-50%, -50%)',
                background: selectedId === n.concept.id ? 'var(--cit-brick)' : n.dominant,
                border: '0.5px solid var(--cit-navy-dk)',
              }}/>
            ))}
            {/* Viewport indicator (basé sur pan/zoom) */}
            <div style={{
              position: 'absolute',
              left: `${Math.max(0, Math.min(80, 50 - (50 / zoom) - (pan.x / 10)))}%`,
              top: `${Math.max(0, Math.min(70, 50 - (40 / zoom) - (pan.y / 10)))}%`,
              width: `${Math.min(100, 100 / zoom)}%`,
              height: `${Math.min(100, 80 / zoom)}%`,
              border: '1.5px solid var(--cit-brick)',
              pointerEvents: 'none',
            }}/>
          </div>
        </div>
      )}

      {/* Tooltip flottante au hover */}
      {hoverNode && (
        <div style={{
          position: 'absolute',
          left: Math.min(hoverPos.x + 14, 9999),
          top: Math.max(hoverPos.y - 60, 0),
          pointerEvents: 'none', zIndex: 6,
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
          padding: '6px 10px',
          border: '2px solid var(--cit-navy-dk)',
          boxShadow: '3px 3px 0 var(--cit-brick)',
          fontFamily: "'Special Elite', monospace", fontSize: 11,
          maxWidth: 240,
        }}>
          <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 14, lineHeight: 1 }}>{hoverNode.concept.name}</div>
          <div style={{ color: 'var(--cit-cream)', marginTop: 2 }}>
            {CATEGORIES[hoverNode.concept.cats[0]?.[0] ?? 'personnages'].label}
            {' · '}{edges.filter(e => e.a === hoverNode.concept.id || e.b === hoverNode.concept.id).length} liaison{edges.filter(e => e.a === hoverNode.concept.id || e.b === hoverNode.concept.id).length > 1 ? 's' : ''}
          </div>
        </div>
      )}

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

      {/* Zoom controls + fullscreen */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        display: 'flex', flexDirection: 'column', gap: 4, zIndex: 5,
      }}>
        <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(3, z + 0.2)); }} style={{
          width: 36, height: 36, background: 'var(--cit-cream)',
          border: '2px solid var(--cit-navy-dk)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 18,
          color: 'var(--cit-navy-dk)', cursor: 'pointer',
          boxShadow: '2px 2px 0 var(--cit-navy-dk)',
        }}>+</button>
        <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.4, z - 0.2)); }} style={{
          width: 36, height: 36, background: 'var(--cit-cream)',
          border: '2px solid var(--cit-navy-dk)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 18,
          color: 'var(--cit-navy-dk)', cursor: 'pointer',
          boxShadow: '2px 2px 0 var(--cit-navy-dk)',
        }}>−</button>
        <button onClick={(e) => { e.stopPropagation(); reset(); }} title="Recentrer" style={{
          width: 36, height: 36, background: 'var(--cit-navy-dk)',
          color: 'var(--cit-butter)',
          border: '2px solid var(--cit-navy-dk)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 14,
          cursor: 'pointer', boxShadow: '2px 2px 0 var(--cit-brick)',
        }}>⌖</button>
        <button onClick={(e) => { e.stopPropagation(); onFullscreenToggle(); }} title={fullscreen ? 'Quitter plein écran' : 'Plein écran'} style={{
          width: 36, height: 36, background: fullscreen ? 'var(--cit-brick)' : 'var(--cit-butter)',
          color: 'var(--cit-navy-dk)',
          border: '2px solid var(--cit-navy-dk)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 16,
          cursor: 'pointer', boxShadow: '2px 2px 0 var(--cit-navy-dk)',
        }}>{fullscreen ? '↘' : '↗'}</button>
        <div style={{
          padding: '2px 6px', background: 'var(--cit-cream)',
          border: '2px solid var(--cit-navy-dk)',
          fontFamily: "'Special Elite', monospace", fontSize: 9, textAlign: 'center',
          color: 'var(--cit-navy-dk)',
        }}>{Math.round(zoom * 100)}%</div>
      </div>
    </div>
  );
}

export function MapScreen({ onTabChange }: Props) {
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [rejected, setRejected] = useState<Concept[]>([]);
  const [skipped, setSkipped] = useState<Concept[]>([]);
  const [manualLinks, setManualLinks] = useState<ConceptLink[]>([]);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [personalCats, setPersonalCats] = useState<PersonalCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [conceptToPersonalCats, setConceptToPersonalCats] = useState<Map<string, Set<string>>>(new Map());
  const [conceptToTags, setConceptToTags] = useState<Map<string, Set<string>>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    cats: Object.fromEntries(CATEGORY_LIST.map(c => [c.key, true])),
    personalCats: new Set(),
    tags: new Set(),
    favsOnly: false,
    showEdges: true,
    showRejected: false,
    showSkipped: false,
  });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [compareFriend, setCompareFriend] = useState(false);

  // #23 — persistance des filtres de carte (catégories perso, étiquettes, toggles)
  const filtersRestored = useRef(false);
  useEffect(() => {
    getFilterState<{
      cats?: Record<string, boolean>; personalCats?: string[]; tags?: string[];
      favsOnly?: boolean; showEdges?: boolean; showRejected?: boolean; showSkipped?: boolean;
    }>('map.filters').then(saved => {
      if (saved) {
        setFilters(f => ({
          ...f,
          cats: saved.cats ?? f.cats,
          personalCats: new Set(saved.personalCats ?? []),
          tags: new Set(saved.tags ?? []),
          favsOnly: saved.favsOnly ?? f.favsOnly,
          showEdges: saved.showEdges ?? f.showEdges,
          showRejected: saved.showRejected ?? f.showRejected,
          showSkipped: saved.showSkipped ?? f.showSkipped,
        }));
      }
      filtersRestored.current = true;
    });
  }, []);
  useEffect(() => {
    if (!filtersRestored.current) return;
    setFilterState('map.filters', {
      cats: filters.cats,
      personalCats: [...filters.personalCats],
      tags: [...filters.tags],
      favsOnly: filters.favsOnly,
      showEdges: filters.showEdges,
      showRejected: filters.showRejected,
      showSkipped: filters.showSkipped,
    });
  }, [filters]);
  const [discovering, setDiscovering] = useState<{ active: boolean; current: number; total: number; created: number }>({ active: false, current: 0, total: 0, created: 0 });
  const toast = useToast();

  const discoverLinks = async () => {
    const candidates = adopted.filter(c => c.wikidataId);
    if (candidates.length < 2) {
      toast.show({ tone: 'warning', title: 'Pas assez de concepts Wikidata', body: 'Adoptez au moins 2 concepts liés à Wikidata pour découvrir les liaisons.' });
      return;
    }
    // Index par Q-ID pour matching rapide
    const qidToId = new Map<string, string>();
    candidates.forEach(c => { if (c.wikidataId) qidToId.set(c.wikidataId, c.id); });

    setDiscovering({ active: true, current: 0, total: candidates.length, created: 0 });
    let created = 0;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      setDiscovering(d => ({ ...d, current: i + 1 }));
      if (!c.wikidataId) continue;
      try {
        const relatedQids = await fetchRelatedQids(c.wikidataId);
        for (const targetQid of relatedQids) {
          const targetId = qidToId.get(targetQid);
          if (targetId && targetId !== c.id) {
            const link = await createLink(c.id, targetId, { type: 'wikidata', strength: 2 });
            if (link.createdAt && Date.now() - +link.createdAt < 3000) created++;
          }
        }
      } catch { /* skip on error */ }
      // Petit délai pour Wikidata
      await new Promise(r => setTimeout(r, 200));
    }
    setDiscovering({ active: false, current: 0, total: 0, created });
    toast.show({
      tone: 'success',
      title: 'Découverte terminée',
      body: `${created} nouveau${created > 1 ? 'x' : ''} lien${created > 1 ? 's' : ''} Wikidata créé${created > 1 ? 's' : ''}.`,
    });
    loadAll();
  };

  const loadAll = async () => {
    const [a, r, s, l, pcs, ts, pcLinks, tLinks] = await Promise.all([
      getAdoptedConcepts(),
      getConceptsByVerdict('reject'),
      getConceptsByVerdict('skip'),
      getAllLinks(),
      getAllPersonalCategories(),
      getAllTags(),
      db.conceptPersonalCategories.toArray(),
      db.conceptTags.toArray(),
    ]);
    setAdopted(a); setRejected(r); setSkipped(s); setManualLinks(l);
    setPersonalCats(pcs); setTags(ts);
    const cpcMap = new Map<string, Set<string>>();
    pcLinks.forEach(link => {
      if (!cpcMap.has(link.conceptId)) cpcMap.set(link.conceptId, new Set());
      cpcMap.get(link.conceptId)!.add(link.categoryId);
    });
    setConceptToPersonalCats(cpcMap);
    const ctMap = new Map<string, Set<string>>();
    tLinks.forEach(link => {
      if (!ctMap.has(link.conceptId)) ctMap.set(link.conceptId, new Set());
      ctMap.get(link.conceptId)!.add(link.tagId);
    });
    setConceptToTags(ctMap);
    setLoaded(true);
  };

  useEffect(() => { loadAll().catch(() => setLoaded(true)); }, []);

  const statusFor = (id: string): NodeStatus =>
    adopted.find(c => c.id === id) ? 'adopted'
    : rejected.find(c => c.id === id) ? 'rejected'
    : 'skipped';

  // Comparaison avec l'univers (fictif) d'un ami
  const friendCompare = useMemo(() => {
    const uAdopt = new Map(adopted.map(c => [normName(c.name), c] as const));
    const uReject = new Set(rejected.map(c => normName(c.name)));
    const fAdopt = FRIEND_UNIVERSE.filter(f => f.verdict === 'adopted');
    const fReject = FRIEND_UNIVERSE.filter(f => f.verdict === 'rejected');
    const fAdoptNames = new Set(fAdopt.map(f => normName(f.name)));
    const common = fAdopt.filter(f => uAdopt.has(normName(f.name)));
    const onlyFriend = fAdopt.filter(f => !uAdopt.has(normName(f.name)));
    const onlyYou = adopted.filter(c => !fAdoptNames.has(normName(c.name)));
    const commonRejected = fReject.filter(f => uReject.has(normName(f.name)));
    const union = new Set([...uAdopt.keys(), ...fAdoptNames]);
    const similarity = union.size ? Math.round((common.length / union.size) * 100) : 0;
    return { common, onlyFriend, onlyYou, commonRejected, similarity };
  }, [adopted, rejected]);
  const commonNames = useMemo(() => new Set(friendCompare.common.map(f => normName(f.name))), [friendCompare]);
  const friendNodes = useMemo<MapNode[]>(() => {
    if (!compareFriend) return [];
    return friendCompare.onlyFriend.map(f => {
      const p = hashPos(f.name);
      return {
        concept: { id: `friend:${normName(f.name)}`, name: f.name, kind: 'Ami', cats: f.cats, blurb: '', refs: [] } as Concept,
        x: p.x, y: p.y, size: 9, dominant: conceptDominant(f.cats).css,
      };
    });
  }, [compareFriend, friendCompare]);

  // Combine concepts based on toggles
  const allConcepts = useMemo(() => {
    const list = [...adopted];
    if (filters.showRejected) list.push(...rejected);
    if (filters.showSkipped) list.push(...skipped);
    return list;
  }, [adopted, rejected, skipped, filters.showRejected, filters.showSkipped]);

  // Layout : synchrone pour ≤ 200 nœuds, sinon offload dans un Web Worker
  // pour ne pas bloquer l'UI (#20). Fallback sync si le worker échoue.
  const WORKER_THRESHOLD = 200;
  const [asyncNodes, setAsyncNodes] = useState<MapNode[] | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);

  // #26 — positions persistées : seed du layout pour éviter les sauts au reload
  // ou à l'ajout de concepts. Vide tant que non chargé.
  const [savedPositions, setSavedPositions] = useState<SeedMap | undefined>(undefined);
  useEffect(() => {
    getFilterState<SeedMap>('map.positions').then(p => { if (p) setSavedPositions(p); });
  }, []);

  const syncNodes = useMemo(
    () => {
      if (allConcepts.length > WORKER_THRESHOLD) return [];
      return nodesFromSeed(allConcepts, savedPositions) ?? layoutNodes(allConcepts, savedPositions);
    },
    [allConcepts, savedPositions],
  );

  useEffect(() => {
    if (allConcepts.length <= WORKER_THRESHOLD) { setAsyncNodes(null); return; }
    const seeded = nodesFromSeed(allConcepts, savedPositions);
    if (seeded) { setAsyncNodes(seeded); return; }
    let cancelled = false;
    const reqId = ++reqIdRef.current;
    try {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
      }
      const worker = workerRef.current;
      const onMsg = (e: MessageEvent<{ positions: LayoutPosition[]; reqId: number }>) => {
        if (cancelled || e.data.reqId !== reqId) return;
        setAsyncNodes(positionsToNodes(allConcepts, e.data.positions));
      };
      worker.addEventListener('message', onMsg, { once: true });
      worker.postMessage({
        items: allConcepts.map(c => ({ id: c.id, cats: c.cats.map(([k]) => k), isFavorite: !!c.isFavorite })),
        seed: savedPositions,
        reqId,
      });
      return () => { cancelled = true; worker.removeEventListener('message', onMsg); };
    } catch {
      // Fallback synchrone si les workers ne sont pas dispo
      setAsyncNodes(layoutNodes(allConcepts, savedPositions));
    }
  }, [allConcepts, savedPositions]);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  const allNodes = allConcepts.length <= WORKER_THRESHOLD ? syncNodes : (asyncNodes ?? []);

  // Persiste les positions calculées dès qu'elles ne correspondent plus au seed.
  useEffect(() => {
    if (allNodes.length === 0) return;
    if (savedPositions && allConcepts.every(c => savedPositions[c.id])) return;
    const map: SeedMap = {};
    allNodes.forEach(n => { map[n.concept.id] = { x: n.x, y: n.y, size: n.size }; });
    setSavedPositions(map);
    setFilterState('map.positions', map);
  }, [allNodes]);
  const filteredNodes = useMemo(() => allNodes.filter(n => {
    const dominantCat = n.concept.cats[0]?.[0] as CategoryKey | undefined;
    if (dominantCat && !filters.cats[dominantCat]) return false;
    if (filters.favsOnly && !n.concept.isFavorite) return false;
    if (filters.personalCats.size > 0) {
      const myPcs = conceptToPersonalCats.get(n.concept.id);
      if (!myPcs || ![...filters.personalCats].some(id => myPcs.has(id))) return false;
    }
    if (filters.tags.size > 0) {
      const myTags = conceptToTags.get(n.concept.id);
      if (!myTags || ![...filters.tags].some(id => myTags.has(id))) return false;
    }
    if (search && !n.concept.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [allNodes, filters, search, conceptToPersonalCats, conceptToTags]);

  const inferredEdges = useMemo(() => buildEdges(filteredNodes), [filteredNodes]);
  // Combine inferred edges + manual links (deduplicated)
  const edges: MapEdge[] = useMemo(() => {
    const ids = new Set(filteredNodes.map(n => n.concept.id));
    const inferredKeys = new Set(inferredEdges.map(e => [e.a, e.b].sort().join('|')));
    const all = [...inferredEdges];
    manualLinks.forEach(l => {
      if (!ids.has(l.conceptAId) || !ids.has(l.conceptBId)) return;
      const key = [l.conceptAId, l.conceptBId].sort().join('|');
      if (inferredKeys.has(key)) return;
      all.push({ a: l.conceptAId, b: l.conceptBId });
    });
    return all;
  }, [inferredEdges, manualLinks, filteredNodes]);
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
      {!fullscreen && (
        <CitizenMasthead
          kicker="Voici votre"
          title="UNIVERS"
          active="map"
          onTabChange={onTabChange}
          right={<>
            <CitButton size="sm" onClick={discoverLinks}>
              {discovering.active
                ? `⌛ Découverte ${discovering.current}/${discovering.total}…`
                : '★ Découvrir liaisons Wikidata'}
            </CitButton>
            <CitButton size="sm" tone="butter" disabled={filteredNodes.length === 0} onClick={() => exportMapPng(filteredNodes, edges, filters.showEdges)}>
              ⤓ Export PNG
            </CitButton>
            <Stamp tone="brick" rotate={-5} size={12}>★ {adopted.length} NŒUDS ADOPTÉS</Stamp>
            <Sunburst size={68} color="var(--cit-mustard)"/>
          </>}
        />
      )}

      {adopted.length > 0 && adopted.length < 10 && !fullscreen && (
        <div style={{
          padding: '8px 32px',
          background: 'var(--cit-butter)',
          borderBottom: '2px solid var(--cit-navy-dk)',
          textAlign: 'center',
          fontFamily: "'Special Elite', monospace", fontSize: 12, color: 'var(--cit-navy-dk)',
        }}>
          ★ Votre univers commence à prendre forme — continuez à adopter pour faire émerger les liaisons.
        </div>
      )}

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: fullscreen ? '1fr' : (selected ? '280px 1fr 340px' : '280px 1fr'),
        gap: 0, zIndex: 3, position: 'relative', overflow: 'hidden',
      }}>
        {!fullscreen && (
          <MapFilters
            filters={filters} setFilters={setFilters}
            search={search} setSearch={setSearch}
            nodes={allNodes}
            personalCats={personalCats}
            tags={tags}
            conceptToPersonalCats={conceptToPersonalCats}
            conceptToTags={conceptToTags}
            compareFriend={compareFriend}
            onToggleCompare={() => setCompareFriend(v => !v)}
            friendCompare={friendCompare}
          />
        )}

        <div style={{ padding: '0 14px' }}>
          <MapGraph
            nodes={filteredNodes} edges={edges}
            selectedId={selectedId}
            onSelect={async (id) => {
              if (linkingFrom && id !== linkingFrom) {
                await createLink(linkingFrom, id);
                const fromNode = filteredNodes.find(n => n.concept.id === linkingFrom);
                const toNode = filteredNodes.find(n => n.concept.id === id);
                toast.show({ tone: 'success', title: 'Lien créé', body: `« ${fromNode?.concept.name} » ↔ « ${toNode?.concept.name} »` });
                setLinkingFrom(null);
                loadAll();
              } else {
                setSelectedId(id);
              }
            }}
            showEdges={filters.showEdges}
            statusFor={statusFor}
            fullscreen={fullscreen}
            onFullscreenToggle={() => setFullscreen(v => !v)}
            friendNodes={compareFriend ? friendNodes : undefined}
            commonNames={compareFriend ? commonNames : undefined}
          />
        </div>

        {selected && !fullscreen && (
          <NodeDetailPanel
            node={selected} edges={edges} allNodes={filteredNodes}
            status={statusFor(selected.concept.id)}
            links={manualLinks}
            linkingFrom={linkingFrom}
            onStartLink={() => {
              if (linkingFrom === selected.concept.id) setLinkingFrom(null);
              else setLinkingFrom(selected.concept.id);
            }}
            onDeleteLink={async (linkId) => {
              await deleteLink(linkId);
              toast.show({ tone: 'info', title: 'Lien supprimé' });
              loadAll();
            }}
            onUpdateLinkNote={async (linkId, note) => {
              await updateLinkNote(linkId, note);
              toast.show({ tone: 'success', title: 'Note mise à jour' });
              loadAll();
            }}
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
