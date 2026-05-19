import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp } from '../../components/ui/atoms';
import { CATEGORIES, conceptDominant, combinationMix } from '../../lib/categories';
import { getAdoptedConcepts, saveCombination, saveIdea, getSettings, incrementCombinationIdeasCount, getAllConstraints } from '../../stores/db';
import type { SavedConstraint } from '../../types';
import { useToast } from '../../lib/toast';
import { generateIdeas, suggestSimilarConcepts, LlmError, type SimilarConceptSuggestion } from '../../services/llm';
import { consumePendingCombo, consumePendingConcepts } from '../../lib/pending';
import { cacheConcept, recordInteraction } from '../../stores/db';
import { CATEGORIES as CATS } from '../../lib/categories';
import { playSound } from '../../lib/sounds';
import type { Concept, CategoryKey } from '../../types';

const SESSION_ID = `combinator-${Date.now()}`;

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
  const [seekingNear, setSeekingNear] = useState(false);
  const [nearResults, setNearResults] = useState<SimilarConceptSuggestion[] | null>(null);
  const [nearAdopted, setNearAdopted] = useState<Set<string>>(new Set());
  const [loadedComboId, setLoadedComboId] = useState<string | null>(null);
  const [recentConstraints, setRecentConstraints] = useState<SavedConstraint[]>([]);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const toast = useToast();

  // Placeholder rotatif (3-4 exemples cycliques toutes les 4s)
  const PLACEHOLDERS = [
    'des auteurs uniquement',
    "des œuvres d'art",
    'des concepts du XXe siècle',
    'des courants philosophiques',
    'rien qui soit américain',
  ];
  useEffect(() => {
    const id = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(id);
  }, []);

  // Charge les 5 dernières contraintes utilisées
  useEffect(() => {
    getAllConstraints().then(arr => setRecentConstraints(arr.slice(0, 5)));
  }, []);

  useEffect(() => {
    getAdoptedConcepts().then(c => {
      setUniverse(c);
      // If a combo was queued for re-launch, hydrate the selection from it.
      const pending = consumePendingCombo();
      const pendingCs = consumePendingConcepts();
      if (pending) {
        setSelection(pending.items.map(i => ({ id: i.conceptId, weight: i.weight })));
        setConstraints(pending.constraints);
        setSavedName(pending.name);
        setLoadedComboId(pending.id);
      } else if (pendingCs && pendingCs.length > 0) {
        const even = Math.round(100 / pendingCs.length);
        setSelection(pendingCs.map(p => ({ id: p.id, weight: even })));
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
          <CitButton size="sm" onClick={() => onTabChange?.('constraints')}>Contraintes ↗</CitButton>
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
            <button disabled={seekingNear || selection.length < 2} onClick={async () => {
              if (selection.length < 2) return;
              const settings = await getSettings();
              if (!settings?.llmKey) {
                toast.show({ tone: 'warning', title: 'Clé LLM absente', body: 'Configurez votre clé API dans les Réglages.' });
                onTabChange?.('settings');
                return;
              }
              setSeekingNear(true);
              playSound('llmStart');
              try {
                const items = selection
                  .map(s => ({ concept: byId[s.id], weight: s.weight }))
                  .filter(it => it.concept !== undefined) as Array<{ concept: Concept; weight: number }>;
                const suggestions = await suggestSimilarConcepts({ settings, items, constraints, count: 7 });
                setNearResults(suggestions);
                playSound('llmDone');
                toast.show({ tone: 'success', title: 'Concepts proches trouvés', body: `${suggestions.length} suggestions à l'intersection.` });
              } catch (e) {
                playSound('llmFail');
                const msg = e instanceof LlmError ? e.message : 'Erreur réseau.';
                toast.show({ tone: 'warning', title: 'Échec de la recherche', body: msg });
              } finally {
                setSeekingNear(false);
              }
            }} style={{
              background: seekingNear ? 'var(--cit-paper-dk)' : 'var(--cit-cream)',
              color: 'var(--cit-navy-dk)',
              border: '3px solid var(--cit-navy-dk)',
              padding: '10px 14px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 16,
              letterSpacing: '.02em',
              cursor: seekingNear ? 'wait' : selection.length < 2 ? 'not-allowed' : 'pointer',
              opacity: seekingNear || selection.length < 2 ? 0.6 : 1,
              boxShadow: 'inset 0 -4px 0 var(--cit-paper-dk), 4px 4px 0 var(--cit-navy-dk)',
              textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 22, height: 22, background: mix.css, border: '2px solid var(--cit-navy-dk)' }}/>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {seekingNear ? 'RECHERCHE…' : '★ Trouver des concepts proches'}
              </span>
              <span className="cit-typed" style={{ fontSize: 10, opacity: 0.7, textTransform: 'none' }}>5–10</span>
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

            <button disabled={generating || selection.length < 2} onClick={async () => {
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
                  combinationId: loadedComboId ?? undefined,
                })));
                // Incrémente le compteur ideasGeneratedCount si on est sur une combo sauvegardée
                if (loadedComboId) await incrementCombinationIdeasCount(loadedComboId, ideas.length);
                toast.show({ tone: 'success', title: 'Idées générées', body: `${ideas.length} propositions enregistrées.` });
                onTabChange?.('ideas');
              } catch (e) {
                const msg = e instanceof LlmError ? e.message : 'Erreur réseau.';
                toast.show({ tone: 'warning', title: 'Échec de la génération', body: msg });
              } finally {
                setGenerating(false);
              }
            }} style={{
              background: generating || selection.length < 2 ? 'var(--cit-paper-dk)' : 'var(--cit-brick)',
              color: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)',
              padding: '14px 18px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 22,
              letterSpacing: '.02em',
              cursor: generating ? 'wait' : selection.length < 2 ? 'not-allowed' : 'pointer',
              opacity: generating || selection.length < 2 ? 0.55 : 1,
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
                placeholder={PLACEHOLDERS[placeholderIdx]}
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
            {recentConstraints.length > 0 && (
              <>
                <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4, marginTop: 8 }}>
                  ★ VOS DERNIÈRES CONTRAINTES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {recentConstraints.map(rc => (
                    <button key={rc.id}
                      onClick={() => setConstraints(prev => prev.includes(rc.text) ? prev : [...prev, rc.text])}
                      title={`Utilisée ${rc.useCount}× · ${rc.mappedQid ?? 'libre (LLM)'}`}
                      style={{
                        padding: '2px 8px',
                        border: '2px solid var(--cit-navy-dk)',
                        background: rc.mappedQid ? 'var(--cit-navy-dk)' : 'var(--cit-butter)',
                        color: rc.mappedQid ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
                        fontFamily: "'Special Elite', monospace", fontSize: 10,
                        cursor: 'pointer',
                        boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                      {rc.text}
                      <span style={{ opacity: 0.7, fontSize: 9 }}>×{rc.useCount}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
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

      {/* Inline panel : 5-10 concepts proches générés via LLM */}
      {nearResults && nearResults.length > 0 && (
        <div style={{
          padding: '14px 32px 18px',
          background: 'var(--cit-paper-dk)',
          borderTop: '3px solid var(--cit-navy-dk)',
          position: 'relative', zIndex: 3,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="cit-condensed" style={{ fontSize: 12, color: 'var(--cit-navy-dk)' }}>
              ★ {nearResults.length} CONCEPTS PROCHES · CLIQUEZ ★ POUR ADOPTER ★
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <CitButton size="sm" onClick={() => setNearResults(null)}>✕ Fermer</CitButton>
              <CitButton size="sm" tone="navy" onClick={async () => {
                const settings = await getSettings();
                if (!settings?.llmKey) return;
                setSeekingNear(true);
                try {
                  const items = selection
                    .map(s => ({ concept: byId[s.id], weight: s.weight }))
                    .filter(it => it.concept !== undefined) as Array<{ concept: Concept; weight: number }>;
                  const suggestions = await suggestSimilarConcepts({ settings, items, constraints, count: 7 });
                  setNearResults(suggestions);
                  setNearAdopted(new Set());
                } catch (e) {
                  const msg = e instanceof LlmError ? e.message : 'Erreur';
                  toast.show({ tone: 'warning', title: 'Échec', body: msg });
                } finally {
                  setSeekingNear(false);
                }
              }}>↻ Régénérer</CitButton>
            </div>
          </div>

          {nearResults.length < 3 && (
            <div style={{
              padding: '8px 12px', marginBottom: 10,
              background: 'var(--cit-brick)', color: 'var(--cit-cream)',
              border: '2px solid var(--cit-navy-dk)',
              fontFamily: "'Special Elite', monospace", fontSize: 11,
            }}>
              ★ Contrainte trop restrictive ? Le Bureau n'a trouvé que {nearResults.length} candidats.
              <button onClick={() => setConstraints([])} style={{
                marginLeft: 8, padding: '2px 8px',
                background: 'var(--cit-cream)', color: 'var(--cit-brick)',
                border: '1.5px solid var(--cit-navy-dk)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 10,
                cursor: 'pointer',
              }}>Désactiver les contraintes</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {nearResults.map((sug, i) => {
              const adopted = nearAdopted.has(sug.nom);
              const cats = sug.categories
                .map(c => CATS[c as CategoryKey])
                .filter(Boolean);
              const dominantColor = cats[0]?.oklch ?? 'var(--cit-navy)';
              return (
                <div key={i} style={{
                  background: 'var(--cit-cream)',
                  border: '3px solid var(--cit-navy-dk)',
                  borderLeft: `10px solid ${dominantColor}`,
                  boxShadow: '4px 4px 0 var(--cit-navy-dk)',
                  padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  opacity: adopted ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <h4 className="cit-h1" style={{ fontSize: 16, lineHeight: 0.95, margin: 0 }}>{sug.nom}</h4>
                    <span style={{
                      fontFamily: "'Alfa Slab One', serif", fontSize: 14,
                      color: 'var(--cit-brick)',
                    }}>{sug.score}</span>
                  </div>
                  <div style={{
                    height: 6, background: 'var(--cit-paper)',
                    border: '1.5px solid var(--cit-navy-dk)',
                  }}>
                    <div style={{ width: `${sug.score}%`, height: '100%', background: dominantColor }}/>
                  </div>
                  <p className="cit-typed" style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: 'var(--cit-navy-dk)' }}>
                    {sug.description}
                  </p>
                  {sug.respectsConstraints && constraints.length > 0 && (
                    <span style={{
                      display: 'inline-block', alignSelf: 'flex-start',
                      padding: '1px 6px',
                      background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                      fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 700,
                      letterSpacing: '.10em', textTransform: 'uppercase',
                    }}>✓ Respecte les contraintes</span>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {cats.slice(0, 3).map(c => (
                      <span key={c.key} className="cit-condensed" style={{
                        fontSize: 9, padding: '1px 5px',
                        background: c.oklch, color: 'var(--cit-cream)',
                        border: '1.5px solid var(--cit-navy-dk)', fontWeight: 700,
                        textShadow: '1px 1px 0 oklch(0% 0 0 / 0.4)',
                      }}>{c.short}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
                    <CitButton
                      size="sm" tone={adopted ? 'navy' : 'brick'}
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={async () => {
                        if (adopted) return;
                        const id = `near-${sug.nom.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
                        const dominantCat = (cats[0]?.key ?? 'personnages') as CategoryKey;
                        const concept: Concept = {
                          id, name: sug.nom, blurb: sug.description,
                          cats: cats.length > 0
                            ? cats.map(c => [c.key, 1 / cats.length] as [CategoryKey, number])
                            : [[dominantCat, 1]],
                          kind: 'Suggestion proche',
                          refs: [],
                          sourceKind: 'cross',
                          sourceTag: 'concepts-proches',
                          isManual: true,
                          createdAt: new Date(),
                        };
                        await cacheConcept(concept);
                        await recordInteraction(id, 'valid', SESSION_ID);
                        setNearAdopted(prev => new Set(prev).add(sug.nom));
                        playSound('adopt');
                        toast.show({ tone: 'success', title: 'Concept adopté', body: `« ${sug.nom} » rejoint votre univers.` });
                      }}>
                      {adopted ? '✓ Adopté' : '★ Adopter'}
                    </CitButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CitizenFooter right="★ AJOUTEZ 2–5 CONCEPTS · GLISSEZ LES CURSEURS · ADMIREZ L'AMALGAME"/>
    </div>
  );
}
