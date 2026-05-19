import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { IdeaModal } from '../../components/ui/IdeaModal';
import { CATEGORIES } from '../../lib/categories';
import { getAllIdeas, getCachedConcept } from '../../stores/db';
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
          Sélectionnez 2 à 5 concepts adoptés, le Bureau s'occupe du reste.
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CitButton tone="butter" onClick={onCombine}>★ CROISER MES CONCEPTS</CitButton>
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
          ★ {idea.outputType.toUpperCase()} · {idea.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()}
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
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [conceptsById, setConceptsById] = useState<Record<string, Concept>>({});
  const [openIdea, setOpenIdea] = useState<Idea | null>(null);

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

  const filtered = ideas.filter(i =>
    filter === 'all' ? true :
    filter === 'fav' ? i.isFavorite :
    i.status === filter
  );
  const sorted = [...filtered].sort((a, b) =>
    sort === 'alpha' ? a.title.localeCompare(b.title) : +b.createdAt - +a.createdAt
  );

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
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
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
            <select value={sort} onChange={e => setSort(e.target.value as 'recent' | 'alpha')} style={{
              border: '2px solid var(--cit-navy-dk)',
              background: 'var(--cit-cream)',
              padding: '4px 8px',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
              letterSpacing: '.12em', textTransform: 'uppercase',
              color: 'var(--cit-navy-dk)', cursor: 'pointer',
            }}>
              <option value="recent">PLUS RÉCENTES</option>
              <option value="alpha">ALPHABÉTIQUE</option>
            </select>
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
                ? 'Configurez votre clé API LLM dans les Réglages, puis croisez vos concepts pour générer des idées.'
                : 'Essayez un autre filtre.'}
            </p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>★ CROISER DES CONCEPTS</CitButton>
              {ideas.length === 0 && (
                <CitButton onClick={() => onTabChange?.('settings')}>Configurer la clé LLM</CitButton>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {sorted.map(i => (
              <IdeaCard key={i.id} idea={i} conceptsById={conceptsById} onOpen={() => setOpenIdea(i)}/>
            ))}
          </div>
        )}
      </div>

      <CitizenFooter right={ideas.length === 0 ? "★ COMMENCEZ PAR CROISER VOS CONCEPTS" : "CLIQUEZ UNE IDÉE POUR LA DÉTAILLER"}/>

      <IdeaModal
        idea={openIdea}
        open={!!openIdea}
        onClose={() => setOpenIdea(null)}
        onUpdate={load}
      />
    </div>
  );
}
