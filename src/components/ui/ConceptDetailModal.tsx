import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { modalVariants } from '../../lib/motion';
import { CitButton } from './CitizenShell';
import { Aster } from './atoms';
import { CATEGORIES, gradientForWeights } from '../../lib/categories';
import {
  cacheConcept, toggleFavorite, getCachedConcept,
  getAnnotation, saveAnnotation,
  getTagsForConcept, addTagToConcept, removeTagFromConcept, getAllTags,
  getAllPersonalCategories, assignConceptToPersonalCategory, removeConceptFromPersonalCategory,
  db,
} from '../../stores/db';
import { fetchWikipediaExtract, fetchSemanticRelations, type SemanticRelation } from '../../services/wikidata';
import { useToast } from '../../lib/toast';
import { Markdown } from '../../lib/markdown';
import type { Concept, Tag, PersonalCategory } from '../../types';

interface Props {
  concept: Concept | null;
  open: boolean;
  onClose: () => void;
}

export function ConceptDetailModal({ concept, open, onClose }: Props) {
  const [notes, setNotes] = useState('');
  const [annotationHistory, setAnnotationHistory] = useState<Array<{ markdown: string; at: Date }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [extract, setExtract] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [allPersoCats, setAllPersoCats] = useState<PersonalCategory[]>([]);
  const [assignedPersoCatIds, setAssignedPersoCatIds] = useState<Set<string>>(new Set());
  const [allExistingTags, setAllExistingTags] = useState<Tag[]>([]);
  const [relations, setRelations] = useState<SemanticRelation[]>([]);
  const toast = useToast();
  const autoSaveTimer = useRef<number | null>(null);

  // Load persistent state when concept changes
  useEffect(() => {
    if (!open || !concept) return;
    (async () => {
      const cached = await getCachedConcept(concept.id);
      setFavorite(!!cached?.isFavorite);
      const ann = await getAnnotation(concept.id);
      setNotes(ann?.markdown ?? '');
      setAnnotationHistory(ann?.history ?? []);
      setShowHistory(false);
      const t = await getTagsForConcept(concept.id);
      setTags(t);
      const all = await getAllTags();
      setAllExistingTags(all);
      const cats = await getAllPersonalCategories();
      setAllPersoCats(cats);
      const links = await db.conceptPersonalCategories.where('conceptId').equals(concept.id).toArray();
      setAssignedPersoCatIds(new Set(links.map(l => l.categoryId)));
      // Charge les vraies relations Wikidata si on a un Q-ID
      setRelations([]);
      if (concept.wikidataId) {
        fetchSemanticRelations(concept.wikidataId).then(setRelations).catch(() => {});
      }
      // Try cached extract first, otherwise fetch
      if (cached?.blurbLong) {
        setExtract(cached.blurbLong);
      } else {
        setExtract(null);
        fetchWikipediaExtract(concept.name).then(ext => {
          if (ext && ext !== concept.blurb) {
            setExtract(ext);
            cacheConcept({ ...concept, blurbLong: ext });
          }
        });
      }
    })();
  }, [open, concept]);

  // Autosave notes (debounced 800ms)
  useEffect(() => {
    if (!concept || !open) return;
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      saveAnnotation(concept.id, notes).then(() => setSavedAt(new Date())).catch(() => {});
    }, 800);
    return () => { if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); };
  }, [notes, concept, open]);

  // ESC handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !concept) return null;

  const portraitIsUrl = concept.portrait?.startsWith('http');
  const portrait = portraitIsUrl ? null : concept.name.toUpperCase();

  const addTag = async () => {
    const v = tagInput.trim().replace(/^#/, '');
    if (!v) return;
    await cacheConcept(concept); // ensure concept persists before linking
    const tag = await addTagToConcept(concept.id, v);
    setTags(prev => prev.find(t => t.id === tag.id) ? prev : [...prev, tag]);
    setTagInput('');
  };

  const removeTag = async (tagId: string) => {
    await removeTagFromConcept(concept.id, tagId);
    setTags(prev => prev.filter(t => t.id !== tagId));
  };

  const onFavoriteToggle = async () => {
    await cacheConcept(concept);
    const next = await toggleFavorite(concept.id);
    setFavorite(next);
    toast.show({
      tone: 'success',
      title: next ? 'Marqué favori' : 'Retiré des favoris',
      body: `« ${concept.name} »`,
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'oklch(0% 0 0 / 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
    }} onClick={onClose}>
      <motion.div variants={modalVariants} initial="hidden" animate="visible" onClick={e => e.stopPropagation()} style={{
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
              <img src={concept.portrait} alt={concept.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
            {favorite && (
              <span style={{ position: 'absolute', top: -12, right: -12 }}>
                <Aster size={32} rotate={15}/>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CitButton tone={favorite ? 'brick' : 'butter'} onClick={onFavoriteToggle} style={{ width: '100%', justifyContent: 'center' }}>
              {favorite ? '★ Favori activé' : '☆ Marquer favori'}
            </CitButton>
            {concept.wikidataId && (
              <a href={`https://www.wikidata.org/wiki/${concept.wikidataId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                <CitButton tone="navy" size="sm" style={{ width: '100%', justifyContent: 'center' }}>
                  Ouvrir sur Wikidata ↗
                </CitButton>
              </a>
            )}
            <a href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(concept.name.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
              <CitButton size="sm" style={{ width: '100%', justifyContent: 'center' }}>
                Wikipédia ↗
              </CitButton>
            </a>
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <div style={{ background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)', padding: '12px 22px', position: 'relative', overflow: 'hidden', borderBottom: '3px solid var(--cit-navy-dk)' }}>
            <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
                ★ FICHE COMPLÈTE · {concept.rec ?? concept.id.slice(0, 8)} ★
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
              {extract && extract !== concept.blurb && (
                <p className="cit-typed" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.65, color: 'var(--cit-navy-dk)' }}>
                  {extract}
                </p>
              )}
            </div>

            {relations.length > 0 && (
              <div>
                <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
                  ★ RELATIONS WIKIDATA · {relations.length}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {relations.map((r, i) => (
                    <a key={i} href={`https://www.wikidata.org/wiki/${r.targetQid}`} target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px',
                      background: 'var(--cit-cream)',
                      border: '2px solid var(--cit-navy-dk)',
                      borderLeft: '6px solid var(--cit-navy)',
                      fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
                      letterSpacing: '.08em',
                      color: 'var(--cit-navy-dk)',
                      boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                      textDecoration: 'none',
                    }} title={`${r.propertyId} · ${r.propertyLabel} → ${r.targetQid}`}>
                      <span style={{ color: 'var(--cit-brick)', fontSize: 9, textTransform: 'uppercase' }}>
                        {r.propertyLabel}
                      </span>
                      <span style={{ textTransform: 'uppercase' }}>{r.targetLabel}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {concept.refs.length > 0 && relations.length === 0 && (
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
                ★ ANNOTATION LIBRE — MARKDOWN (sauvegarde auto)
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={'# Vos notes\n\nÉcrivez librement — sauvegarde locale automatique…'}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                  ★ Sauvegarde locale
                  {savedAt ? ` · dernière modif ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  {' · '}{notes.split(/\s+/).filter(Boolean).length} mot{notes.split(/\s+/).filter(Boolean).length > 1 ? 's' : ''}
                </div>
                {annotationHistory.length > 0 && (
                  <button onClick={() => setShowHistory(s => !s)} style={{
                    background: 'transparent', color: 'var(--cit-brick)',
                    border: '1.5px solid var(--cit-navy-dk)',
                    fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                    letterSpacing: '.12em', textTransform: 'uppercase',
                    padding: '2px 8px', cursor: 'pointer',
                  }}>{showHistory ? '✕ Fermer' : `↺ Historique (${annotationHistory.length})`}</button>
                )}
              </div>
              {showHistory && annotationHistory.length > 0 && (
                <div style={{
                  marginTop: 8, padding: '8px 12px',
                  background: 'var(--cit-paper-dk)',
                  border: '2px dashed var(--cit-navy-dk)',
                  maxHeight: 200, overflow: 'auto',
                }}>
                  <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 6 }}>
                    ★ VERSIONS PRÉCÉDENTES
                  </div>
                  {[...annotationHistory].reverse().map((h, i) => (
                    <div key={i} style={{
                      padding: '6px 8px', marginBottom: 4,
                      background: 'var(--cit-cream)',
                      border: '1.5px solid var(--cit-navy-dk)',
                      fontFamily: "'Special Elite', monospace", fontSize: 11,
                      color: 'var(--cit-navy-dk)',
                    }}>
                      <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', marginBottom: 3 }}>
                        ★ {new Date(h.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{h.markdown.slice(0, 200)}{h.markdown.length > 200 ? '…' : ''}</div>
                      <button onClick={() => { setNotes(h.markdown); setShowHistory(false); }} style={{
                        marginTop: 4, padding: '2px 8px',
                        background: 'var(--cit-butter)', color: 'var(--cit-navy-dk)',
                        border: '1.5px solid var(--cit-navy-dk)',
                        fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 700,
                        letterSpacing: '.10em', cursor: 'pointer',
                      }}>↶ Restaurer</button>
                    </div>
                  ))}
                </div>
              )}
              {notes.trim() && (
                <div style={{
                  marginTop: 12, padding: '10px 14px',
                  background: 'var(--cit-cream)',
                  border: '2px dashed var(--cit-navy-dk)',
                }}>
                  <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', marginBottom: 6 }}>★ APERÇU MARKDOWN</div>
                  <Markdown>{notes}</Markdown>
                </div>
              )}
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
                  width: 0,
                }}/>
              <button onClick={addTag} style={{
                padding: '6px 10px', background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
                border: '2.5px solid var(--cit-navy-dk)',
                fontFamily: "'Alfa Slab One', serif", fontSize: 12,
                cursor: 'pointer',
              }}>+</button>
            </div>
            {/* Autocomplétion : suggestions filtrées sur tags existants */}
            {tagInput.trim() && (() => {
              const query = tagInput.trim().toLowerCase().replace(/^#/, '');
              const myTagIds = new Set(tags.map(t => t.id));
              const matches = allExistingTags
                .filter(t => !myTagIds.has(t.id) && t.name.toLowerCase().includes(query))
                .slice(0, 6);
              if (matches.length === 0) return null;
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
                  {matches.map(t => (
                    <button key={t.id} onClick={async () => {
                      await cacheConcept(concept);
                      await addTagToConcept(concept.id, t.name);
                      setTags(prev => prev.find(x => x.id === t.id) ? prev : [...prev, t]);
                      setTagInput('');
                    }} style={{
                      padding: '1px 6px',
                      background: 'var(--cit-butter)', color: 'var(--cit-navy-dk)',
                      border: '1.5px solid var(--cit-navy-dk)',
                      fontFamily: "'Special Elite', monospace", fontSize: 10,
                      cursor: 'pointer',
                    }}>#{t.name}</button>
                  ))}
                </div>
              );
            })()}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tags.length === 0 ? (
                <span className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                  Aucun tag.
                </span>
              ) : tags.map(t => (
                <span key={t.id} style={{
                  fontFamily: "'Special Elite', monospace", fontSize: 10,
                  padding: '1px 6px',
                  border: '1.5px solid var(--cit-navy-dk)',
                  color: 'var(--cit-navy-dk)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  #{t.name}
                  <button onClick={() => removeTag(t.id)} style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--cit-brick)', cursor: 'pointer',
                    fontSize: 10, padding: 0,
                  }}>✕</button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>ÉTIQUETTES PERSONNELLES</div>
            {allPersoCats.length === 0 ? (
              <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                Créez d'abord une étiquette depuis l'onglet Favoris → Étiquettes & Tags.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {allPersoCats.map(pc => {
                  const assigned = assignedPersoCatIds.has(pc.id);
                  return (
                    <button key={pc.id} onClick={async () => {
                      if (assigned) {
                        await removeConceptFromPersonalCategory(concept.id, pc.id);
                        setAssignedPersoCatIds(prev => {
                          const next = new Set(prev); next.delete(pc.id); return next;
                        });
                      } else {
                        await cacheConcept(concept);
                        await assignConceptToPersonalCategory(concept.id, pc.id);
                        setAssignedPersoCatIds(prev => new Set(prev).add(pc.id));
                      }
                    }} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px',
                      background: assigned ? pc.color : 'transparent',
                      color: assigned ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
                      border: '2px solid var(--cit-navy-dk)',
                      borderLeft: `8px solid ${pc.color}`,
                      fontFamily: "'Special Elite', monospace", fontSize: 10,
                      cursor: 'pointer',
                      boxShadow: assigned ? '2px 2px 0 var(--cit-navy-dk)' : 'none',
                    }}>
                      {assigned && <span>✓</span>}
                      {pc.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>HISTORIQUE</div>
            <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', lineHeight: 1.5 }}>
              ★ Source : {concept.sourceKind ?? 'random'}<br/>
              {concept.wikidataId && <>★ Wikidata : {concept.wikidataId}<br/></>}
              {concept.isManual && <>★ Concept créé manuellement<br/></>}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
