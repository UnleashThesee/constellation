import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { ConceptDetailModal } from '../../components/ui/ConceptDetailModal';
import { Sunburst, Stamp } from '../../components/ui/atoms';
import { CATEGORIES, CATEGORY_LIST } from '../../lib/categories';
import { searchConcepts } from '../../services/wikidata';
import { cacheConcept, recordInteraction, getAdoptedConcepts, createFreeConcept } from '../../stores/db';
import { useToast } from '../../lib/toast';
import type { Concept, CategoryKey } from '../../types';

interface Props { onTabChange?: (id: string) => void }

const SESSION_ID = `search-${Date.now()}`;

export function SearchScreen({ onTabChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [adopted, setAdopted] = useState<Set<string>>(new Set());
  const [showFreeForm, setShowFreeForm] = useState(false);
  const [detailConcept, setDetailConcept] = useState<Concept | null>(null);
  const [freeName, setFreeName] = useState('');
  const [freeBlurb, setFreeBlurb] = useState('');
  const [freeCat, setFreeCat] = useState<CategoryKey>('philosophie');
  const toast = useToast();

  useEffect(() => {
    getAdoptedConcepts().then(arr => setAdopted(new Set(arr.map(c => c.id))));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      searchConcepts(query.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const adopt = async (c: Concept) => {
    await cacheConcept(c);
    await recordInteraction(c.id, 'valid', SESSION_ID);
    setAdopted(prev => new Set(prev).add(c.id));
    toast.show({ tone: 'success', title: 'Concept adopté', body: `« ${c.name} » rejoint votre univers.` });
  };

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Cherchez un"
        title="CONCEPT"
        active="swipe"
        onTabChange={onTabChange}
        right={<Sunburst size={68} color="var(--cit-mustard)"/>}
      />

      <div style={{ flex: 1, padding: '30px 80px', display: 'flex', flexDirection: 'column', gap: 22, zIndex: 3, position: 'relative', overflow: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div className="cit-script" style={{ fontSize: 36, color: 'var(--cit-navy)', lineHeight: 0.9 }}>
            Le Bureau cherche pour vous,
          </div>
          <h2 className="cit-h1" style={{ fontSize: 44, lineHeight: 0.95, margin: '4px 0' }}>
            DICTEZ LE NOM DU CONCEPT
          </h2>
          <div className="cit-condensed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)' }}>
            ★ AUTEUR, ŒUVRE, IDÉE, JEU, FILM, GROUPE… INTERROGE WIKIDATA ★
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="Foucault, Borges, Dark Souls…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '20px 24px 20px 64px',
              border: '3px solid var(--cit-navy-dk)',
              background: 'var(--cit-paper)',
              fontFamily: "'Special Elite', monospace",
              fontSize: 28, color: 'var(--cit-navy-dk)',
              boxShadow: 'inset 0 3px 0 oklch(0% 0 0 / 0.1), 6px 6px 0 var(--cit-navy-dk)',
            }}/>
          <span style={{
            position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
            fontFamily: "'Alfa Slab One', serif", fontSize: 32, color: 'var(--cit-brick)',
          }}>⌕</span>
          <span style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: '.18em',
            color: 'var(--cit-navy-lt)', textTransform: 'uppercase',
          }}>{loading ? '★ Recherche…' : results.length > 0 ? `★ ${results.length} résultats` : ''}</span>
        </div>

        {query.trim().length >= 2 && (
          <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', textAlign: 'center' }}>
            ★ {loading ? 'INTERROGATION DE WIKIDATA…' : 'CHOISISSEZ UN CONCEPT ★'}
          </div>
        )}

        {/* Détection de désambiguïsation : plusieurs résultats avec un nom de base similaire */}
        {(() => {
          const baseNameOf = (s: string) => s.split(/[\s(]/)[0].toLowerCase();
          const counts: Record<string, number> = {};
          results.forEach(r => { const k = baseNameOf(r.name); counts[k] = (counts[k] ?? 0) + 1; });
          const ambiguous = Object.values(counts).some(n => n >= 2);
          if (!ambiguous || results.length === 0) return null;
          return (
            <div style={{
              padding: '8px 12px', marginBottom: 4,
              background: 'var(--cit-butter)',
              border: '2px solid var(--cit-navy-dk)',
              boxShadow: '3px 3px 0 var(--cit-navy-dk)',
              fontFamily: "'Special Elite', monospace", fontSize: 12,
              color: 'var(--cit-navy-dk)',
            }}>
              ★ <strong>Désambiguïsation</strong> · plusieurs entrées partagent un nom similaire.
              Lisez attentivement les descriptions avant de choisir.
            </div>
          );
        })()}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map(c => {
            const cat = CATEGORIES[c.cats[0]?.[0] ?? 'personnages'];
            const initials = c.name.split(' ').pop()?.[0]?.toUpperCase() ?? '?';
            const already = adopted.has(c.id);
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 18, alignItems: 'center',
                padding: '12px 18px',
                background: 'var(--cit-cream)',
                border: '3px solid var(--cit-navy-dk)',
                boxShadow: '4px 4px 0 var(--cit-navy-dk)',
              }}>
                <div style={{
                  width: 60, height: 60,
                  background: cat.oklch,
                  border: '2.5px solid var(--cit-navy-dk)',
                  display: 'grid', placeItems: 'center',
                  fontFamily: "'Alfa Slab One', serif",
                  fontSize: 22, color: 'var(--cit-cream)',
                  textShadow: '1.5px 1.5px 0 var(--cit-navy-dk)',
                  boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                }}>{initials}</div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
                    <h3 className="cit-h1" style={{ margin: 0, fontSize: 22, lineHeight: 0.95 }}>
                      {c.name}
                    </h3>
                    {c.wikidataId && (
                      <span className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', letterSpacing: '.1em' }}>
                        WIKIDATA · {c.wikidataId}
                      </span>
                    )}
                  </div>
                  <div className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-dk)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {c.blurb}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                      letterSpacing: '.12em', textTransform: 'uppercase',
                      padding: '2px 8px',
                      background: 'var(--cit-cream)',
                      border: '1.5px solid var(--cit-navy-dk)',
                    }}>
                      <span style={{ width: 8, height: 8, background: cat.oklch, border: '1px solid var(--cit-navy-dk)' }}/>
                      {cat.label}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  {already ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <Stamp tone="navy" rotate={-3} size={11}>★ DÉJÀ ADOPTÉ</Stamp>
                      <CitButton size="sm" onClick={() => setDetailConcept(c)}>↗ Ouvrir la fiche</CitButton>
                    </div>
                  ) : (
                    <CitButton tone="brick" size="sm" onClick={() => adopt(c)}>★ Adopter</CitButton>
                  )}
                </div>
              </div>
            );
          })}

          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div style={{
              padding: '12px 18px',
              background: 'var(--cit-paper-dk)',
              border: '3px dashed var(--cit-navy-dk)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18,
            }}>
              <div>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ AUCUN RÉSULTAT</div>
                <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginTop: 2 }}>
                  Le Bureau n'a rien trouvé sur Wikidata. Créez plutôt un concept libre.
                </div>
              </div>
              <CitButton tone="navy" onClick={() => { setShowFreeForm(true); setFreeName(query.trim()); }}>+ Concept libre</CitButton>
            </div>
          )}
        </div>

        {/* Concept libre form */}
        <div style={{
          padding: '12px 18px',
          background: 'var(--cit-paper-dk)',
          border: '3px dashed var(--cit-navy-dk)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18,
        }}>
          <div>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ CONCEPT INTROUVABLE ?</div>
            <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginTop: 2 }}>
              Le Bureau peut créer un dossier sur mesure si Wikidata ne suffit pas.
            </div>
          </div>
          <CitButton tone="navy" onClick={() => setShowFreeForm(s => !s)}>
            {showFreeForm ? '× Annuler' : '+ Créer un concept libre'}
          </CitButton>
        </div>

        {showFreeForm && (
          <CitPanel title="Nouveau concept libre">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ NOM (obligatoire)</div>
                <input value={freeName} onChange={e => setFreeName(e.target.value)} placeholder="Ex. : Mon concept perso" style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
                  border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-paper)',
                  fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)',
                  boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
                }}/>
              </div>
              <div>
                <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ CATÉGORIE</div>
                <select value={freeCat} onChange={e => setFreeCat(e.target.value as CategoryKey)} style={{
                  width: '100%', padding: '8px 12px',
                  border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--cit-navy-dk)',
                  boxShadow: '3px 3px 0 var(--cit-navy-dk)',
                }}>
                  {CATEGORY_LIST.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ DESCRIPTION</div>
              <textarea value={freeBlurb} onChange={e => setFreeBlurb(e.target.value)} placeholder="Quelques phrases…" style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 12px', minHeight: 80,
                border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-paper)',
                fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)',
                boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
                resize: 'vertical',
              }}/>
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <CitButton onClick={() => { setShowFreeForm(false); setFreeName(''); setFreeBlurb(''); }}>Annuler</CitButton>
              <CitButton tone="brick" onClick={async () => {
                if (!freeName.trim()) {
                  toast.show({ tone: 'warning', title: 'Nom requis', body: 'Donnez un nom à votre concept.' });
                  return;
                }
                const c = await createFreeConcept({
                  name: freeName.trim(),
                  blurb: freeBlurb.trim() || 'Concept créé manuellement.',
                  cats: [[freeCat, 1.0]],
                });
                await recordInteraction(c.id, 'valid', SESSION_ID);
                setAdopted(prev => new Set(prev).add(c.id));
                toast.show({ tone: 'success', title: 'Concept créé', body: `« ${c.name} » rejoint votre univers.` });
                setShowFreeForm(false); setFreeName(''); setFreeBlurb('');
              }}>★ Créer & adopter</CitButton>
            </div>
          </CitPanel>
        )}
      </div>

      <CitizenFooter right="ENTRÉE = ADOPTER · ESC = ANNULER"/>

      <ConceptDetailModal
        concept={detailConcept}
        open={!!detailConcept}
        onClose={() => setDetailConcept(null)}
      />
    </div>
  );
}
