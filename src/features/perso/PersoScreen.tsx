import { useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp } from '../../components/ui/atoms';

interface Props { onTabChange?: (id: string) => void }

interface PersoCat { id: string; name: string; color: string; count: number; lastUsed: string }
interface PersoTag { name: string; count: number; color: string }

const DEFAULT_CATS: PersoCat[] = [
  { id: 'p1', name: 'à lire un jour',   color: 'oklch(58% 0.22 25)',  count: 0, lastUsed: '—' },
  { id: 'p2', name: 'projet en cours',  color: 'oklch(35% 0.13 250)', count: 0, lastUsed: '—' },
  { id: 'p3', name: 'café du dimanche', color: 'oklch(70% 0.16 82)',  count: 0, lastUsed: '—' },
];

const DEFAULT_TAGS: PersoTag[] = [
  { name: 'à recroiser',    count: 0, color: 'oklch(35% 0.13 250)' },
  { name: 'underrated',     count: 0, color: 'oklch(48% 0.20 28)' },
  { name: 'à vulgariser',   count: 0, color: 'oklch(70% 0.16 82)' },
];

function PersoCatTile({ cat, active, onClick }: { cat: PersoCat; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 14, alignItems: 'center',
      padding: '12px 14px',
      background: active ? 'var(--cit-butter)' : 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: active ? '5px 5px 0 var(--cit-brick)' : '4px 4px 0 var(--cit-navy-dk)',
      cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{
        width: 44, height: 44, background: cat.color,
        border: '2.5px solid var(--cit-navy-dk)',
        display: 'grid', placeItems: 'center',
        fontFamily: "'Alfa Slab One', serif", fontSize: 22, color: 'var(--cit-cream)',
        textShadow: '1.5px 1.5px 0 var(--cit-navy-dk)',
        boxShadow: 'inset 0 0 0 3px var(--cit-cream), inset 0 0 0 4px var(--cit-navy-dk)',
      }}>{cat.count}</div>
      <div>
        <div className="cit-h1" style={{ fontSize: 20, lineHeight: 0.95 }}>{cat.name}</div>
        <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginTop: 2 }}>
          ★ Dernière utilisation · {cat.lastUsed}
        </div>
      </div>
      <span style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 18, color: 'var(--cit-brick)', lineHeight: 1 }}>›</span>
    </button>
  );
}

function CategoryDetailPanel({ cat, onClose }: { cat: PersoCat; onClose: () => void }) {
  return (
    <div style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '-5px 0 0 var(--cit-navy-dk)',
      borderRight: 'none',
      display: 'flex', flexDirection: 'column',
      overflow: 'auto',
    }}>
      <div style={{
        background: cat.color, color: 'var(--cit-cream)',
        padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '3px solid var(--cit-navy-dk)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.3 }}/>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-butter)' }}>★ ÉTIQUETTE PERSONNELLE</div>
          <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 28, lineHeight: 0.95, textShadow: '2px 2px 0 oklch(0% 0 0 / 0.4)' }}>
            {cat.name}<span style={{ color: 'var(--cit-butter)' }}>!</span>
          </div>
          <div className="cit-typed" style={{ fontSize: 11, marginTop: 4, color: 'var(--cit-cream)' }}>
            {cat.count} concepts · dernière utilisation {cat.lastUsed}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'var(--cit-brick)', color: 'var(--cit-cream)',
          border: '2px solid var(--cit-cream)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 16, padding: '0 10px',
          cursor: 'pointer', position: 'relative', zIndex: 1,
        }}>✕</button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>★ CONCEPTS RANGÉS</div>
        {cat.count === 0 ? (
          <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
            Aucun concept rangé dans cette étiquette pour l'instant.
          </div>
        ) : null}
        <button style={{
          padding: '6px 10px', background: 'transparent',
          border: '2px dashed var(--cit-navy-dk)',
          fontFamily: "'Special Elite', monospace", fontSize: 12,
          color: 'var(--cit-navy-dk)', cursor: 'pointer',
        }}>+ Ranger un concept dans cette étiquette</button>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
          <CitButton tone="brick" style={{ width: '100%', justifyContent: 'center' }}>
            ★ Lancer une combinaison avec cette étiquette
          </CitButton>
          <CitButton style={{ width: '100%', justifyContent: 'center' }}>
            Renommer / changer la couleur
          </CitButton>
          <CitButton tone="navy" style={{ width: '100%', justifyContent: 'center' }}>
            Supprimer l'étiquette
          </CitButton>
        </div>
      </div>
    </div>
  );
}

export function PersoScreen({ onTabChange }: Props) {
  const [view, setView] = useState<'categories' | 'tags'>('categories');
  const [selectedCat, setSelectedCat] = useState<PersoCat | null>(DEFAULT_CATS[0]);
  const cats = DEFAULT_CATS;
  const tags = DEFAULT_TAGS;

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Votre"
        title={view === 'categories' ? 'ÉTIQUETTES' : 'TAGS'}
        active="favs"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>{view === 'categories' ? `${cats.length} ÉTIQUETTES` : `${tags.length} TAGS`}</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{ padding: '10px 32px', background: 'var(--cit-paper-dk)', borderBottom: '2px solid var(--cit-navy-dk)', display: 'flex', gap: 6, position: 'relative', zIndex: 3 }}>
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', alignSelf: 'center', marginRight: 8 }}>
          ★ VOTRE GRAMMAIRE PERSONNELLE ›
        </span>
        {[
          { id: 'categories' as const, label: 'Étiquettes', count: cats.length },
          { id: 'tags' as const,       label: 'Tags',       count: tags.length },
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            background: view === t.id ? 'var(--cit-navy-dk)' : 'transparent',
            color: view === t.id ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
            border: '2px solid var(--cit-navy-dk)',
            padding: '4px 14px', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700,
            letterSpacing: '.12em', textTransform: 'uppercase',
            boxShadow: view === t.id ? '2px 2px 0 var(--cit-brick)' : 'none',
          }}>
            {t.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({t.count})</span>
          </button>
        ))}
        <div style={{ flex: 1 }}/>
        <CitButton size="sm" onClick={() => onTabChange?.('favs')}>← Retour aux favoris</CitButton>
      </div>

      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: view === 'categories' && selectedCat ? '1fr 380px' : '1fr',
        gap: 0,
        zIndex: 3, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 32px', overflow: 'auto' }}>
          {view === 'categories' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>
                  ★ ÉTIQUETTES PERSONNELLES · PARALLÈLES AUX 12 CATÉGORIES OFFICIELLES
                </div>
                <CitButton tone="butter">+ Créer une étiquette</CitButton>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {cats.map(c => (
                  <PersoCatTile key={c.id} cat={c} active={selectedCat?.id === c.id} onClick={() => setSelectedCat(c)}/>
                ))}
              </div>
              <CitPanel title="À quoi servent les étiquettes ?" accent="butter" style={{ marginTop: 22 }}>
                <p className="cit-typed" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                  Les <strong>étiquettes personnelles</strong> sont votre grammaire à vous, par-dessus le système de 12 catégories officielles.
                  Idéal pour des projets en cours, des humeurs, des chantiers. Vous pouvez ensuite croiser une étiquette entière comme s'il s'agissait d'un seul concept.
                </p>
              </CitPanel>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>
                  ★ NUAGE DE TAGS · CLIQUEZ POUR FILTRER VOTRE UNIVERS
                </div>
                <CitButton tone="butter">+ Nouveau tag</CitButton>
              </div>
              <div style={{
                background: 'var(--cit-cream)',
                border: '3px solid var(--cit-navy-dk)',
                boxShadow: '5px 5px 0 var(--cit-navy-dk)',
                padding: '30px 26px',
                display: 'flex', flexWrap: 'wrap', gap: 10,
                alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.15 }}/>
                {tags.length === 0 ? (
                  <div className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                    Aucun tag pour l'instant. Créez-en depuis la fiche d'un concept.
                  </div>
                ) : tags.map(t => {
                  const fontSize = Math.min(34, 12 + t.count * 0.45);
                  return (
                    <button key={t.name} style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 6,
                      padding: '4px 10px',
                      background: 'var(--cit-paper)',
                      border: '2.5px solid var(--cit-navy-dk)',
                      borderLeft: `8px solid ${t.color}`,
                      fontFamily: "'Alfa Slab One', serif",
                      fontSize, lineHeight: 1,
                      color: 'var(--cit-navy-dk)',
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 var(--cit-navy-dk)',
                      position: 'relative', zIndex: 1,
                    }}>
                      #{t.name}
                      <span style={{
                        fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                        color: 'var(--cit-brick)', letterSpacing: '.1em',
                      }}>{t.count}</span>
                    </button>
                  );
                })}
              </div>
              <CitPanel title="À quoi servent les tags ?" accent="butter" style={{ marginTop: 22 }}>
                <p className="cit-typed" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                  Les <strong>tags</strong> sont des étiquettes <strong>légères</strong> : un concept peut en avoir plusieurs sans coût.
                  Ils servent à <strong>filtrer rapidement</strong> votre univers, sans créer d'ensemble fermé comme les étiquettes.
                </p>
              </CitPanel>
            </>
          )}
        </div>

        {view === 'categories' && selectedCat && (
          <CategoryDetailPanel cat={selectedCat} onClose={() => setSelectedCat(null)}/>
        )}
      </div>

      <CitizenFooter right="★ ORGANISEZ VOTRE UNIVERS À VOTRE GUISE"/>
    </div>
  );
}
