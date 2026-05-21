import Dexie, { type Table } from 'dexie';
import type {
  Concept, Interaction, UserProfile, AppSettings, SwipeVerdict,
  Tag, ConceptTag, PersonalCategory, ConceptPersonalCategory,
  Annotation, SavedCombination, Idea,
  SavedConstraint, DeepDiveRecord, ConceptLink,
} from '../types';

export class ConstellationDB extends Dexie {
  concepts!: Table<Concept>;
  interactions!: Table<Interaction>;
  profile!: Table<UserProfile>;
  settings!: Table<AppSettings>;
  tags!: Table<Tag>;
  conceptTags!: Table<ConceptTag>;
  personalCategories!: Table<PersonalCategory>;
  conceptPersonalCategories!: Table<ConceptPersonalCategory>;
  annotations!: Table<Annotation>;
  combinations!: Table<SavedCombination>;
  ideas!: Table<Idea>;
  constraints!: Table<SavedConstraint>;
  deepDives!: Table<DeepDiveRecord>;
  cacheLlm!: Table<{ hash: string; response: string; createdAt: Date }>;
  cacheWiki!: Table<{ key: string; data: unknown; createdAt: Date }>;
  links!: Table<ConceptLink>;
  embeddings!: Table<{ id: string; vec: number[]; createdAt: Date }>;

  constructor() {
    super('ConstellationDB');
    this.version(1).stores({
      concepts:     'id, wikidataId, name, *cats, createdAt',
      interactions: '++id, conceptId, verdict, timestamp, sessionId',
      profile:      '++id',
      settings:     '++id',
    });
    this.version(2).stores({
      concepts:     'id, wikidataId, name, *cats, isFavorite, createdAt',
      interactions: '++id, conceptId, verdict, timestamp, sessionId',
      profile:      '++id',
      settings:     '++id',
      tags:                       'id, name, createdAt',
      conceptTags:                '++id, conceptId, tagId, [conceptId+tagId]',
      personalCategories:         'id, name, createdAt',
      conceptPersonalCategories:  '++id, conceptId, categoryId, [conceptId+categoryId]',
      annotations:                '++id, conceptId, updatedAt',
      combinations:               'id, name, createdAt, lastUsedAt, isFavorite, status',
      ideas:                      'id, title, status, combinationId, isFavorite, createdAt',
    });
    this.version(3).stores({
      constraints: 'id, text, useCount, isFavorite, firstUsedAt',
      deepDives:   'id, ideaId, createdAt',
      cacheLlm:    'hash, createdAt',
      cacheWiki:   'key, createdAt',
    });
    this.version(4).stores({
      links: 'id, conceptAId, conceptBId, type, [conceptAId+conceptBId]',
    });
    this.version(5).stores({
      // Cache des embeddings sémantiques (all-MiniLM-L6-v2, 384 dims) par concept.
      embeddings: 'id, createdAt',
    });
    // ⚠ Stratégie de migration : chaque nouvelle version doit UNIQUEMENT
    // AJOUTER des tables ou des index. Ne jamais retirer/renommer une table
    // existante sans fonction `.upgrade()` explicite qui migre les données,
    // sinon perte garantie pour les utilisateurs sur l'ancienne version.
    // Dexie conserve automatiquement les données des tables inchangées.
  }
}

export const db = new ConstellationDB();

// Multi-onglets : si une autre tab upgrade le schéma, on ferme proprement
// cette instance pour ne pas bloquer la migration, puis on recharge.
if (typeof window !== 'undefined') {
  db.on('versionchange', () => {
    db.close();
    location.reload();
  });
  db.on('blocked', () => {
    console.warn('[Constellation] Migration DB bloquée par un autre onglet ouvert.');
  });
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

// ---- profile ----

export async function getProfile(): Promise<UserProfile | undefined> {
  return db.profile.toCollection().first();
}

export async function saveProfile(p: Partial<UserProfile>): Promise<void> {
  const existing = await getProfile();
  if (existing?.id != null) {
    await db.profile.update(existing.id, { ...p, updatedAt: new Date() });
  } else {
    await db.profile.add({
      onboardingDone: false,
      onboardingVerdicts: [],
      seedConcepts: [],
      categoryWeights: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...p,
    });
  }
}

// ---- settings ----

export async function getSettings(): Promise<AppSettings | undefined> {
  return db.settings.toCollection().first();
}

export async function saveSettings(s: Partial<AppSettings>): Promise<void> {
  const existing = await getSettings();
  if (existing?.id != null) {
    await db.settings.update(existing.id, s);
  } else {
    await db.settings.add({ theme: 'phosphore', swipeMode: 'random', ...s });
  }
}

// ---- persistance des filtres d'écran (#23) ----

export async function getFilterState<T = unknown>(key: string): Promise<T | undefined> {
  const s = await getSettings();
  return (s?.savedFilters as Record<string, T> | undefined)?.[key];
}

export async function setFilterState(key: string, value: unknown): Promise<void> {
  const s = await getSettings();
  await saveSettings({ savedFilters: { ...(s?.savedFilters ?? {}), [key]: value } });
}

// ---- recherche plein-texte locale (#32) : concepts + annotations + idées ----

export interface LocalSearchHit {
  kind: 'concept' | 'annotation' | 'idea';
  id: string;        // conceptId (concept/annotation) ou ideaId
  title: string;
  snippet: string;
}

function snippetAround(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text.slice(0, 140);
  return (idx > 40 ? '…' : '') + text.slice(Math.max(0, idx - 40), idx + 100).trim();
}

export async function searchLocal(query: string): Promise<LocalSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const [concepts, anns, ideas] = await Promise.all([
    db.concepts.toArray(),
    db.annotations.toArray(),
    db.ideas.toArray(),
  ]);
  const nameById = new Map(concepts.map(c => [c.id, c.name]));
  const hits: LocalSearchHit[] = [];
  concepts.forEach(c => {
    if (`${c.name} ${c.blurb} ${c.kind}`.toLowerCase().includes(q)) {
      hits.push({ kind: 'concept', id: c.id, title: c.name, snippet: c.blurb.slice(0, 140) });
    }
  });
  anns.forEach(a => {
    if (a.markdown.toLowerCase().includes(q)) {
      hits.push({ kind: 'annotation', id: a.conceptId, title: `Note · ${nameById.get(a.conceptId) ?? a.conceptId}`, snippet: snippetAround(a.markdown, q) });
    }
  });
  ideas.forEach(i => {
    const hay = `${i.title} ${i.content} ${i.notes} ${i.tags.join(' ')}`;
    if (hay.toLowerCase().includes(q)) {
      hits.push({ kind: 'idea', id: i.id, title: i.title, snippet: snippetAround(`${i.content} ${i.notes}`.trim(), q) });
    }
  });
  return hits.slice(0, 60);
}

// ---- interactions ----

export async function recordInteraction(
  conceptId: string,
  verdict: SwipeVerdict,
  sessionId: string,
): Promise<void> {
  await db.interactions.add({ conceptId, verdict, timestamp: new Date(), sessionId });
}

/** Verdict actuel d'un concept (le plus récent). */
export async function getCurrentVerdict(conceptId: string): Promise<SwipeVerdict | null> {
  const arr = await db.interactions.where('conceptId').equals(conceptId).toArray();
  if (arr.length === 0) return null;
  arr.sort((a, b) => +b.timestamp - +a.timestamp);
  return arr[0].verdict;
}

/** Réhabilite un concept rejeté (efface ses verdicts pour le remettre en circulation). */
export async function giveSecondChance(conceptId: string): Promise<void> {
  await db.interactions.where('conceptId').equals(conceptId).delete();
}

// ---- concepts ----

/**
 * Met en cache un concept en évitant les doublons.
 * Dédup par `wikidataId` si présent, sinon par nom normalisé (concepts manuels/proches).
 * Retourne l'id canonique réellement utilisé (existant ou nouveau) — les appelants
 * doivent l'utiliser pour `recordInteraction`.
 */
export async function cacheConcept(concept: Concept): Promise<string> {
  let canonical: Concept | undefined;

  if (concept.wikidataId) {
    canonical = await db.concepts.where('wikidataId').equals(concept.wikidataId).first();
  }
  if (!canonical && !concept.wikidataId) {
    const norm = concept.name.trim().toLowerCase();
    canonical = (await db.concepts.toArray())
      .find(c => !c.wikidataId && c.name.trim().toLowerCase() === norm);
  }

  if (canonical && canonical.id !== concept.id) {
    // Fusion : on garde l'id existant, on préserve favori + blurbLong déjà acquis
    await db.concepts.update(canonical.id, {
      ...concept,
      id: canonical.id,
      isFavorite: canonical.isFavorite || concept.isFavorite,
      blurbLong: concept.blurbLong ?? canonical.blurbLong,
      createdAt: canonical.createdAt ?? concept.createdAt,
    });
    return canonical.id;
  }

  const existing = await db.concepts.get(concept.id);
  // Re-cacher un concept ne doit jamais perdre le favori, le blurb long acquis,
  // ni écraser la date de première rencontre.
  await db.concepts.put({
    ...existing,
    ...concept,
    isFavorite: existing?.isFavorite || concept.isFavorite,
    blurbLong: concept.blurbLong ?? existing?.blurbLong,
    createdAt: existing?.createdAt ?? concept.createdAt,
  });
  return concept.id;
}

/** Persiste le concept ET enregistre le verdict dans une transaction atomique. */
export async function recordVerdict(concept: Concept, verdict: SwipeVerdict, sessionId: string): Promise<string> {
  return db.transaction('rw', db.concepts, db.interactions, async () => {
    const id = await cacheConcept(concept);
    await db.interactions.add({ conceptId: id, verdict, timestamp: new Date(), sessionId });
    return id;
  });
}

export async function getCachedConcept(id: string): Promise<Concept | undefined> {
  return db.concepts.get(id);
}

export async function toggleFavorite(conceptId: string): Promise<boolean> {
  const c = await db.concepts.get(conceptId);
  if (!c) return false;
  const next = !c.isFavorite;
  await db.concepts.update(conceptId, { isFavorite: next });
  return next;
}

/** Concepts adoptés (verdict='valid') de l'utilisateur, plus récents d'abord. */
export async function getAdoptedConcepts(): Promise<Concept[]> {
  const valid = await db.interactions.where('verdict').equals('valid').toArray();
  const seen = new Set<string>();
  const ids: string[] = [];
  valid.sort((a, b) => +b.timestamp - +a.timestamp).forEach(i => {
    if (!seen.has(i.conceptId)) { seen.add(i.conceptId); ids.push(i.conceptId); }
  });
  const concepts = await Promise.all(ids.map(id => db.concepts.get(id)));
  return concepts.filter((c): c is Concept => !!c);
}

/** Concepts favoris uniquement. */
export async function getFavoriteConcepts(): Promise<Concept[]> {
  return db.concepts.filter(c => c.isFavorite === true).toArray();
}

/** Concepts par verdict (valid/reject/skip). */
export async function getConceptsByVerdict(verdict: SwipeVerdict): Promise<Concept[]> {
  const ints = await db.interactions.where('verdict').equals(verdict).toArray();
  const seen = new Set<string>();
  const ids: string[] = [];
  ints.sort((a, b) => +b.timestamp - +a.timestamp).forEach(i => {
    if (!seen.has(i.conceptId)) { seen.add(i.conceptId); ids.push(i.conceptId); }
  });
  const concepts = await Promise.all(ids.map(id => db.concepts.get(id)));
  return concepts.filter((c): c is Concept => !!c);
}

/** Toutes les interactions, plus récentes d'abord. */
export async function getAllInteractions(): Promise<Interaction[]> {
  return (await db.interactions.toArray()).sort((a, b) => +b.timestamp - +a.timestamp);
}

/** IDs des concepts à exclure du tirage : adoptés, rejetés, ou passés depuis < N jours. Délai lu depuis settings. */
export async function getExcludedConceptIds(skipDelayDaysOverride?: number): Promise<Set<string>> {
  const settings = await getSettings();
  const skipDelayDays = skipDelayDaysOverride ?? settings?.skipDelayDays ?? 30;
  const ints = await db.interactions.toArray();
  const excluded = new Set<string>();
  const now = Date.now();
  const skipMs = skipDelayDays * 24 * 60 * 60 * 1000;

  // Most recent verdict per concept
  const latest = new Map<string, Interaction>();
  ints.forEach(i => {
    const prev = latest.get(i.conceptId);
    if (!prev || +i.timestamp > +prev.timestamp) latest.set(i.conceptId, i);
  });

  for (const i of latest.values()) {
    if (i.verdict === 'valid' || i.verdict === 'reject') excluded.add(i.conceptId);
    else if (i.verdict === 'skip' && (now - +i.timestamp) < skipMs) excluded.add(i.conceptId);
  }
  return excluded;
}

/** Crée un concept libre (manuel) saisi par l'utilisateur. */
export async function createFreeConcept(data: {
  name: string; blurb: string; cats: Concept['cats']; kind?: string; portrait?: string;
}): Promise<Concept> {
  const c: Concept = {
    id: `manual-${uid()}`,
    name: data.name,
    blurb: data.blurb,
    cats: data.cats,
    kind: data.kind ?? 'Concept libre',
    portrait: data.portrait,
    refs: [],
    sourceKind: 'random',
    sourceTag: 'manuel',
    isManual: true,
    createdAt: new Date(),
  };
  // cacheConcept dédoublonne par nom (concept libre sans wikidataId)
  const id = await cacheConcept(c);
  return { ...c, id };
}

// ---- tags ----

export async function createTag(name: string, color?: string): Promise<Tag> {
  const t: Tag = { id: uid(), name, color, createdAt: new Date() };
  await db.tags.put(t);
  return t;
}

export async function getAllTags(): Promise<Tag[]> {
  return db.tags.toArray();
}

export async function getTagsForConcept(conceptId: string): Promise<Tag[]> {
  const links = await db.conceptTags.where('conceptId').equals(conceptId).toArray();
  const tags = await Promise.all(links.map(l => db.tags.get(l.tagId)));
  return tags.filter((t): t is Tag => !!t);
}

export async function addTagToConcept(conceptId: string, tagName: string): Promise<Tag> {
  let tag = (await db.tags.toArray()).find(t => t.name.toLowerCase() === tagName.toLowerCase());
  if (!tag) tag = await createTag(tagName);
  const existing = await db.conceptTags.where(['conceptId', 'tagId']).equals([conceptId, tag.id]).first();
  if (!existing) await db.conceptTags.add({ conceptId, tagId: tag.id });
  return tag;
}

export async function removeTagFromConcept(conceptId: string, tagId: string): Promise<void> {
  await db.conceptTags.where(['conceptId', 'tagId']).equals([conceptId, tagId]).delete();
}

/** Compte d'usage des tags (nombre de concepts associés). */
export async function getTagUsage(): Promise<Array<{ tag: Tag; count: number }>> {
  const tags = await db.tags.toArray();
  const links = await db.conceptTags.toArray();
  return tags.map(tag => ({ tag, count: links.filter(l => l.tagId === tag.id).length }));
}

// ---- personal categories ----

export async function createPersonalCategory(name: string, color: string): Promise<PersonalCategory> {
  const c: PersonalCategory = { id: uid(), name, color, createdAt: new Date() };
  await db.personalCategories.put(c);
  return c;
}

export async function deletePersonalCategory(id: string): Promise<void> {
  await db.personalCategories.delete(id);
  await db.conceptPersonalCategories.where('categoryId').equals(id).delete();
}

export async function updatePersonalCategory(id: string, updates: Partial<PersonalCategory>): Promise<void> {
  await db.personalCategories.update(id, updates);
}

export async function getAllPersonalCategories(): Promise<PersonalCategory[]> {
  return db.personalCategories.toArray();
}

export async function getConceptsInPersonalCategory(categoryId: string): Promise<Concept[]> {
  const links = await db.conceptPersonalCategories.where('categoryId').equals(categoryId).toArray();
  const concepts = await Promise.all(links.map(l => db.concepts.get(l.conceptId)));
  return concepts.filter((c): c is Concept => !!c);
}

export async function assignConceptToPersonalCategory(conceptId: string, categoryId: string): Promise<void> {
  const existing = await db.conceptPersonalCategories.where(['conceptId', 'categoryId']).equals([conceptId, categoryId]).first();
  if (!existing) await db.conceptPersonalCategories.add({ conceptId, categoryId });
}

export async function removeConceptFromPersonalCategory(conceptId: string, categoryId: string): Promise<void> {
  await db.conceptPersonalCategories.where(['conceptId', 'categoryId']).equals([conceptId, categoryId]).delete();
}

// ---- annotations ----

export async function getAnnotation(conceptId: string): Promise<Annotation | undefined> {
  return db.annotations.where('conceptId').equals(conceptId).first();
}

export async function saveAnnotation(conceptId: string, markdown: string): Promise<void> {
  const existing = await getAnnotation(conceptId);
  if (existing?.id != null) {
    // Snapshot dans l'historique si différence significative et > 5 min depuis dernière save
    const now = Date.now();
    const lastUpdate = +existing.updatedAt;
    const sigDiff = Math.abs((existing.markdown ?? '').length - markdown.length) > 50;
    const enoughTime = now - lastUpdate > 5 * 60 * 1000;
    if (sigDiff && enoughTime && existing.markdown.trim() !== '') {
      const history = [...(existing.history ?? []), { markdown: existing.markdown, at: existing.updatedAt }].slice(-10);
      await db.annotations.update(existing.id, { markdown, updatedAt: new Date(), history });
    } else {
      await db.annotations.update(existing.id, { markdown, updatedAt: new Date() });
    }
  } else {
    await db.annotations.add({ conceptId, markdown, createdAt: new Date(), updatedAt: new Date(), history: [] });
  }
}

// ---- combinations ----

export async function saveCombination(c: Pick<SavedCombination, 'name' | 'items' | 'constraints' | 'mixOklch'> & Partial<Pick<SavedCombination, 'id' | 'isFavorite' | 'status'>>): Promise<SavedCombination> {
  const now = new Date();
  const combo: SavedCombination = {
    id: c.id ?? uid(),
    name: c.name,
    items: c.items,
    constraints: c.constraints,
    mixOklch: c.mixOklch,
    isFavorite: c.isFavorite ?? false,
    status: c.status ?? 'active',
    createdAt: now,
    lastUsedAt: now,
    ideasGeneratedCount: 0,
  };
  await db.combinations.put(combo);
  // Record each constraint usage
  for (const cn of combo.constraints) {
    try { await recordConstraintUsage(cn); } catch { /* ignore */ }
  }
  return combo;
}

export async function getAllCombinations(): Promise<SavedCombination[]> {
  return (await db.combinations.toArray()).sort((a, b) => +b.createdAt - +a.createdAt);
}

export async function deleteCombination(id: string): Promise<void> {
  await db.combinations.delete(id);
}

/** Ré-insère une combinaison telle quelle (annulation de suppression). */
export async function restoreCombination(combo: SavedCombination): Promise<void> {
  await db.combinations.put(combo);
}

export async function updateCombination(id: string, updates: Partial<SavedCombination>): Promise<void> {
  await db.combinations.update(id, updates);
}

export async function duplicateCombination(id: string): Promise<SavedCombination | null> {
  const original = await db.combinations.get(id);
  if (!original) return null;
  const copy: SavedCombination = {
    ...original,
    id: uid(),
    name: `${original.name} (copie)`,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    ideasGeneratedCount: 0,
  };
  await db.combinations.put(copy);
  return copy;
}

export async function incrementCombinationIdeasCount(id: string, count: number): Promise<void> {
  const c = await db.combinations.get(id);
  if (!c) return;
  await db.combinations.update(id, {
    ideasGeneratedCount: c.ideasGeneratedCount + count,
    lastUsedAt: new Date(),
  });
}

// ---- ideas ----

export async function saveIdea(i: Omit<Idea, 'id' | 'createdAt' | 'updatedAt' | 'isFavorite' | 'status' | 'notes' | 'tags'> & Partial<Pick<Idea, 'id' | 'isFavorite' | 'status' | 'notes' | 'tags'>>): Promise<Idea> {
  const now = new Date();
  const idea: Idea = {
    id: i.id ?? uid(),
    title: i.title,
    content: i.content,
    conceptIdsWithWeights: i.conceptIdsWithWeights,
    outputType: i.outputType,
    constraints: i.constraints,
    inheritedOklch: i.inheritedOklch,
    combinationId: i.combinationId,
    status: i.status ?? 'new',
    notes: i.notes ?? '',
    tags: i.tags ?? [],
    isFavorite: i.isFavorite ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await db.ideas.put(idea);
  return idea;
}

export async function updateIdea(id: string, updates: Partial<Idea>): Promise<void> {
  await db.ideas.update(id, { ...updates, updatedAt: new Date() });
}

export async function getAllIdeas(): Promise<Idea[]> {
  return (await db.ideas.toArray()).sort((a, b) => +b.createdAt - +a.createdAt);
}

export async function deleteIdea(id: string): Promise<void> {
  await db.ideas.delete(id);
}

/** Ré-insère une idée telle quelle (annulation de suppression). */
export async function restoreIdea(idea: Idea): Promise<void> {
  await db.ideas.put(idea);
}

// ---- constraints (bibliothèque) ----

const CONSTRAINT_WIKIDATA_MAP: Record<string, string> = {
  'auteurs':       'Q482980',
  'écrivains':     'Q36180',
  'philosophes':   'Q4964182',
  'films':         'Q11424',
  'livres':        'Q571',
  'œuvres':        'Q386724',
  'courants':      'Q179805',
  'lieux':         'Q17334923',
  'personnes':     'Q5',
  'théoriciens':   'Q3242115',
};

/** Trouve un Q-ID Wikidata pour une contrainte texte (fuzzy lookup). */
function findWikidataMapping(text: string): string | undefined {
  const norm = text.toLowerCase().trim();
  if (CONSTRAINT_WIKIDATA_MAP[norm]) return CONSTRAINT_WIKIDATA_MAP[norm];
  // fuzzy match
  for (const [k, qid] of Object.entries(CONSTRAINT_WIKIDATA_MAP)) {
    if (norm.includes(k) || k.includes(norm)) return qid;
  }
  return undefined;
}

/** Enregistre l'usage d'une contrainte (crée ou incrémente compteur). */
export async function recordConstraintUsage(text: string): Promise<SavedConstraint> {
  const norm = text.trim();
  if (!norm) throw new Error('empty constraint');
  const existing = (await db.constraints.toArray()).find(c => c.text.toLowerCase() === norm.toLowerCase());
  if (existing) {
    await db.constraints.update(existing.id, { useCount: existing.useCount + 1 });
    return { ...existing, useCount: existing.useCount + 1 };
  }
  const c: SavedConstraint = {
    id: uid(),
    text: norm,
    firstUsedAt: new Date(),
    useCount: 1,
    isFavorite: false,
    mappedQid: findWikidataMapping(norm),
  };
  await db.constraints.put(c);
  return c;
}

export async function getAllConstraints(): Promise<SavedConstraint[]> {
  return (await db.constraints.toArray()).sort((a, b) => b.useCount - a.useCount);
}

export async function toggleConstraintFavorite(id: string): Promise<void> {
  const c = await db.constraints.get(id);
  if (!c) return;
  await db.constraints.update(id, { isFavorite: !c.isFavorite });
}

export async function deleteConstraint(id: string): Promise<void> {
  await db.constraints.delete(id);
}

// ---- deep dives ----

export async function saveDeepDive(d: Omit<DeepDiveRecord, 'id' | 'createdAt'>): Promise<DeepDiveRecord> {
  const dd: DeepDiveRecord = { ...d, id: uid(), createdAt: new Date() };
  await db.deepDives.put(dd);
  return dd;
}

export async function getDeepDivesForIdea(ideaId: string): Promise<DeepDiveRecord[]> {
  return (await db.deepDives.where('ideaId').equals(ideaId).toArray()).sort((a, b) => +b.createdAt - +a.createdAt);
}

// ---- caches (TTL 7-30 jours) ----

const WIKI_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LLM_TTL_MS  =  7 * 24 * 60 * 60 * 1000;

async function simpleHash(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return String(h);
}

export async function cacheLlmGet(prompt: string): Promise<string | null> {
  const hash = await simpleHash(prompt);
  const entry = await db.cacheLlm.get(hash);
  if (!entry) return null;
  if (Date.now() - +entry.createdAt > LLM_TTL_MS) {
    await db.cacheLlm.delete(hash);
    return null;
  }
  return entry.response;
}

export async function cacheLlmSet(prompt: string, response: string): Promise<void> {
  const hash = await simpleHash(prompt);
  await db.cacheLlm.put({ hash, response, createdAt: new Date() });
}

export async function cacheWikiGet<T = unknown>(key: string): Promise<T | null> {
  const entry = await db.cacheWiki.get(key);
  if (!entry) return null;
  if (Date.now() - +entry.createdAt > WIKI_TTL_MS) {
    await db.cacheWiki.delete(key);
    return null;
  }
  return entry.data as T;
}

export async function cacheWikiSet<T>(key: string, data: T): Promise<void> {
  await db.cacheWiki.put({ key, data, createdAt: new Date() });
}

// ---- embeddings sémantiques (cache permanent par concept) ----

export async function getEmbedding(id: string): Promise<number[] | null> {
  const e = await db.embeddings.get(id);
  return e?.vec ?? null;
}

export async function getEmbeddings(ids: string[]): Promise<Map<string, number[]>> {
  const rows = await db.embeddings.bulkGet(ids);
  const out = new Map<string, number[]>();
  rows.forEach((r, i) => { if (r) out.set(ids[i], r.vec); });
  return out;
}

export async function putEmbedding(id: string, vec: number[]): Promise<void> {
  await db.embeddings.put({ id, vec, createdAt: new Date() });
}

// ---- liens manuels ----

export async function createLink(conceptAId: string, conceptBId: string, opts?: { type?: ConceptLink['type']; strength?: number; note?: string }): Promise<ConceptLink> {
  // Évite les doublons (peu importe l'ordre des deux concepts)
  const existing = await db.links
    .where('[conceptAId+conceptBId]').equals([conceptAId, conceptBId])
    .or('[conceptAId+conceptBId]').equals([conceptBId, conceptAId])
    .first();
  if (existing) return existing;
  const link: ConceptLink = {
    id: uid(),
    conceptAId, conceptBId,
    type: opts?.type ?? 'manual',
    strength: opts?.strength ?? 2,
    note: opts?.note,
    createdAt: new Date(),
  };
  await db.links.put(link);
  return link;
}

export async function deleteLink(id: string): Promise<void> {
  await db.links.delete(id);
}

export async function updateLinkNote(id: string, note: string): Promise<void> {
  await db.links.update(id, { note });
}

export async function getAllLinks(): Promise<ConceptLink[]> {
  return db.links.toArray();
}

export async function getLinksForConcept(conceptId: string): Promise<ConceptLink[]> {
  return db.links
    .where('conceptAId').equals(conceptId)
    .or('conceptBId').equals(conceptId)
    .toArray();
}

// ---- CSV export ----

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const json = JSON.stringify(v);
    return `"${json.replace(/"/g, '""')}"`;
  }
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => escapeCsv(r[k])).join(','));
  return `${header}\n${lines.join('\n')}`;
}

/** Exporte chaque table Dexie en CSV — déclenche un download par table non vide. */
export async function exportAllAsCsv(): Promise<{ tableName: string; rows: number }[]> {
  const tables: Array<[string, () => Promise<unknown[]>]> = [
    ['concepts',                   () => db.concepts.toArray()],
    ['interactions',               () => db.interactions.toArray()],
    ['tags',                       () => db.tags.toArray()],
    ['conceptTags',                () => db.conceptTags.toArray()],
    ['personalCategories',         () => db.personalCategories.toArray()],
    ['conceptPersonalCategories',  () => db.conceptPersonalCategories.toArray()],
    ['annotations',                () => db.annotations.toArray()],
    ['combinations',               () => db.combinations.toArray()],
    ['ideas',                      () => db.ideas.toArray()],
    ['constraints',                () => db.constraints.toArray()],
    ['deepDives',                  () => db.deepDives.toArray()],
  ];
  const results: { tableName: string; rows: number }[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const [name, fetcher] of tables) {
    const rows = (await fetcher()) as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `constellation-${name}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    results.push({ tableName: name, rows: rows.length });
    // Petit délai pour éviter que le navigateur n'ignore les downloads multiples
    await new Promise(r => setTimeout(r, 120));
  }
  return results;
}

// ---- Maintenance : GC orphelins + caches expirés ----

/** Supprime les tags sans aucune association concept (auto-créés puis tous retirés). */
export async function cleanupOrphanTags(): Promise<number> {
  const [tags, links] = await Promise.all([db.tags.toArray(), db.conceptTags.toArray()]);
  const usedTagIds = new Set(links.map(l => l.tagId));
  const orphans = tags.filter(t => !usedTagIds.has(t.id));
  if (orphans.length) await db.tags.bulkDelete(orphans.map(t => t.id));
  return orphans.length;
}

/** Supprime les liens et associations qui pointent vers des concepts inexistants. */
export async function cleanupDanglingRefs(): Promise<number> {
  const conceptIds = new Set((await db.concepts.toArray()).map(c => c.id));
  let removed = 0;

  const links = await db.links.toArray();
  const deadLinks = links.filter(l => !conceptIds.has(l.conceptAId) || !conceptIds.has(l.conceptBId));
  if (deadLinks.length) { await db.links.bulkDelete(deadLinks.map(l => l.id)); removed += deadLinks.length; }

  const ctLinks = await db.conceptTags.toArray();
  const deadCt = ctLinks.filter(l => !conceptIds.has(l.conceptId)).map(l => l.id).filter((id): id is number => id != null);
  if (deadCt.length) { await db.conceptTags.bulkDelete(deadCt); removed += deadCt.length; }

  const cpcLinks = await db.conceptPersonalCategories.toArray();
  const deadCpc = cpcLinks.filter(l => !conceptIds.has(l.conceptId)).map(l => l.id).filter((id): id is number => id != null);
  if (deadCpc.length) { await db.conceptPersonalCategories.bulkDelete(deadCpc); removed += deadCpc.length; }

  return removed;
}

/** Supprime les entrées de cache expirées (au-delà du TTL). */
export async function cleanupExpiredCaches(): Promise<number> {
  const now = Date.now();
  let removed = 0;

  const llm = await db.cacheLlm.toArray();
  const deadLlm = llm.filter(e => now - +e.createdAt > LLM_TTL_MS).map(e => e.hash);
  if (deadLlm.length) { await db.cacheLlm.bulkDelete(deadLlm); removed += deadLlm.length; }

  const wiki = await db.cacheWiki.toArray();
  const deadWiki = wiki.filter(e => now - +e.createdAt > WIKI_TTL_MS).map(e => e.key);
  if (deadWiki.length) { await db.cacheWiki.bulkDelete(deadWiki); removed += deadWiki.length; }

  return removed;
}

/** Maintenance au démarrage : best-effort, ne bloque jamais le boot. */
export async function runMaintenance(): Promise<void> {
  try {
    await Promise.all([
      cleanupExpiredCaches(),
      cleanupOrphanTags(),
      cleanupDanglingRefs(),
    ]);
  } catch {
    // best-effort : on n'empêche pas l'app de démarrer si une passe échoue
  }
}

// ---- Import JSON validé ----

const KNOWN_TABLES = [
  'concepts', 'interactions', 'profile', 'settings',
  'tags', 'conceptTags', 'personalCategories', 'conceptPersonalCategories',
  'annotations', 'combinations', 'ideas', 'constraints', 'deepDives', 'links',
] as const;

export interface ImportReport {
  ok: boolean;
  error?: string;
  imported: Array<{ table: string; rows: number }>;
  skipped: string[];
}

/**
 * Valide puis importe un dump JSON. Vérifie :
 * - que c'est un objet
 * - que chaque clé est une table connue (sinon ignorée)
 * - que chaque valeur est un tableau d'objets
 * - que les rows critiques (concepts) ont au minimum un `id`
 * N'écrase la base QUE si la validation passe entièrement.
 */
export async function importFromJson(raw: string): Promise<ImportReport> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Fichier JSON invalide (parsing impossible).', imported: [], skipped: [] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'Le fichier doit être un objet { table: [...] }.', imported: [], skipped: [] };
  }

  const obj = data as Record<string, unknown>;
  const skipped: string[] = [];
  const plan: Array<{ table: string; rows: Record<string, unknown>[] }> = [];

  for (const [key, value] of Object.entries(obj)) {
    if (!(KNOWN_TABLES as readonly string[]).includes(key)) { skipped.push(key); continue; }
    if (!Array.isArray(value)) {
      return { ok: false, error: `La table « ${key} » doit être un tableau.`, imported: [], skipped };
    }
    const rows = value as unknown[];
    if (rows.some(r => typeof r !== 'object' || r === null)) {
      return { ok: false, error: `La table « ${key} » contient des entrées non valides.`, imported: [], skipped };
    }
    if (key === 'concepts' && rows.some(r => !(r as Record<string, unknown>).id)) {
      return { ok: false, error: 'Certains concepts n\'ont pas d\'id — fichier corrompu.', imported: [], skipped };
    }
    plan.push({ table: key, rows: rows as Record<string, unknown>[] });
  }

  if (plan.length === 0) {
    return { ok: false, error: 'Aucune table reconnue dans le fichier.', imported: [], skipped };
  }

  // Validation passée → écrasement transactionnel
  const imported: Array<{ table: string; rows: number }> = [];
  try {
    for (const { table, rows } of plan) {
      const t = (db as unknown as Record<string, Table>)[table];
      if (!t) continue;
      await t.clear();
      if (rows.length) await t.bulkPut(rows);
      imported.push({ table, rows: rows.length });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur d\'écriture en base.', imported, skipped };
  }
  return { ok: true, imported, skipped };
}
