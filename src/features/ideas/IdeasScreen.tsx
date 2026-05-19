import { useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp } from '../../components/ui/atoms';

interface Props { onTabChange?: (id: string) => void }

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
        <CitButton tone="navy" size="sm" onClick={onCombine}>Pioche automatique</CitButton>
      </div>
    </div>
  );
}

export function IdeasScreen({ onTabChange }: Props) {
  const [filter, setFilter] = useState('all');
  const ideas: never[] = []; // LLM non configuré dans Phase 1

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Voici vos"
        title="IDÉES"
        active="ideas"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-4}>00 GÉNÉRÉES CE MOIS</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        flex: 1, padding: '20px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        <GenerateBanner onCombine={() => onTabChange?.('combine')}/>

        {/* filter bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 0', marginBottom: 14,
          borderBottom: '2px dashed var(--cit-navy-dk)',
        }}>
          <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ AFFICHER :</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'all', label: 'Toutes (0)' },
              { id: 'fav', label: 'Favoris (0)' },
              { id: 'draft', label: 'Brouillons (0)' },
              { id: 'archived', label: 'Archivées (0)' },
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
        </div>

        {ideas.length === 0 && (
          <div style={{
            padding: '60px 40px', textAlign: 'center',
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 36, marginTop: 16 }}>Aucune idée encore</h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8, maxWidth: 460, margin: '8px auto 0' }}>
              Le générateur d'idées requiert une clé API LLM. Configurez-la dans les <strong>Réglages</strong>,
              puis croisez vos concepts depuis l'onglet <strong>Croiser</strong>.
            </p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('combine')}>★ CROISER DES CONCEPTS</CitButton>
              <CitButton onClick={() => onTabChange?.('settings')}>Configurer la clé LLM</CitButton>
            </div>
          </div>
        )}
      </div>

      <CitizenFooter right="★ CROISER 2 CONCEPTS ★ TENTEZ VOTRE CHANCE !"/>
    </div>
  );
}
