import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { getAllConstraints, toggleConstraintFavorite, deleteConstraint, getAllCombinations, getAllIdeas } from '../../stores/db';
import { useToast } from '../../lib/toast';
import { relativeDate } from '../../lib/dates';
import type { SavedConstraint } from '../../types';

interface Props { onTabChange?: (id: string) => void }

export function ConstraintsScreen({ onTabChange }: Props) {
  const [constraints, setConstraints] = useState<SavedConstraint[]>([]);
  const [usageStats, setUsageStats] = useState<Record<string, { combos: number; ideas: number }>>({});
  const [filter, setFilter] = useState<'all' | 'fav' | 'mappable'>('all');
  const toast = useToast();

  const load = async () => {
    const arr = await getAllConstraints();
    setConstraints(arr);
    // Compute usage stats from combos + ideas
    const combos = await getAllCombinations();
    const ideas = await getAllIdeas();
    const stats: Record<string, { combos: number; ideas: number }> = {};
    arr.forEach(c => {
      stats[c.id] = {
        combos: combos.filter(co => co.constraints.includes(c.text)).length,
        ideas:  ideas.filter(id => id.constraints.includes(c.text)).length,
      };
    });
    setUsageStats(stats);
  };

  useEffect(() => { load(); }, []);

  const filtered = constraints.filter(c =>
    filter === 'all' ? true :
    filter === 'fav' ? c.isFavorite :
    filter === 'mappable' ? !!c.mappedQid : true
  );

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Vos"
        title="CONTRAINTES"
        active="combine"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>{constraints.length} CONTRAINTE{constraints.length > 1 ? 'S' : ''}</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        padding: '10px 32px',
        background: 'var(--cit-paper-dk)',
        borderBottom: '2px solid var(--cit-navy-dk)',
        display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 3,
      }}>
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ AFFICHER :</span>
        {([
          { id: 'all',      label: `Toutes (${constraints.length})` },
          { id: 'fav',      label: `Favorites (${constraints.filter(c => c.isFavorite).length})` },
          { id: 'mappable', label: `Mappables Wikidata (${constraints.filter(c => !!c.mappedQid).length})` },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: filter === f.id ? 'var(--cit-navy-dk)' : 'transparent',
            color: filter === f.id ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
            border: '2px solid var(--cit-navy-dk)',
            padding: '4px 12px', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
            letterSpacing: '.12em', textTransform: 'uppercase',
            boxShadow: filter === f.id ? '2px 2px 0 var(--cit-brick)' : 'none',
          }}>{f.label}</button>
        ))}
        <div style={{ flex: 1 }}/>
        <CitButton size="sm" onClick={() => onTabChange?.('combine')}>← Retour au Croisement</CitButton>
      </div>

      <div style={{
        flex: 1, padding: '20px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: '60px 40px', textAlign: 'center',
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 28, marginTop: 16 }}>
              {constraints.length === 0 ? 'Aucune contrainte mémorisée' : 'Aucune correspondance'}
            </h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8, maxWidth: 480, margin: '8px auto 0' }}>
              {constraints.length === 0
                ? 'Sauvegardez une combinaison avec une contrainte dans le Croisement et elle apparaîtra ici automatiquement.'
                : 'Essayez un autre filtre.'}
            </p>
            <div style={{ marginTop: 18 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>★ ALLER AU CROISEMENT</CitButton>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {filtered.map(c => {
              const stats = usageStats[c.id] ?? { combos: 0, ideas: 0 };
              return (
                <div key={c.id} style={{
                  background: 'var(--cit-cream)',
                  border: '3px solid var(--cit-navy-dk)',
                  boxShadow: '5px 5px 0 var(--cit-navy-dk)',
                  position: 'relative',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {c.isFavorite && (
                    <span style={{ position: 'absolute', top: -10, right: -10, zIndex: 3 }}>
                      <Aster size={28} rotate={12}/>
                    </span>
                  )}
                  <div style={{
                    background: c.mappedQid ? 'var(--cit-navy-dk)' : 'var(--cit-paper-dk)',
                    color: c.mappedQid ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
                    padding: '8px 14px',
                    fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                    letterSpacing: '.14em', textTransform: 'uppercase',
                    borderBottom: '2px solid var(--cit-navy-dk)',
                  }}>
                    {c.mappedQid ? `★ MAPPABLE WIKIDATA · ${c.mappedQid}` : '★ CONTRAINTE LIBRE (LLM)'}
                  </div>

                  <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="cit-h1" style={{ fontSize: 24, lineHeight: 0.95 }}>
                      « {c.text} »
                    </div>
                    <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>
                      Premier usage {relativeDate(c.firstUsedAt)}
                    </div>

                    <div style={{
                      marginTop: 8,
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
                      paddingTop: 8, borderTop: '1.5px dashed var(--cit-navy-dk)',
                      fontFamily: "'Special Elite', monospace", fontSize: 10, color: 'var(--cit-navy-lt)',
                    }}>
                      <span><strong style={{ color: 'var(--cit-brick)', fontSize: 16, fontFamily: "'Alfa Slab One', serif" }}>{c.useCount}</strong><br/>usages</span>
                      <span><strong style={{ color: 'var(--cit-navy-dk)', fontSize: 16, fontFamily: "'Alfa Slab One', serif" }}>{stats.combos}</strong><br/>combos</span>
                      <span style={{ textAlign: 'right' }}><strong style={{ color: 'var(--cit-navy-dk)', fontSize: 16, fontFamily: "'Alfa Slab One', serif" }}>{stats.ideas}</strong><br/>idées</span>
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                      <CitButton
                        size="sm"
                        tone={c.isFavorite ? 'butter' : undefined}
                        onClick={async () => {
                          await toggleConstraintFavorite(c.id);
                          load();
                        }}
                      >{c.isFavorite ? '★ Favori' : '☆'}</CitButton>
                      <button
                        onClick={async () => {
                          if (confirm(`Supprimer la contrainte « ${c.text} » ?`)) {
                            await deleteConstraint(c.id);
                            toast.show({ tone: 'info', title: 'Contrainte supprimée' });
                            load();
                          }
                        }}
                        style={{
                          background: 'var(--cit-cream)', color: 'var(--cit-brick)',
                          border: '2px solid var(--cit-navy-dk)',
                          fontFamily: "'Alfa Slab One', serif", fontSize: 12,
                          padding: '4px 10px', cursor: 'pointer',
                        }}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CitizenFooter right="★ VOS CONTRAINTES SE MÉMORISENT AUTOMATIQUEMENT"/>
    </div>
  );
}
