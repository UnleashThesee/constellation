import { useEffect, useRef, useState } from 'react';
import { CitButton, CitPanel } from './CitizenShell';
import { Stamp, Aster, Sunburst } from './atoms';
import { CATEGORIES } from '../../lib/categories';
import { updateIdea, deleteIdea, getCachedConcept, getSettings } from '../../stores/db';
import { deepDiveIdea, LlmError, type DeepDive } from '../../services/llm';
import { useToast } from '../../lib/toast';
import type { Idea, IdeaStatus, Concept } from '../../types';

interface Props {
  idea: Idea | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_LABELS: Record<IdeaStatus, string> = {
  new: 'Nouvelle',
  inprogress: 'En cours',
  abandoned: 'Abandonnée',
  done: 'Réalisée',
};

const STATUS_COLORS: Record<IdeaStatus, string> = {
  new: 'var(--cit-navy)',
  inprogress: 'var(--cit-mustard)',
  abandoned: 'var(--cit-brick)',
  done: 'var(--cit-rust)',
};

export function IdeaModal({ idea, open, onClose, onUpdate }: Props) {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<IdeaStatus>('new');
  const [favorite, setFavorite] = useState(false);
  const [concepts, setConcepts] = useState<Record<string, Concept>>({});
  const [deepDive, setDeepDive] = useState<DeepDive | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveError, setDeepDiveError] = useState<string | null>(null);
  const toast = useToast();
  const autoSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !idea) return;
    setNotes(idea.notes);
    setStatus(idea.status);
    setFavorite(idea.isFavorite);
    setDeepDive(null);
    setDeepDiveError(null);
    (async () => {
      const ids = idea.conceptIdsWithWeights.map(i => i.conceptId);
      const cs = await Promise.all(ids.map(id => getCachedConcept(id)));
      const byId: Record<string, Concept> = {};
      cs.forEach(c => { if (c) byId[c.id] = c; });
      setConcepts(byId);
    })();
  }, [open, idea]);

  // Autosave notes
  useEffect(() => {
    if (!idea || !open) return;
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      updateIdea(idea.id, { notes }).catch(() => {});
    }, 800);
    return () => { if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); };
  }, [notes, idea, open]);

  // ESC handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !idea) return null;

  const handleStatus = async (s: IdeaStatus) => {
    setStatus(s);
    await updateIdea(idea.id, { status: s });
    onUpdate();
  };

  const handleFav = async () => {
    const next = !favorite;
    setFavorite(next);
    await updateIdea(idea.id, { isFavorite: next });
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer définitivement « ${idea.title} » ?`)) return;
    await deleteIdea(idea.id);
    toast.show({ tone: 'info', title: 'Idée supprimée', body: `« ${idea.title} »` });
    onUpdate();
    onClose();
  };

  const handleDeepDive = async () => {
    setDeepDiveLoading(true);
    setDeepDiveError(null);
    try {
      const settings = await getSettings();
      if (!settings) throw new Error('Réglages introuvables.');
      const items = idea.conceptIdsWithWeights
        .map(i => ({ concept: concepts[i.conceptId], weight: i.weight }))
        .filter(it => it.concept !== undefined) as Array<{ concept: Concept; weight: number }>;
      const dd = await deepDiveIdea({
        settings,
        title: idea.title,
        content: idea.content,
        items,
        constraints: idea.constraints,
      });
      setDeepDive(dd);
      toast.show({ tone: 'success', title: 'Approfondissement prêt', body: 'Le Bureau a creusé pour vous.' });
    } catch (e) {
      const msg = e instanceof LlmError ? e.message : 'Erreur inconnue';
      setDeepDiveError(msg);
      toast.show({ tone: 'warning', title: 'Échec approfondissement', body: msg });
    } finally {
      setDeepDiveLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'oklch(0% 0 0 / 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 1020, maxHeight: '92vh',
        background: 'var(--cit-cream)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow: '10px 10px 0 var(--cit-navy-dk)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
          padding: '14px 24px',
          position: 'relative', overflow: 'hidden',
          borderBottom: '3px solid var(--cit-navy-dk)',
          borderLeft: idea.inheritedOklch ? `14px solid ${idea.inheritedOklch}` : undefined,
        }}>
          <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
                ★ IDÉE · {idea.outputType.toUpperCase()} · GÉNÉRÉE LE {idea.createdAt.toLocaleDateString('fr-FR')}
              </div>
              <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 36, lineHeight: 0.95, margin: '2px 0' }}>
                {idea.title}<span style={{ color: 'var(--cit-butter)' }}>!</span>
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px',
                  background: STATUS_COLORS[status], color: 'var(--cit-cream)',
                  border: '1.5px solid var(--cit-cream)',
                  fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                  letterSpacing: '.12em', textTransform: 'uppercase',
                }}>{STATUS_LABELS[status]}</span>
                {favorite && <Aster size={20} rotate={10}/>}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'var(--cit-brick)', color: 'var(--cit-cream)',
              border: '2px solid var(--cit-cream)',
              fontFamily: "'Alfa Slab One', serif", fontSize: 14, padding: '4px 10px',
              cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0, flex: 1, overflow: 'hidden' }}>
          {/* Main */}
          <div style={{ padding: '18px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ RÉSUMÉ</div>
              <p className="cit-typed" style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>{idea.content}</p>
            </div>

            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ NOTES PERSONNELLES (sauvegarde auto)</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Vos notes, pistes, références…" style={{
                width: '100%', boxSizing: 'border-box',
                border: '2.5px solid var(--cit-navy-dk)',
                background: 'var(--cit-paper)',
                padding: '10px 12px', minHeight: 100,
                fontFamily: "'Special Elite', monospace", fontSize: 12,
                color: 'var(--cit-navy-dk)', lineHeight: 1.55,
                boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
                resize: 'vertical',
              }}/>
            </div>

            {/* Deep dive section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ APPROFONDISSEMENT (LLM)</div>
                <CitButton size="sm" tone="brick" onClick={handleDeepDive}>
                  {deepDiveLoading ? '⌛ Crépitage…' : deepDive ? '↻ Régénérer' : '★ Approfondir'}
                </CitButton>
              </div>

              {deepDiveError && (
                <div style={{
                  padding: '8px 12px', background: 'var(--cit-brick)', color: 'var(--cit-cream)',
                  border: '2px solid var(--cit-navy-dk)', fontSize: 11,
                  fontFamily: "'Special Elite', monospace",
                }}>★ {deepDiveError}</div>
              )}

              {deepDiveLoading && (
                <div style={{
                  padding: '20px',
                  border: '3px dashed var(--cit-navy-dk)',
                  background: 'var(--cit-cream)',
                  display: 'flex', alignItems: 'center', gap: 14,
                  fontFamily: "'Special Elite', monospace",
                  color: 'var(--cit-navy-dk)', fontSize: 13,
                }}>
                  <Sunburst size={48} color="var(--cit-brick)"/>
                  <div>
                    <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-brick)' }}>★ LE BUREAU CRÉPITE…</div>
                    <div className="cit-typed" style={{ marginTop: 2 }}>
                      Plan détaillé · variations · références · questions…
                    </div>
                  </div>
                </div>
              )}

              {deepDive && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <CitPanel title="Plan détaillé">
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {deepDive.planDetaille.map((s, i) => (
                        <li key={i} style={{ fontFamily: "'Special Elite', monospace", fontSize: 12, marginBottom: 6, color: 'var(--cit-navy-dk)' }}>
                          <strong>{s.etape}</strong> — {s.detail}
                        </li>
                      ))}
                    </ol>
                  </CitPanel>
                  <CitPanel title="Variations">
                    {deepDive.variations.map((v, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div className="cit-h1" style={{ fontSize: 16, lineHeight: 1, marginBottom: 2 }}>{v.titre}</div>
                        <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>{v.angle}</div>
                      </div>
                    ))}
                  </CitPanel>
                  <CitPanel title="Références">
                    {deepDive.references.map((r, i) => (
                      <div key={i} style={{ marginBottom: 4, fontSize: 12, fontFamily: "'Special Elite', monospace", color: 'var(--cit-navy-dk)' }}>
                        ★ <strong>{r.source}</strong> — {r.pourquoi}
                      </div>
                    ))}
                  </CitPanel>
                  <CitPanel title="Questions de démarrage">
                    {deepDive.questions.map((q, i) => (
                      <div key={i} style={{ marginBottom: 4, fontSize: 12, fontFamily: "'Special Elite', monospace", color: 'var(--cit-navy-dk)' }}>
                        ★ {q}
                      </div>
                    ))}
                  </CitPanel>
                </div>
              )}
            </div>
          </div>

          {/* Side */}
          <div style={{
            background: 'var(--cit-paper-dk)', borderLeft: '3px solid var(--cit-navy-dk)',
            padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto',
          }}>
            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>STATUT</div>
              <select value={status} onChange={e => handleStatus(e.target.value as IdeaStatus)} style={{
                width: '100%', padding: '6px 10px',
                border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-cream)',
                fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--cit-navy-dk)',
                boxShadow: '3px 3px 0 var(--cit-navy-dk)',
              }}>
                {(Object.keys(STATUS_LABELS) as IdeaStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>CONCEPTS MOBILISÉS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {idea.conceptIdsWithWeights.map((it, i) => {
                  const c = concepts[it.conceptId];
                  if (!c) return null;
                  const cat = CATEGORIES[c.cats[0]?.[0] ?? 'personnages'];
                  return (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 6px 2px 2px',
                      background: 'var(--cit-cream)',
                      border: '2px solid var(--cit-navy-dk)',
                      borderLeft: `6px solid ${cat.oklch}`,
                      fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                      color: 'var(--cit-navy-dk)',
                    }}>{c.name}<span style={{ color: 'var(--cit-brick)' }}>{it.weight}%</span></span>
                  );
                })}
              </div>
            </div>

            {idea.constraints.length > 0 && (
              <div>
                <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>CONTRAINTES APPLIQUÉES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {idea.constraints.map((c, i) => (
                    <Stamp key={i} tone="navy" size={9}>{c}</Stamp>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <CitButton tone={favorite ? 'brick' : 'butter'} onClick={handleFav}>
                {favorite ? '★ Retirer favori' : '☆ Marquer favori'}
              </CitButton>
              <CitButton tone="navy" size="sm" onClick={handleDelete}>
                ✕ Supprimer
              </CitButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
