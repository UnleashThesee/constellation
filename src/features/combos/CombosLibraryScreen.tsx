import { useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';

interface Props { onTabChange?: (id: string) => void }

interface Combo {
  id: string; name: string; seeds: string[];
  mix: string; date: string; lastUsed: string;
  ideas: number; fav: boolean; status: 'active' | 'archived';
}

// Phase 1: empty by default. Future: persist real combinations to Dexie.
const COMBOS: Combo[] = [];

function CombosLibraryCard({ combo }: { combo: Combo }) {
  return (
    <div style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      {combo.fav && (
        <span style={{ position: 'absolute', top: -10, right: -10, zIndex: 3 }}>
          <Aster size={28} rotate={12}/>
        </span>
      )}
      <div style={{ position: 'relative', height: 110, background: combo.mix, borderBottom: '3px solid var(--cit-navy-dk)', overflow: 'hidden' }}>
        <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}/>
        <Sunburst size={200} color="var(--cit-cream)"/>
        <div style={{
          position: 'absolute', bottom: 8, left: 10,
          padding: '2px 8px', background: 'oklch(0% 0 0 / 0.45)',
          fontFamily: "'Special Elite', monospace", fontSize: 10,
          color: 'var(--cit-butter)', letterSpacing: '.14em',
        }}>★ {combo.id.toUpperCase()}</div>
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
          {combo.seeds.map((s, i) => (
            <span key={i} className="cit-condensed" style={{
              fontSize: 10, padding: '2px 7px',
              background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
              fontWeight: 700, letterSpacing: '.06em',
            }}>{s}</span>
          ))}
        </div>
        <div style={{
          marginTop: 'auto', paddingTop: 8,
          borderTop: '1.5px dashed var(--cit-navy-dk)',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
          fontFamily: "'Special Elite', monospace", fontSize: 10,
          color: 'var(--cit-navy-lt)',
        }}>
          <span><strong style={{ color: 'var(--cit-navy-dk)' }}>{combo.date}</strong><br/>création</span>
          <span><strong style={{ color: 'var(--cit-navy-dk)' }}>{combo.lastUsed}</strong><br/>utilisée</span>
          <span style={{ textAlign: 'right' }}>
            <strong style={{ color: 'var(--cit-brick)', fontSize: 16, fontFamily: "'Alfa Slab One', serif" }}>{combo.ideas}</strong><br/>idées
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <CitButton tone="brick" size="sm" style={{ flex: 1, justifyContent: 'center' }}>★ Relancer</CitButton>
          <CitButton size="sm">⋯</CitButton>
        </div>
      </div>
    </div>
  );
}

export function CombosLibraryScreen({ onTabChange }: Props) {
  const [filter, setFilter] = useState<'all' | 'fav' | 'active' | 'archived'>('all');
  const items = COMBOS.filter(c =>
    filter === 'all' ? true :
    filter === 'fav' ? c.fav :
    filter === 'active' ? c.status === 'active' :
    filter === 'archived' ? c.status === 'archived' : true
  );

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Vos"
        title="COMBINAISONS"
        active="combine"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>{COMBOS.length} AMALGAMES SAUVÉS</Stamp>
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
          { id: 'all',      label: `Toutes (${COMBOS.length})` },
          { id: 'fav',      label: `Favorites (${COMBOS.filter(c => c.fav).length})` },
          { id: 'active',   label: `Actives (${COMBOS.filter(c => c.status === 'active').length})` },
          { id: 'archived', label: `Archivées (${COMBOS.filter(c => c.status === 'archived').length})` },
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
              Les combinaisons que vous sauvegardez depuis le Croisement apparaîtront ici.
            </p>
            <div style={{ marginTop: 18 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>★ ALLER AU CROISEMENT</CitButton>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {items.map(c => <CombosLibraryCard key={c.id} combo={c}/>)}
          </div>
        )}
      </div>

      <CitizenFooter right="★ CHAQUE COMBINAISON EST UN POINT DE DÉPART"/>
    </div>
  );
}
