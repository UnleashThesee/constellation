import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '../../lib/motion';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { IdeaModal } from '../../components/ui/IdeaModal';
import { ConceptDetailModal } from '../../components/ui/ConceptDetailModal';
import { CATEGORIES } from '../../lib/categories';
import { getAllIdeas, getCachedConcept, getFilterState, setFilterState } from '../../stores/db';
import { relativeDate } from '../../lib/dates';
import type { Idea, IdeaStatus, Concept } from '../../types';

interface Props { onTabChange?: (id: string) => void }

const STATUS_LABELS: Record<IdeaStatus, string> = {
  new: 'Nouvelle',
  inprogress: 'En cours',
  abandoned: 'Abandonnée',
  done: 'Réalisée',
};

const STATUS_COLORS: Record<IdeaStatus, string> = {
  new: 'var(--cit-navy)',
  inprogress: 'var(--cit-mustard)',
  abandoned: 'var(--cit-brick)',
  done: 'var(--cit-rust)',
};

function GenerateBanner({ onCombine }: { onCombine: () => void }) {
  return (
    <div style={{
      background: 'var(--cit-brick)', color: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      padding: '18px 22px',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 22,
      alignItems: 'center', marginBottom: 18,
      position: 'relative', overflow: 'hidden',
    }}>
      <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.6 }}/>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
        <Sunburst size={88} color="var(--cit-butter)"/>
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="cit-script" style={{ fontSize: 28, color: 'var(--cit-butter)', lineHeight: 0.9 }}>
          Vous voulez
        </div>
        <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 38, lineHeight: 0.9 }}>
          UNE NOUVELLE IDÉE ?
        </div>
        <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)', marginTop: 4 }}>
          Croisez 2 à 5 concepts (les vôtres ou n'importe lesquels), le Bureau invente.
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CitButton tone="butter" onClick={onCombine}>✚ GÉNÉRER DES IDÉES</CitButton>
      </div>
    </div>
  );
}

function IdeaCard({ idea, conceptsById, onOpen }: {
  idea: Idea; conceptsById: Record<string, Concept>; onOpen: () => void;
}) {
  return (
    <button onClick={onOpen} style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      borderLeft: idea.inheritedOklch ? `12px solid ${idea.inheritedOklch}` : '12px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      padding: 0, cursor: 'pointer',
      textAlign: 'left',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {idea.isFavorite && (
        <span style={{ position: 'absolute', top: -10, right: -10, zIndex: 3 }}>
          <Aster size={28} rotate={12}/>
        </span>
      )}
      <div style={{ padding: '10px 14px', borderBottom: '2px solid var(--cit-navy-dk)' }}>
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>
          ★ {idea.outputType.toUpperCase()} · {relativeDate(idea.createdAt).toUpperCase()}
        </div>
        <h3 className="cit-h1" style={{ fontSize: 20, lineHeight: 0.95, margin: '2px 0 0' }}>
          {idea.title}<span style={{ color: 'var(--cit-brick)' }}>!</span>
        </h3>
      </div>
      <p className="cit-typed" style={{
        margin: 0, padding: '10px 14px', fontSize: 12, lineHeight: 1.55, flex: 1,
        color: 'var(--cit-navy-dk)',
        display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {idea.content}
      </p>
      <div style={{ padding: '8px 14px', borderTop: '2px dashed var(--cit-navy-dk)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {idea.conceptIdsWithWeights.slice(0, 4).map((it, i) => {
            const c = conceptsById[it.conceptId];
            if (!c) return null;
            const cat = CATEGORIES[c.cats[0]?.[0] ?? 'personnages'];
            return (
              <span key={i} className="cit-condensed" style={{
                fontSize: 9, padding: '1px 6px',
                background: cat.oklch, color: 'var(--cit-cream)',
                border: '1.5px solid var(--cit-navy-dk)',
                fontWeight: 700,
                textShadow: '1px 1px 0 oklch(0% 0 0 / 0.5)',
              }}>{c.name} {it.weight}%</span>
            );
          })}
        </div>
        {idea.constraints.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {idea.constraints.slice(0, 3).map((cn, i) => (
              <span key={i} className="cit-condensed" style={{
                fontSize: 9, padding: '1px 6px',
                background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                border: '1.5px solid var(--cit-navy-dk)',
                fontWeight: 700,
              }}>✓ {cn}</span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            padding: '1px 7px',
            background: STATUS_COLORS[idea.status],
            color: 'var(--cit-cream)',
            fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 700,
            letterSpacing: '.10em', textTransform: 'uppercase',
            border: '1.5px solid var(--cit-navy-dk)',
          }}>{STATUS_LABELS[idea.status]}</span>
          <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 10, color: 'var(--cit-navy-lt)' }}>
            détails ›
          </span>
        </div>
      </div>
    </button>
  );
}

export function IdeasScreen({ onTabChange }: Props) {
  const [filter, setFilter] = useState<'all' | 'fav' | IdeaStatus>('all');
  const [sort, setSort] = useState<'recent' | 'alpha' | 'status'>('recent');
  // #23 — persistance filtre + tri
  useEffect(() => {
    getFilterState<{ filter?: 'all' | 'fav' | IdeaStatus; sort?: 'recent' | 'alpha' | 'status' }>('ideas').then(s => {
      if (s?.filter) setFilter(s.filter);
      if (s?.sort) setSort(s.sort);
    });
  }, []);
  const changeFilter = (f: 'all' | 'fav' | IdeaStatus) => { setFilter(f); setFilterState('ideas', { filter: f, sort }); };
  const changeSort = (s: 'recent' | 'alpha' | 'status') => { setSort(s); setFilterState('ideas', { filter, sort: s }); };
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [conceptsById, setConceptsById] = useState<Record<string, Concept>>({});
  const [openIdea, setOpenIdea] = useState<Idea | null>(null);
  const [conceptDetail, setConceptDetail] = useState<Concept | null>(null);
  const [search, setSearch] = useState('');
  const [conceptFilter, setConceptFilter] = useState<string>('');
  const [constraintFilter, setConstraintFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');

  const load = async () => {
    const arr = await getAllIdeas();
    setIdeas(arr);
    const ids = new Set<string>();
    arr.forEach(i => i.conceptIdsWithWeights.forEach(cw => ids.add(cw.conceptId)));
    const cs = await Promise.all([...ids].map(id => getCachedConcept(id)));
    const byId: Record<string, Concept> = {};
    cs.forEach(c => { if (c) byId[c.id] = c; });
    setConceptsById(byId);
  };

  useEffect(() => { load(); }, []);

  const filtered = ideas.filter(i => {
    if (filter !== 'all' && filter !== 'fav' && i.status !== filter) return false;
    if (filter === 'fav' && !i.isFavorite) return false;
    if (conceptFilter && !i.conceptIdsWithWeights.some(w => w.conceptId === conceptFilter)) return false;
    if (constraintFilter && !i.constraints.includes(constraintFilter)) return false;
    if (tagFilter && !i.tags.includes(tagFilter)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!i.title.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const STATUS_ORDER: Record<IdeaStatus, number> = { new: 0, inprogress: 1, done: 2, abandoned: 3 };
  const sorted = [...filtered].sort((a, b) =>
    sort === 'alpha' ? a.title.localeCompare(b.title)
    : sort === 'status' ? STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    : +b.createdAt - +a.createdAt
  );

  // Available filter values
  const allConcepts = Array.from(new Set(ideas.flatMap(i => i.conceptIdsWithWeights.map(w => w.conceptId))));
  const allConstraints = Array.from(new Set(ideas.flatMap(i => i.constraints)));
  const allTags = Array.from(new Set(ideas.flatMap(i => i.tags)));

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Voici vos"
        title="IDÉES"
        active="ideas"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-4}>{String(ideas.length).padStart(2, '0')} GÉNÉRÉE{ideas.length > 1 ? 'S' : ''}</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        flex: 1, padding: '20px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        <GenerateBanner onCombine={() => onTabChange?.('combine')}/>

        {ideas.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 0', marginBottom: 14,
            borderBottom: '2px dashed var(--cit-navy-dk)',
          }}>
            <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ AFFICHER :</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { id: 'all' as const,        label: `Toutes (${ideas.length})` },
                { id: 'fav' as const,        label: `Favorites (${ideas.filter(i => i.isFavorite).length})` },
                { id: 'new' as const,        label: `Nouvelles (${ideas.filter(i => i.status === 'new').length})` },
                { id: 'inprogress' as const, label: `En cours (${ideas.filter(i => i.status === 'inprogress').length})` },
                { id: 'done' as const,       label: `Réalisées (${ideas.filter(i => i.status === 'done').length})` },
              ].map(f => (
                <button key={f.id} onClick={() => changeFilter(f.id)} style={{
                  background: filter === f.id ? 'var(--cit-navy-dk)' : 'transparent',
                  color: filter === f.id ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
                  border: '2px solid var(--cit-navy-dk)',
                  padding: '4px 12px',
                  fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                  letterSpacing: '.12em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  boxShadow: filter === f.id ? '2px 2px 0 var(--cit-brick)' : 'none',
                }}>{f.label}</button>
              ))}
            </div>
            <div style={{ flex: 1 }}/>
            <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>TRIER :</span>
            <select value={sort} onChange={e => changeSort(e.target.value as 'recent' | 'alpha')} style={{
              border: '2px solid var(--cit-navy-dk)',
              background: 'var(--cit-cream)',
              padding: '4px 8px',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
              letterSpacing: '.12em', textTransform: 'uppercase',
              color: 'var(--cit-navy-dk)', cursor: 'pointer',
            }}>
              <option value="recent">PLUS RÉCENTES</option>
              <option value="alpha">ALPHABÉTIQUE</option>
              <option value="status">PAR STATUT</option>
            </select>
          </div>
        )}

        {ideas.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '6px 0', marginBottom: 14,
            borderBottom: '1.5px dashed var(--cit-navy-dk)', flexWrap: 'wrap',
          }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="⌕ Recherche titre ou contenu…"
              style={{
                flex: 1, minWidth: 240,
                padding: '6px 12px',
                border: '2px solid var(--cit-navy-dk)',
                background: 'var(--cit-paper)',
                fontFamily: "'Special Elite', monospace", fontSize: 12,
                color: 'var(--cit-navy-dk)',
                boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 2px 2px 0 var(--cit-navy-dk)',
              }}/>

            {allConcepts.length > 0 && (
              <select value={conceptFilter} onChange={e => setConceptFilter(e.target.value)} style={{
                border: '2px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                padding: '4px 8px',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                letterSpacing: '.10em', textTransform: 'uppercase',
                color: 'var(--cit-navy-dk)', cursor: 'pointer',
              }}>
                <option value="">★ TOUS CONCEPTS</option>
                {allConcepts.map(cid => {
                  const c = conceptsById[cid];
                  return <option key={cid} value={cid}>{c?.name ?? cid.slice(0, 12)}</option>;
                })}
              </select>
            )}

            {allConstraints.length > 0 && (
              <select value={constraintFilter} onChange={e => setConstraintFilter(e.target.value)} style={{
                border: '2px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                padding: '4px 8px',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                letterSpacing: '.10em', textTransform: 'uppercase',
                color: 'var(--cit-navy-dk)', cursor: 'pointer',
              }}>
                <option value="">★ TOUTES CONTRAINTES</option>
                {allConstraints.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {allTags.length > 0 && (
              <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={{
                border: '2px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                padding: '4px 8px',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                letterSpacing: '.10em', textTransform: 'uppercase',
                color: 'var(--cit-navy-dk)', cursor: 'pointer',
              }}>
                <option value="">★ TOUS TAGS</option>
                {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
              </select>
            )}

            {(search || conceptFilter || constraintFilter || tagFilter) && (
              <button onClick={() => { setSearch(''); setConceptFilter(''); setConstraintFilter(''); setTagFilter(''); }} style={{
                background: 'var(--cit-brick)', color: 'var(--cit-cream)',
                border: '2px solid var(--cit-navy-dk)',
                padding: '4px 10px', cursor: 'pointer',
                fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                letterSpacing: '.12em', textTransform: 'uppercase',
              }}>✕ Reset</button>
            )}
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={{
            padding: '60px 40px', textAlign: 'center',
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 36, marginTop: 16 }}>
              {ideas.length === 0 ? 'Aucune idée encore' : 'Aucune idée pour ce filtre'}
            </h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8, maxWidth: 460, margin: '8px auto 0' }}>
              {ideas.length === 0
                ? 'Configurez votre clé API LLM dans les Réglages, puis générez des idées à partir de concepts croisés.'
                : 'Essayez un autre filtre.'}
            </p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>✚ GÉNÉRER DES IDÉES</CitButton>
              {ideas.length === 0 && (
                <CitButton onClick={() => onTabChange?.('settings')}>Configurer la clé LLM</CitButton>
              )}
            </div>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer} initial="hidden" animate="visible"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {sorted.map(i => (
              <motion.div key={i.id} variants={staggerItem}>
                <IdeaCard idea={i} conceptsById={conceptsById} onOpen={() => setOpenIdea(i)}/>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <CitizenFooter right={ideas.length === 0 ? "★ COMMENCEZ PAR GÉNÉRER DES IDÉES" : "CLIQUEZ UNE IDÉE POUR LA DÉTAILLER"}/>

      <IdeaModal
        idea={openIdea}
        open={!!openIdea}
        onClose={() => setOpenIdea(null)}
        onUpdate={load}
        onOpenConcept={(c) => { setOpenIdea(null); setConceptDetail(c); }}
      />

      <ConceptDetailModal
        concept={conceptDetail}
        open={!!conceptDetail}
        onClose={() => setConceptDetail(null)}
      />
    </div>
  );
}
