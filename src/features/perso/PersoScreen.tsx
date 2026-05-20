import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp } from '../../components/ui/atoms';
import {
  getAllPersonalCategories, createPersonalCategory, deletePersonalCategory, updatePersonalCategory,
  getConceptsInPersonalCategory, assignConceptToPersonalCategory, getAdoptedConcepts,
  getTagUsage, db,
} from '../../stores/db';
import { useToast } from '../../lib/toast';
import { setPendingConcepts } from '../../lib/pending';
import type { PersonalCategory, Concept, Tag } from '../../types';

interface Props { onTabChange?: (id: string) => void }

const PRESET_COLORS = [
  'oklch(35% 0.13 250)', 'oklch(48% 0.20 28)',  'oklch(70% 0.16 88)',
  'oklch(50% 0.18 155)', 'oklch(45% 0.20 330)', 'oklch(60% 0.25 350)',
];

function PersoCatTile({ cat, active, count, onClick, onDropConcept }: {
  cat: PersonalCategory; active: boolean; count: number; onClick: () => void;
  onDropConcept: (conceptId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <button
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const conceptId = e.dataTransfer.getData('text/concept-id');
        if (conceptId) onDropConcept(conceptId);
      }}
      style={{
        display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 14, alignItems: 'center',
        padding: '12px 14px',
        background: dragOver ? 'var(--cit-brick)' : active ? 'var(--cit-butter)' : 'var(--cit-cream)',
        color: dragOver ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
        border: dragOver ? '3px dashed var(--cit-cream)' : '3px solid var(--cit-navy-dk)',
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
      }}>{count}</div>
      <div>
        <div className="cit-h1" style={{ fontSize: 20, lineHeight: 0.95 }}>{cat.name}</div>
        <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginTop: 2 }}>
          ★ Créée le {cat.createdAt.toLocaleDateString('fr-FR')}
        </div>
      </div>
      <span style={{ fontFamily: "'Alfa Slab One', serif", fontSize: 18, color: 'var(--cit-brick)', lineHeight: 1 }}>›</span>
    </button>
  );
}

function CategoryDetailPanel({ cat, concepts, onClose, onDelete, onLaunchCombo, onRename, onChangeColor }: {
  cat: PersonalCategory; concepts: Concept[]; onClose: () => void; onDelete: () => void;
  onLaunchCombo: () => void;
  onRename: (newName: string) => void;
  onChangeColor: (newColor: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(cat.name);
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
            {concepts.length} concept{concepts.length > 1 ? 's' : ''} rangé{concepts.length > 1 ? 's' : ''}
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
        <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)' }}>★ CONCEPTS</div>
        {concepts.length === 0 ? (
          <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
            Aucun concept rangé. Allez en ajouter depuis la fiche détaillée d'un concept.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {concepts.map(c => (
              <div key={c.id} style={{
                padding: '4px 8px', background: 'var(--cit-paper)',
                border: '2px solid var(--cit-navy-dk)',
                fontFamily: "'Special Elite', monospace", fontSize: 11,
                color: 'var(--cit-navy-dk)',
              }}>{c.name}</div>
            ))}
          </div>
        )}

        {editingName ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} style={{
              flex: 1, padding: '6px 10px',
              border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-paper)',
              fontFamily: "'Special Elite', monospace", fontSize: 13,
            }}/>
            <button onClick={() => { onRename(nameInput); setEditingName(false); }} style={{
              padding: '6px 10px', background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
              border: '2.5px solid var(--cit-navy-dk)',
              fontFamily: "'Alfa Slab One', serif", fontSize: 12, cursor: 'pointer',
            }}>✓</button>
            <button onClick={() => { setEditingName(false); setNameInput(cat.name); }} style={{
              padding: '6px 10px', background: 'var(--cit-cream)', color: 'var(--cit-brick)',
              border: '2.5px solid var(--cit-navy-dk)',
              fontFamily: "'Alfa Slab One', serif", fontSize: 12, cursor: 'pointer',
            }}>✕</button>
          </div>
        ) : (
          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>★ MODIFIER LA COULEUR</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                'oklch(35% 0.13 250)', 'oklch(48% 0.20 28)',  'oklch(70% 0.16 88)',
                'oklch(50% 0.18 155)', 'oklch(45% 0.20 330)', 'oklch(60% 0.25 350)',
              ].map(c => (
                <button key={c} onClick={() => onChangeColor(c)} style={{
                  width: 28, height: 28, background: c,
                  border: cat.color === c ? '3px solid var(--cit-brick)' : '2px solid var(--cit-navy-dk)',
                  cursor: 'pointer', padding: 0,
                }}/>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
          {concepts.length >= 2 && (
            <CitButton tone="brick" style={{ width: '100%', justifyContent: 'center' }} onClick={onLaunchCombo}>
              ★ Combinaison avec cette étiquette
            </CitButton>
          )}
          {!editingName && (
            <CitButton style={{ width: '100%', justifyContent: 'center' }} onClick={() => setEditingName(true)}>
              ✎ Renommer l'étiquette
            </CitButton>
          )}
          <CitButton tone="navy" style={{ width: '100%', justifyContent: 'center' }} onClick={onDelete}>
            ✕ Supprimer l'étiquette
          </CitButton>
        </div>
      </div>
    </div>
  );
}

export function PersoScreen({ onTabChange }: Props) {
  const [view, setView] = useState<'categories' | 'tags'>('categories');
  const [cats, setCats] = useState<PersonalCategory[]>([]);
  const [tagUsage, setTagUsage] = useState<Array<{ tag: Tag; count: number }>>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [selectedConcepts, setSelectedConcepts] = useState<Concept[]>([]);
  const [conceptCounts, setConceptCounts] = useState<Record<string, number>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const toast = useToast();

  const loadAll = async () => {
    const [catList, tagList, adoptedList] = await Promise.all([getAllPersonalCategories(), getTagUsage(), getAdoptedConcepts()]);
    setCats(catList);
    setTagUsage(tagList);
    setAdopted(adoptedList);
    const counts: Record<string, number> = {};
    await Promise.all(catList.map(async c => {
      const arr = await getConceptsInPersonalCategory(c.id);
      counts[c.id] = arr.length;
    }));
    setConceptCounts(counts);
    if (catList.length > 0 && !selectedCatId) setSelectedCatId(catList[0].id);
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!selectedCatId) { setSelectedConcepts([]); return; }
    getConceptsInPersonalCategory(selectedCatId).then(setSelectedConcepts);
  }, [selectedCatId]);

  const selectedCat = cats.find(c => c.id === selectedCatId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.show({ tone: 'warning', title: 'Nom requis', body: 'Donnez un nom à l\'étiquette.' });
      return;
    }
    const cat = await createPersonalCategory(newName.trim(), newColor);
    toast.show({ tone: 'success', title: 'Étiquette créée', body: `« ${cat.name} » ajoutée à votre grammaire.` });
    setShowCreateForm(false); setNewName(''); setNewColor(PRESET_COLORS[0]);
    setSelectedCatId(cat.id);
    loadAll();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer définitivement l'étiquette « ${name} » ?`)) return;
    await deletePersonalCategory(id);
    toast.show({ tone: 'info', title: 'Étiquette supprimée', body: `« ${name} »` });
    setSelectedCatId(null);
    loadAll();
  };

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Votre"
        title={view === 'categories' ? 'ÉTIQUETTES' : 'TAGS'}
        active="favs"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>
            {view === 'categories' ? `${cats.length} ÉTIQUETTE${cats.length > 1 ? 'S' : ''}` : `${tagUsage.length} TAG${tagUsage.length > 1 ? 'S' : ''}`}
          </Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{ padding: '10px 32px', background: 'var(--cit-paper-dk)', borderBottom: '2px solid var(--cit-navy-dk)', display: 'flex', gap: 6, position: 'relative', zIndex: 3 }}>
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', alignSelf: 'center', marginRight: 8 }}>
          ★ VOTRE GRAMMAIRE PERSONNELLE ›
        </span>
        {[
          { id: 'categories' as const, label: 'Étiquettes', count: cats.length },
          { id: 'tags' as const,       label: 'Tags',       count: tagUsage.length },
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
                <CitButton tone="butter" onClick={() => setShowCreateForm(true)}>+ Créer une étiquette</CitButton>
              </div>

              {showCreateForm && (
                <CitPanel title="Nouvelle étiquette" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                    <div>
                      <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>NOM</div>
                      <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="thèse 2027, à lire un jour…" style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 12px',
                        border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-paper)',
                        fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)',
                        boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
                      }}/>
                    </div>
                    <div>
                      <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>COULEUR</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => setNewColor(c)} style={{
                            width: 30, height: 30, background: c,
                            border: newColor === c ? '3px solid var(--cit-brick)' : '2px solid var(--cit-navy-dk)',
                            cursor: 'pointer', padding: 0,
                          }}/>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <CitButton onClick={() => { setShowCreateForm(false); setNewName(''); }}>Annuler</CitButton>
                    <CitButton tone="brick" onClick={handleCreate}>★ Créer</CitButton>
                  </div>
                </CitPanel>
              )}

              {cats.length === 0 ? (
                <div style={{
                  padding: '60px 40px', textAlign: 'center',
                  background: 'var(--cit-cream)',
                  border: '3px dashed var(--cit-navy-dk)',
                  boxShadow: '5px 5px 0 var(--cit-navy-dk)',
                }}>
                  <h2 className="cit-h1" style={{ fontSize: 28 }}>Aucune étiquette pour l'instant</h2>
                  <p className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginTop: 8 }}>
                    Créez votre première étiquette pour organiser votre univers.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  {cats.map(c => (
                    <PersoCatTile
                      key={c.id} cat={c}
                      active={selectedCatId === c.id}
                      count={conceptCounts[c.id] ?? 0}
                      onClick={() => setSelectedCatId(c.id)}
                      onDropConcept={async (conceptId) => {
                        await assignConceptToPersonalCategory(conceptId, c.id);
                        const concept = adopted.find(a => a.id === conceptId);
                        toast.show({ tone: 'success', title: 'Concept rangé', body: `${concept?.name ?? 'Concept'} → « ${c.name} »` });
                        loadAll();
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Panneau de concepts adoptés à glisser */}
              {cats.length > 0 && adopted.length > 0 && (
                <CitPanel title="Glissez un concept sur une étiquette ↑" accent="cream" style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {adopted.map(c => (
                      <span key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/concept-id', c.id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px',
                          background: 'var(--cit-cream)',
                          border: '2px solid var(--cit-navy-dk)',
                          boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                          fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
                          letterSpacing: '.06em', color: 'var(--cit-navy-dk)',
                          cursor: 'grab',
                        }}>
                        ⠿ {c.name}
                      </span>
                    ))}
                  </div>
                </CitPanel>
              )}

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
                  ★ NUAGE DE TAGS · CRÉÉS DEPUIS LA FICHE DÉTAILLÉE D'UN CONCEPT
                </div>
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
                {tagUsage.length === 0 ? (
                  <div className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                    Aucun tag pour l'instant. Créez-en depuis la fiche d'un concept (modal détail).
                  </div>
                ) : tagUsage.filter(t => t.count > 0).map(({ tag, count }) => {
                  const fontSize = Math.min(34, 12 + count * 2);
                  return (
                    <button key={tag.id} onClick={async () => {
                      const links = await db.conceptTags.where('tagId').equals(tag.id).toArray();
                      const cs = await Promise.all(links.map(l => db.concepts.get(l.conceptId)));
                      const valid = cs.filter((c): c is Concept => !!c);
                      if (valid.length < 2) {
                        toast.show({ tone: 'warning', title: 'Pas assez de concepts', body: `Le tag #${tag.name} a moins de 2 concepts.` });
                        return;
                      }
                      setPendingConcepts(valid);
                      onTabChange?.('combine');
                    }} title={`Combinaison avec #${tag.name}`} style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 6,
                      padding: '4px 10px',
                      background: 'var(--cit-paper)',
                      border: '2.5px solid var(--cit-navy-dk)',
                      borderLeft: `8px solid ${tag.color ?? 'var(--cit-navy-dk)'}`,
                      fontFamily: "'Alfa Slab One', serif",
                      fontSize, lineHeight: 1,
                      color: 'var(--cit-navy-dk)',
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 var(--cit-navy-dk)',
                      position: 'relative', zIndex: 1,
                    }}>
                      #{tag.name}
                      <span style={{
                        fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                        color: 'var(--cit-brick)', letterSpacing: '.1em',
                      }}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <CitPanel title="À quoi servent les tags ?" accent="butter" style={{ marginTop: 22 }}>
                <p className="cit-typed" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                  Les <strong>tags</strong> sont des étiquettes <strong>légères</strong> : un concept peut en avoir plusieurs sans coût.
                  Créez-les depuis la fiche détaillée de n'importe quel concept (bouton ★ Voir la fiche complète).
                </p>
              </CitPanel>
            </>
          )}
        </div>

        {view === 'categories' && selectedCat && (
          <CategoryDetailPanel
            cat={selectedCat}
            concepts={selectedConcepts}
            onClose={() => setSelectedCatId(null)}
            onDelete={() => handleDelete(selectedCat.id, selectedCat.name)}
            onLaunchCombo={() => {
              setPendingConcepts(selectedConcepts);
              onTabChange?.('combine');
            }}
            onRename={async (newName) => {
              if (!newName.trim() || newName === selectedCat.name) return;
              await updatePersonalCategory(selectedCat.id, { name: newName.trim() });
              toast.show({ tone: 'success', title: 'Étiquette renommée' });
              loadAll();
            }}
            onChangeColor={async (newColor) => {
              await updatePersonalCategory(selectedCat.id, { color: newColor });
              toast.show({ tone: 'success', title: 'Couleur mise à jour' });
              loadAll();
            }}
          />
        )}
      </div>

      <CitizenFooter right="★ ORGANISEZ VOTRE UNIVERS À VOTRE GUISE"/>
    </div>
  );
}
