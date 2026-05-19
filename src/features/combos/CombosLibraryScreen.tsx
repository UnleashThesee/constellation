import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { getAllCombinations, deleteCombination, getCachedConcept } from '../../stores/db';
import { useToast } from '../../lib/toast';
import type { SavedCombination, Concept } from '../../types';

interface Props { onTabChange?: (id: string) => void }

function CombosLibraryCard({ combo, conceptsById, onDelete }: {
  combo: SavedCombination;
  conceptsById: Record<string, Concept>;
  onDelete: () => void;
}) {
  return (
    <div style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      {combo.isFavorite && (
        <span style={{ position: 'absolute', top: -10, right: -10, zIndex: 3 }}>
          <Aster size={28} rotate={12}/>
        </span>
      )}
      <div style={{ position: 'relative', height: 110, background: combo.mixOklch, borderBottom: '3px solid var(--cit-navy-dk)', overflow: 'hidden' }}>
        <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}/>
        <Sunburst size={200} color="var(--cit-cream)"/>
        <div style={{
          position: 'absolute', bottom: 8, left: 10,
          padding: '2px 8px', background: 'oklch(0% 0 0 / 0.45)',
          fontFamily: "'Special Elite', monospace", fontSize: 10,
          color: 'var(--cit-butter)', letterSpacing: '.14em',
        }}>★ {combo.id.slice(0, 8).toUpperCase()}</div>
        <div style={{
          position: 'absolute', top: 8, right: 10,
          fontFamily: "'Oswald', sans-serif", fontSize: 10,
          color: 'var(--cit-cream)', letterSpacing: '.16em',
          textShadow: '1px 1px 0 oklch(0% 0 0)',
        }}>{combo.status === 'archived' ? 'ARCHIVÉE' : 'ACTIVE'}</div>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <h3 className="cit-h1" style={{ fontSize: 22, lineHeight: 0.95, margin: 0 }}>{combo.name}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {combo.items.map((it, i) => {
            const c = conceptsById[it.conceptId];
            return (
              <span key={i} className="cit-condensed" style={{
                fontSize: 10, padding: '2px 7px',
                background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                fontWeight: 700, letterSpacing: '.06em',
              }}>{c?.name ?? it.conceptId.slice(0, 8)} {it.weight}%</span>
            );
          })}
        </div>
        {combo.constraints.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {combo.constraints.map((cn, i) => (
              <span key={i} className="cit-condensed" style={{
                fontSize: 9, padding: '1px 6px',
                background: 'var(--cit-butter)', color: 'var(--cit-navy-dk)',
                border: '1.5px solid var(--cit-navy-dk)', fontWeight: 700,
              }}>★ {cn}</span>
            ))}
          </div>
        )}
        <div style={{
          marginTop: 'auto', paddingTop: 8,
          borderTop: '1.5px dashed var(--cit-navy-dk)',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
          fontFamily: "'Special Elite', monospace", fontSize: 10,
          color: 'var(--cit-navy-lt)',
        }}>
          <span><strong style={{ color: 'var(--cit-navy-dk)' }}>{combo.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()}</strong><br/>création</span>
          <span><strong style={{ color: 'var(--cit-navy-dk)' }}>{combo.lastUsedAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()}</strong><br/>utilisée</span>
          <span style={{ textAlign: 'right' }}>
            <strong style={{ color: 'var(--cit-brick)', fontSize: 16, fontFamily: "'Alfa Slab One', serif" }}>{combo.ideasGeneratedCount}</strong><br/>idées
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <CitButton tone="brick" size="sm" style={{ flex: 1, justifyContent: 'center' }}>★ Relancer</CitButton>
          <button onClick={onDelete} style={{
            padding: '4px 10px',
            background: 'var(--cit-cream)', color: 'var(--cit-brick)',
            border: '2px solid var(--cit-navy-dk)',
            fontFamily: "'Alfa Slab One', serif", fontSize: 12,
            cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>
    </div>
  );
}

export function CombosLibraryScreen({ onTabChange }: Props) {
  const [filter, setFilter] = useState<'all' | 'fav' | 'active' | 'archived'>('all');
  const [combos, setCombos] = useState<SavedCombination[]>([]);
  const [conceptsById, setConceptsById] = useState<Record<string, Concept>>({});
  const toast = useToast();

  const load = async () => {
    const arr = await getAllCombinations();
    setCombos(arr);
    const ids = new Set<string>();
    arr.forEach(c => c.items.forEach(it => ids.add(it.conceptId)));
    const concepts = await Promise.all([...ids].map(id => getCachedConcept(id)));
    const byId: Record<string, Concept> = {};
    concepts.forEach(c => { if (c) byId[c.id] = c; });
    setConceptsById(byId);
  };

  useEffect(() => { load(); }, []);

  const items = combos.filter(c =>
    filter === 'all' ? true :
    filter === 'fav' ? c.isFavorite :
    filter === 'active' ? c.status === 'active' :
    filter === 'archived' ? c.status === 'archived' : true
  );

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer définitivement « ${name} » ?`)) return;
    await deleteCombination(id);
    toast.show({ tone: 'info', title: 'Combinaison supprimée', body: `« ${name} » a été retirée.` });
    load();
  };

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Vos"
        title="COMBINAISONS"
        active="combine"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>{combos.length} AMALGAME{combos.length > 1 ? 'S' : ''} SAUVÉ{combos.length > 1 ? 'S' : ''}</Stamp>
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
          { id: 'all',      label: `Toutes (${combos.length})` },
          { id: 'fav',      label: `Favorites (${combos.filter(c => c.isFavorite).length})` },
          { id: 'active',   label: `Actives (${combos.filter(c => c.status === 'active').length})` },
          { id: 'archived', label: `Archivées (${combos.filter(c => c.status === 'archived').length})` },
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
        <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>+ Nouvelle combinaison</CitButton>
      </div>

      <div style={{
        flex: 1, padding: '20px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        {items.length === 0 ? (
          <div style={{
            padding: '60px 40px', textAlign: 'center',
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 32, marginTop: 16 }}>Aucune combinaison sauvegardée</h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8, maxWidth: 480, margin: '8px auto 0' }}>
              Sauvegardez des combinaisons depuis le Croisement pour les retrouver ici.
            </p>
            <div style={{ marginTop: 18 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>★ ALLER AU CROISEMENT</CitButton>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {items.map(c => (
              <CombosLibraryCard
                key={c.id} combo={c} conceptsById={conceptsById}
                onDelete={() => handleDelete(c.id, c.name)}
              />
            ))}
          </div>
        )}
      </div>

      <CitizenFooter right="★ CHAQUE COMBINAISON EST UN POINT DE DÉPART"/>
    </div>
  );
}
