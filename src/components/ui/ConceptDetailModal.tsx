import { useEffect, useState } from 'react';
import { CitButton } from './CitizenShell';
import { Aster } from './atoms';
import { CATEGORIES, gradientForWeights } from '../../lib/categories';
import type { Concept } from '../../types';

interface Props {
  concept: Concept | null;
  open: boolean;
  onClose: () => void;
}

export function ConceptDetailModal({ concept, open, onClose }: Props) {
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !concept) return null;

  const portraitIsUrl = concept.portrait?.startsWith('http');
  const portrait = portraitIsUrl ? null : concept.name.toUpperCase();

  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, '');
    if (v && !tags.includes(v)) setTags(prev => [...prev, v]);
    setTagInput('');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'oklch(0% 0 0 / 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 1020, maxHeight: '90vh',
        background: 'var(--cit-cream)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow: '10px 10px 0 var(--cit-navy-dk)',
        display: 'grid', gridTemplateColumns: '320px 1fr 280px',
        overflow: 'hidden',
      }}>
        {/* Portrait column */}
        <div style={{ background: 'var(--cit-butter)', borderRight: '3px solid var(--cit-navy-dk)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div style={{
            position: 'relative', aspectRatio: '3/4',
            background: 'var(--cit-brick)',
            border: '3px solid var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
            display: 'grid', placeItems: 'center', overflow: 'hidden',
          }}>
            {portraitIsUrl ? (
              <img src={concept.portrait} alt={concept.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            ) : (
              <>
                <div style={{
                  position: 'absolute', inset: '10% 10% 28% 10%',
                  background: 'var(--cit-cream)', borderRadius: '50%',
                  border: '3px solid var(--cit-navy-dk)',
                }}/>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'grid', placeItems: 'center',
                  fontFamily: "'Alfa Slab One', serif",
                  fontSize: 22, lineHeight: 0.95,
                  color: 'var(--cit-navy-dk)',
                  textAlign: 'center', padding: 14,
                  textShadow: '2px 2px 0 var(--cit-butter)',
                  zIndex: 1,
                }}>{portrait}</div>
              </>
            )}
            {concept.years && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 14, padding: '4px 8px',
                textAlign: 'center', letterSpacing: '.06em',
                borderTop: '2px solid var(--cit-butter)',
              }}>{concept.years}</div>
            )}
            <span style={{ position: 'absolute', top: -12, right: -12 }}>
              <Aster size={32} rotate={15}/>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CitButton tone="brick" style={{ width: '100%', justifyContent: 'center' }}>★ Favori activé</CitButton>
            {concept.wikidataId && (
              <a href={`https://www.wikidata.org/wiki/${concept.wikidataId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                <CitButton tone="navy" size="sm" style={{ width: '100%', justifyContent: 'center' }}>
                  Ouvrir sur Wikidata ↗
                </CitButton>
              </a>
            )}
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <div style={{ background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)', padding: '12px 22px', position: 'relative', overflow: 'hidden', borderBottom: '3px solid var(--cit-navy-dk)' }}>
            <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
                ★ FICHE COMPLÈTE · {concept.rec ?? concept.id} ★
              </div>
              <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 40, lineHeight: 0.9, margin: '2px 0' }}>
                {concept.name}<span style={{ color: 'var(--cit-butter)' }}>!</span>
              </h2>
              <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-cream)' }}>
                {concept.kind}{concept.years ? ` · ${concept.years}` : ''}
              </div>
            </div>
          </div>
          <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            <div>
              <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ NOTICE — Wikidata / Wikipédia</div>
              <p className="cit-typed" style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}>{concept.blurb}</p>
            </div>

            {concept.refs.length > 0 && (
              <div>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
                  ★ RÉFÉRENCES · {concept.refs.length}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {concept.refs.map((r, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px',
                      background: 'var(--cit-cream)',
                      border: '2px solid var(--cit-navy-dk)',
                      fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
                      letterSpacing: '.08em', textTransform: 'uppercase',
                      color: 'var(--cit-navy-dk)',
                      boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                    }}>{r}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ flex: 1 }}>
              <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
                ★ ANNOTATION LIBRE — MARKDOWN (éditable)
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={'# Vos notes\n\nÉcrivez librement…'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '2.5px solid var(--cit-navy-dk)',
                  background: 'var(--cit-paper)',
                  padding: '10px 12px',
                  minHeight: 120,
                  fontFamily: "'Special Elite', monospace", fontSize: 12,
                  color: 'var(--cit-navy-dk)', lineHeight: 1.55,
                  boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
                  resize: 'vertical',
                }}/>
              <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginTop: 4, fontStyle: 'italic' }}>
                ★ Sauvegarde locale · {notes.split(/\s+/).filter(Boolean).length} mot{notes.split(/\s+/).filter(Boolean).length > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Side meta panel */}
        <div style={{ background: 'var(--cit-paper-dk)', borderLeft: '3px solid var(--cit-navy-dk)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ ATTRIBUTS</span>
            <button onClick={onClose} style={{
              background: 'var(--cit-brick)', color: 'var(--cit-cream)',
              border: '2px solid var(--cit-navy-dk)',
              fontFamily: "'Alfa Slab One', serif", fontSize: 14,
              padding: '0 10px', cursor: 'pointer',
            }}>✕</button>
          </div>

          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>EMPREINTE CHROMATIQUE</div>
            <div style={{
              height: 14, background: gradientForWeights(concept.cats),
              border: '2px solid var(--cit-navy-dk)',
              boxShadow: '2px 2px 0 var(--cit-navy-dk)',
            }}/>
          </div>

          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>CATÉGORIES OFFICIELLES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {concept.cats.map(([k, w]) => {
                const c = CATEGORIES[k];
                return (
                  <span key={k} className="cit-condensed" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, padding: '2px 7px',
                    background: 'var(--cit-cream)', border: '2px solid var(--cit-navy-dk)',
                    fontWeight: 700, letterSpacing: '.10em',
                  }}>
                    <span style={{ width: 8, height: 8, background: c.oklch, border: '1px solid var(--cit-navy-dk)' }}/>
                    {c.label}<span style={{ color: 'var(--cit-brick)' }}>{Math.round(w * 100)}%</span>
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>TAGS PERSONNELS</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="ajouter…" style={{
                  flex: 1, padding: '6px 10px',
                  border: '2.5px solid var(--cit-navy-dk)',
                  background: 'var(--cit-paper)',
                  fontFamily: "'Special Elite', monospace", fontSize: 11,
                  color: 'var(--cit-navy-dk)',
                  boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 2px 2px 0 var(--cit-navy-dk)',
                }}/>
              <button onClick={addTag} style={{
                padding: '6px 10px', background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                border: '2.5px solid var(--cit-navy-dk)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 12,
                cursor: 'pointer',
              }}>+</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tags.length === 0 ? (
                <span className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                  Aucun tag.
                </span>
              ) : tags.map(t => (
                <span key={t} style={{
                  fontFamily: "'Special Elite', monospace", fontSize: 10,
                  padding: '1px 6px',
                  border: '1.5px solid var(--cit-navy-dk)',
                  color: 'var(--cit-navy-dk)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  #{t}
                  <button onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--cit-brick)', cursor: 'pointer',
                    fontSize: 10, padding: 0,
                  }}>✕</button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>HISTORIQUE</div>
            <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', lineHeight: 1.5 }}>
              ★ Vu pour la première fois<br/>★ Source : {concept.sourceKind ?? 'random'}<br/>
              {concept.wikidataId && <>★ ID Wikidata : {concept.wikidataId}</>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
