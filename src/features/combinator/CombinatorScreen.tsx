import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp } from '../../components/ui/atoms';
import { CATEGORIES, conceptDominant, combinationMix } from '../../lib/categories';
import { getAdoptedConcepts, saveCombination, saveIdea, getSettings } from '../../stores/db';
import { useToast } from '../../lib/toast';
import { generateIdeas, LlmError } from '../../services/llm';
import { consumePendingCombo } from '../../lib/pending';
import type { Concept } from '../../types';

const OUTPUT_TYPES = [
  { id: 'research',  label: 'Papier de recherche' },
  { id: 'product',   label: 'Produit / application' },
  { id: 'creative',  label: 'Œuvre créative' },
  { id: 'essay',     label: 'Essai' },
  { id: 'question',  label: 'Question philo' },
  { id: 'memoir',    label: 'Sujet de mémoire' },
  { id: 'free',      label: 'Brainstorm libre' },
];

interface Props { onTabChange?: (id: string) => void }

interface SelItem { id: string; weight: number }

function ConceptPill({ concept, weight, onClick }: { concept: Concept; weight?: number; onClick?: () => void }) {
  const color = conceptDominant(concept.cats).css;
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 4px',
      background: 'var(--cit-cream)',
      border: '2.5px solid var(--cit-navy-dk)',
      borderLeft: `8px solid ${color}`,
      boxShadow: '2px 2px 0 var(--cit-navy-dk)',
      fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700,
      letterSpacing: '.08em', textTransform: 'uppercase',
      color: 'var(--cit-navy-dk)', cursor: onClick ? 'pointer' : 'default',
    }}>
      {concept.name}
      {weight !== undefined && <span style={{ color: 'var(--cit-brick)', fontSize: 11 }}>{Math.round(weight)}%</span>}
    </span>
  );
}

function Potentiometer({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const startDrag = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startV = value;
    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      onChange(Math.max(0, Math.min(100, Math.round(startV + dy * 0.8))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const angle = -135 + (value / 100) * 270;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div onPointerDown={startDrag} style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, oklch(35% 0.04 250), var(--cit-navy-dk) 70%)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow:
          'inset 0 2px 0 oklch(50% 0.06 250 / 0.6), inset 0 -3px 4px oklch(0% 0 0 / 0.4), ' +
          '3px 3px 0 var(--cit-navy-dk), 0 4px 10px oklch(0% 0 0 / 0.4)',
        position: 'relative', cursor: 'grab', userSelect: 'none',
      }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <span key={a} style={{ position: 'absolute', inset: 0, transform: `rotate(${a - 135}deg)`, pointerEvents: 'none' }}>
            <span style={{
              position: 'absolute', top: 2, left: '50%',
              width: 2, height: 4, background: 'var(--cit-butter)',
              transform: 'translateX(-50%)', opacity: 0.7,
            }}/>
          </span>
        ))}
        <span style={{ position: 'absolute', inset: 4, transform: `rotate(${angle}deg)`, transition: 'transform .1s ease', pointerEvents: 'none' }}>
          <span style={{
            position: 'absolute', top: 4, left: '50%',
            width: 3, height: 20, background: color,
            transform: 'translateX(-50%)', boxShadow: `0 0 8px ${color}`,
          }}/>
        </span>
        <span style={{
          position: 'absolute', inset: '30%',
          background: 'var(--cit-butter)',
          border: '2px solid var(--cit-navy-dk)',
          borderRadius: '50%',
        }}/>
      </div>
      <div style={{
        fontFamily: "'Alfa Slab One', serif", fontSize: 14,
        color: 'var(--cit-navy-dk)', background: 'var(--cit-butter)',
        border: '2px solid var(--cit-navy-dk)',
        padding: '0 6px', minWidth: 36, textAlign: 'center',
        boxShadow: '2px 2px 0 var(--cit-navy-dk)',
      }}>{value}</div>
    </div>
  );
}

function ChromaticMixer({ items, byId, mix }: {
  items: SelItem[]; byId: Record<string, Concept>;
  mix: { L: number; C: number; h: number; css: string };
}) {
  const total = items.reduce((s, x) => s + x.weight, 0) || 1;
  let cursor = 0;
  const stops = items.map(it => {
    const c = byId[it.id];
    if (!c) return '';
    const color = conceptDominant(c.cats).css;
    const start = cursor;
    cursor += it.weight / total;
    return `${color} ${(start * 360).toFixed(1)}deg ${(cursor * 360).toFixed(1)}deg`;
  }).filter(Boolean).join(', ');

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', maxWidth: 360, margin: '0 auto' }}>
      <div style={{ position: 'absolute', inset: -20 }}>
        <Sunburst size={400} color="var(--cit-butter)" rays={48}/>
      </div>
      <div style={{
        position: 'absolute', inset: 14, borderRadius: '50%',
        background: items.length > 0 ? `conic-gradient(from -90deg, ${stops})` : 'oklch(78% 0.06 75)',
        border: '5px solid var(--cit-navy-dk)',
        boxShadow:
          'inset 0 0 0 4px var(--cit-cream), inset 0 0 0 5px var(--cit-navy-dk), ' +
          '8px 8px 0 var(--cit-navy-dk)',
      }}/>
      <div style={{
        position: 'absolute', inset: '30%', borderRadius: '50%',
        background: mix.css,
        border: '5px solid var(--cit-navy-dk)',
        boxShadow:
          'inset 0 0 0 4px var(--cit-cream), inset 0 0 0 5px var(--cit-navy-dk), ' +
          '0 0 0 6px oklch(96% 0.02 85), 0 8px 16px oklch(0% 0 0 / 0.5)',
        display: 'grid', placeItems: 'center',
      }}>
        <div style={{ textAlign: 'center', padding: 8, color: mix.L > 60 ? 'var(--cit-navy-dk)' : 'var(--cit-cream)' }}>
          <div className="cit-condensed" style={{ fontSize: 9, opacity: 0.8 }}>L'AMALGAME</div>
          <div className="cit-h1" style={{
            fontSize: 24, lineHeight: 0.9, color: 'inherit',
            textShadow: mix.L > 60 ? '1px 1px 0 var(--cit-butter)' : '1px 1px 0 oklch(0% 0 0)',
          }}>
            {Math.round(mix.h)}°
          </div>
          <div className="cit-typed" style={{ fontSize: 9, opacity: 0.7 }}>
            L {mix.L.toFixed(0)}% · C {mix.C.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CombinatorScreen({ onTabChange }: Props) {
  const [universe, setUniverse] = useState<Concept[]>([]);
  const [selection, setSelection] = useState<SelItem[]>([]);
  const [search, setSearch] = useState('');
  const [savedName, setSavedName] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);
  const [constraintInput, setConstraintInput] = useState('');
  const [outputType, setOutputType] = useState('essay');
  const [additional, setAdditional] = useState('');
  const [generating, setGenerating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getAdoptedConcepts().then(c => {
      setUniverse(c);
      // If a combo was queued for re-launch, hydrate the selection from it.
      const pending = consumePendingCombo();
      if (pending) {
        setSelection(pending.items.map(i => ({ id: i.conceptId, weight: i.weight })));
        setConstraints(pending.constraints);
        setSavedName(pending.name);
      } else if (c.length >= 2) {
        setSelection([{ id: c[0].id, weight: 60 }, { id: c[1].id, weight: 40 }]);
      }
    });
  }, []);

  const byId = Object.fromEntries(universe.map(c => [c.id, c]));
  const mix = combinationMix(selection
    .map(s => ({ cats: byId[s.id]?.cats ?? [], weight: s.weight }))
    .filter(s => s.cats.length > 0));

  const setWeight = (id: string, w: number) => setSelection(sel => sel.map(s => s.id === id ? { ...s, weight: w } : s));
  const remove = (id: string) => setSelection(sel => sel.filter(s => s.id !== id));
  const add = (id: string) => {
    setSelection(sel => sel.find(s => s.id === id) ? sel : [...sel, { id, weight: 50 }]);
    setSearch('');
  };
  const balance = () => {
    const n = selection.length;
    if (!n) return;
    setSelection(selection.map(s => ({ ...s, weight: Math.round(100 / n) })));
  };

  const available = universe.filter(c =>
    !selection.find(s => s.id === c.id) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  );

  // ---- Empty state: not enough concepts ----
  if (universe.length < 2) {
    return (
      <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CitizenMasthead
          kicker="Croisez vos"
          title="CONCEPTS"
          active="combine"
          onTabChange={onTabChange}
          right={<>
            <Stamp tone="brick" rotate={-4}>0 CONCEPTS EN COURS</Stamp>
            <Sunburst size={68} color="var(--cit-mustard)"/>
          </>}
        />
        <div style={{ flex: 1, padding: '40px 32px', background: 'var(--cit-paper-2)', display: 'grid', placeItems: 'center' }}>
          <div style={{
            padding: '60px 40px', textAlign: 'center', maxWidth: 540,
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 32, marginTop: 16, lineHeight: 0.95 }}>
              Pas assez de concepts<br/>adoptés
            </h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 12, lineHeight: 1.5 }}>
              Pour croiser, il faut au moins <strong>2 concepts adoptés</strong> dans votre univers.
              Allez en adopter quelques-uns avant de revenir ici.
            </p>
            <div style={{ marginTop: 18 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('swipe')}>★ ALLER AU SWIPE</CitButton>
            </div>
          </div>
        </div>
        <CitizenFooter right="★ AJOUTEZ 2–5 CONCEPTS · GLISSEZ LES CURSEURS · ADMIREZ L'AMALGAME"/>
      </div>
    );
  }

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Croisez vos"
        title="CONCEPTS"
        active="combine"
        onTabChange={onTabChange}
        right={<>
          <CitButton size="sm" onClick={() => onTabChange?.('combos')}>Bibliothèque ↗</CitButton>
          <Stamp tone="brick" rotate={-4}>★ {selection.length} CONCEPTS EN COURS</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px 280px', gap: 22, padding: '18px 32px', flex: 1, overflow: 'auto' }}>
        {/* LEFT — selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CitPanel title="Ajouter un concept de votre univers">
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Foucault, BioShock, Kant…"
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
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 16, color: 'var(--cit-brick)',
              }}>⌕</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {available.slice(0, 12).map(c => <ConceptPill key={c.id} concept={c} onClick={() => add(c.id)}/>)}
              {available.length === 0 && (
                <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                  Aucun concept disponible. Adoptez-en d'autres dans le Swipe.
                </div>
              )}
            </div>
          </CitPanel>

          <CitPanel title={
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span>Concepts sélectionnés · {selection.length}</span>
              <button onClick={balance} style={{
                background: 'var(--cit-butter)', color: 'var(--cit-navy-dk)',
                border: '2px solid var(--cit-butter)',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
                letterSpacing: '.14em', padding: '2px 8px', cursor: 'pointer',
              }}>★ ÉQUILIBRER</button>
            </span>
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selection.map(it => {
                const c = byId[it.id];
                if (!c) return null;
                const color = conceptDominant(c.cats).css;
                return (
                  <div key={it.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 80px 28px', gap: 14, alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--cit-cream)',
                    border: '2px solid var(--cit-navy-dk)',
                    borderLeft: `12px solid ${color}`,
                  }}>
                    <div>
                      <div className="cit-h1" style={{ fontSize: 18, lineHeight: 0.95 }}>{c.name}</div>
                      <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginTop: 2 }}>
                        {c.kind} · {c.cats.map(([k, w]) => `${CATEGORIES[k].label} ${Math.round(w * 100)}%`).join(' · ')}
                      </div>
                      <div style={{ marginTop: 8, position: 'relative', height: 10 }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'var(--cit-paper-dk)', border: '2px solid var(--cit-navy-dk)' }}/>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${it.weight}%`, background: color,
                          borderRight: '2px solid var(--cit-navy-dk)',
                        }}/>
                        <input type="range" min={0} max={100} value={it.weight}
                          onChange={e => setWeight(it.id, +e.target.value)}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}/>
                      </div>
                    </div>
                    <Potentiometer value={it.weight} onChange={v => setWeight(it.id, v)} color={color}/>
                    <button onClick={() => remove(it.id)} style={{
                      background: 'var(--cit-brick)', color: 'var(--cit-cream)',
                      border: '2px solid var(--cit-navy-dk)',
                      fontFamily: "'Alfa Slab One', serif", fontSize: 14,
                      width: 28, height: 28, cursor: 'pointer', padding: 0,
                    }}>✕</button>
                  </div>
                );
              })}
              {selection.length === 0 && (
                <div style={{
                  padding: 16, textAlign: 'center',
                  color: 'var(--cit-navy-lt)',
                  fontFamily: "'Special Elite', monospace", fontStyle: 'italic',
                }}>
                  Ajoutez au moins deux concepts pour croiser.
                </div>
              )}
            </div>
          </CitPanel>
        </div>

        {/* CENTER — chromatic mixer */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
          padding: '0 0 0 12px', borderLeft: '2px dashed var(--cit-navy-dk)',
        }}>
          <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', textAlign: 'center' }}>
            ★ L'AMALGAME CHROMATIQUE ★
          </div>
          <ChromaticMixer items={selection} byId={byId} mix={mix}/>

          <div style={{
            margin: '8px 0', padding: '8px 12px',
            background: 'var(--cit-cream)',
            border: '2.5px solid var(--cit-navy-dk)',
            boxShadow: '3px 3px 0 var(--cit-navy-dk)',
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
            textAlign: 'center',
          }}>
            {[
              ['TEINTE', `${Math.round(mix.h)}°`],
              ['CLARTÉ', `${Math.round(mix.L)}%`],
              ['CHROMA', mix.C.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)' }}>{k}</div>
                <div className="cit-h1" style={{ fontSize: 18, color: 'var(--cit-navy-dk)', textShadow: 'none' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => {
              if (selection.length < 2) {
                toast.show({ tone: 'warning', title: 'Au moins 2 concepts', body: 'Sélectionnez deux concepts pour chercher l\'intersection.' });
                return;
              }
              toast.show({
                tone: 'info',
                title: 'Mode Croisement activé',
                body: 'Le Swipe vous proposera des fiches à l\'intersection de cette combinaison.',
              });
              onTabChange?.('swipe');
            }} style={{
              background: 'var(--cit-cream)', color: 'var(--cit-navy-dk)',
              border: '3px solid var(--cit-navy-dk)',
              padding: '10px 14px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 16,
              letterSpacing: '.02em', cursor: 'pointer',
              boxShadow: 'inset 0 -4px 0 var(--cit-paper-dk), 4px 4px 0 var(--cit-navy-dk)',
              textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 22, height: 22, background: mix.css, border: '2px solid var(--cit-navy-dk)' }}/>
              <span style={{ flex: 1, textAlign: 'left' }}>★ Trouver des concepts proches</span>
              <span className="cit-typed" style={{ fontSize: 10, opacity: 0.7, textTransform: 'none' }}>SWIPE →</span>
            </button>
            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ TYPE DE SORTIE</div>
              <select value={outputType} onChange={e => setOutputType(e.target.value)} style={{
                width: '100%', padding: '6px 10px',
                border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--cit-navy-dk)',
                boxShadow: '3px 3px 0 var(--cit-navy-dk)',
              }}>
                {OUTPUT_TYPES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>

            <textarea value={additional} onChange={e => setAdditional(e.target.value)}
              placeholder="Contrainte additionnelle libre (optionnel)…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', minHeight: 56,
                border: '2.5px solid var(--cit-navy-dk)',
                background: 'var(--cit-paper)',
                fontFamily: "'Special Elite', monospace", fontSize: 12, color: 'var(--cit-navy-dk)',
                boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
                resize: 'vertical',
              }}/>

            <button disabled={generating} onClick={async () => {
              if (selection.length < 2) {
                toast.show({ tone: 'warning', title: 'Au moins 2 concepts', body: 'Sélectionnez deux concepts au minimum.' });
                return;
              }
              const settings = await getSettings();
              if (!settings?.llmKey) {
                toast.show({ tone: 'warning', title: 'Clé LLM absente', body: 'Configurez votre clé API dans les Réglages.' });
                onTabChange?.('settings');
                return;
              }
              setGenerating(true);
              try {
                const items = selection
                  .map(s => ({ concept: byId[s.id], weight: s.weight }))
                  .filter(it => it.concept !== undefined) as Array<{ concept: Concept; weight: number }>;
                const ideas = await generateIdeas({
                  settings,
                  items,
                  outputType: OUTPUT_TYPES.find(o => o.id === outputType)?.label ?? 'Essai',
                  constraints,
                  additional,
                });
                // Persist all generated ideas
                await Promise.all(ideas.map(g => saveIdea({
                  title: g.titre ?? 'Idée sans titre',
                  content: g.resume ?? '',
                  conceptIdsWithWeights: selection.map(s => ({ conceptId: s.id, weight: s.weight })),
                  outputType: OUTPUT_TYPES.find(o => o.id === outputType)?.label ?? 'Essai',
                  constraints,
                  inheritedOklch: mix.css,
                })));
                toast.show({ tone: 'success', title: 'Idées générées', body: `${ideas.length} propositions enregistrées.` });
                onTabChange?.('ideas');
              } catch (e) {
                const msg = e instanceof LlmError ? e.message : 'Erreur réseau.';
                toast.show({ tone: 'warning', title: 'Échec de la génération', body: msg });
              } finally {
                setGenerating(false);
              }
            }} style={{
              background: generating ? 'var(--cit-navy-dk)' : 'var(--cit-brick)',
              color: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)',
              padding: '14px 18px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 22,
              letterSpacing: '.02em',
              cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.7 : 1,
              boxShadow: 'inset 0 -4px 0 oklch(0% 0 0 / 0.3), 4px 4px 0 var(--cit-navy-dk), 0 8px 14px oklch(0% 0 0 / 0.4)',
              textTransform: 'uppercase',
              textShadow: '1.5px 1.5px 0 var(--cit-navy-dk)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{generating ? 'CRÉPITAGE…' : '★ Générer des idées'}</span>
              <span className="cit-typed" style={{ fontSize: 10, opacity: 0.8, textTransform: 'none' }}>BUREAU LLM →</span>
            </button>
          </div>
        </div>

        {/* RIGHT — save + tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 12, borderLeft: '2px dashed var(--cit-navy-dk)' }}>
          <CitPanel title="Sauvegarder">
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
              ★ Nom de la combinaison
            </div>
            <input value={savedName} onChange={e => setSavedName(e.target.value)}
              placeholder="Ex. : Foucault sous-marin"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px',
                border: '2.5px solid var(--cit-navy-dk)',
                background: 'var(--cit-paper)',
                fontFamily: "'Special Elite', monospace",
                fontSize: 13, color: 'var(--cit-navy-dk)',
                boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
              }}/>
            <div style={{
              margin: '10px 0', height: 24,
              background: mix.css,
              border: '2.5px solid var(--cit-navy-dk)',
              boxShadow: '3px 3px 0 var(--cit-navy-dk)',
            }}/>
            <CitButton tone="navy" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => {
              if (!savedName.trim()) {
                toast.show({ tone: 'warning', title: 'Nom requis', body: 'Donnez un nom à votre combinaison avant de sauvegarder.' });
                return;
              }
              if (selection.length < 2) {
                toast.show({ tone: 'warning', title: 'Au moins 2 concepts', body: 'Sélectionnez au moins deux concepts à croiser.' });
                return;
              }
              await saveCombination({
                name: savedName.trim(),
                items: selection.map(s => ({ conceptId: s.id, weight: s.weight })),
                constraints,
                mixOklch: mix.css,
              });
              toast.show({ tone: 'success', title: 'Combinaison sauvegardée', body: `« ${savedName} » archivée dans la bibliothèque.` });
              setSavedName('');
            }}>
              ★ Sauver dans le registre
            </CitButton>
          </CitPanel>

          <CitPanel title="Contraintes">
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
              ★ Filtres optionnels en langage naturel
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input value={constraintInput} onChange={e => setConstraintInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && constraintInput.trim()) {
                    e.preventDefault();
                    setConstraints(prev => [...prev, constraintInput.trim()]);
                    setConstraintInput('');
                  }
                }}
                placeholder="auteurs uniquement, XXe siècle…"
                style={{
                  flex: 1, padding: '6px 10px',
                  border: '2.5px solid var(--cit-navy-dk)',
                  background: 'var(--cit-paper)',
                  fontFamily: "'Special Elite', monospace", fontSize: 11,
                  color: 'var(--cit-navy-dk)',
                  boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 2px 2px 0 var(--cit-navy-dk)',
                  width: 0,
                }}/>
              <button onClick={() => {
                if (constraintInput.trim()) {
                  setConstraints(prev => [...prev, constraintInput.trim()]);
                  setConstraintInput('');
                }
              }} style={{
                padding: '6px 10px', background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                border: '2.5px solid var(--cit-navy-dk)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 12,
                cursor: 'pointer',
              }}>+</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {constraints.length === 0 ? (
                <span className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                  Aucune contrainte.
                </span>
              ) : constraints.map((c, i) => (
                <span key={i} style={{
                  fontFamily: "'Special Elite', monospace", fontSize: 10,
                  padding: '2px 6px',
                  border: '1.5px solid var(--cit-navy-dk)',
                  background: 'var(--cit-butter)',
                  color: 'var(--cit-navy-dk)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {c}
                  <button onClick={() => setConstraints(prev => prev.filter((_, j) => j !== i))} style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--cit-brick)', cursor: 'pointer',
                    fontSize: 10, padding: 0,
                  }}>✕</button>
                </span>
              ))}
            </div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ SUGGESTIONS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['auteurs', 'œuvres', 'XXe siècle', 'concepts abstraits', 'lieux', 'personnes vivantes'].map(s => (
                <button key={s} onClick={() => setConstraints(prev => prev.includes(s) ? prev : [...prev, s])} style={{
                  padding: '2px 8px',
                  border: '1.5px dashed var(--cit-navy-dk)',
                  background: 'transparent',
                  color: 'var(--cit-navy-dk)', cursor: 'pointer',
                  fontFamily: "'Special Elite', monospace", fontSize: 10,
                }}>{s}</button>
              ))}
            </div>
          </CitPanel>

          <CitPanel title="Astuce du Bureau" accent="butter">
            <p className="cit-typed" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
              Plus le mélange est <strong style={{ color: 'var(--cit-brick)' }}>contrasté</strong> (catégories éloignées),
              plus les idées générées seront <strong>imprévisibles</strong>. Le Bureau recommande 3 à 4 concepts.
            </p>
          </CitPanel>

          <div className="cit-script" style={{ fontSize: 22, color: 'var(--cit-navy)', lineHeight: 1, textAlign: 'center', transform: 'rotate(-1deg)' }}>
            Bons croisements !
          </div>
        </div>
      </div>

      <CitizenFooter right="★ AJOUTEZ 2–5 CONCEPTS · GLISSEZ LES CURSEURS · ADMIREZ L'AMALGAME"/>
    </div>
  );
}
