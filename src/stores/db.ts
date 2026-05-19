import Dexie, { type Table } from 'dexie';
import type {
  Concept, Interaction, UserProfile, AppSettings, SwipeVerdict,
  Tag, ConceptTag, PersonalCategory, ConceptPersonalCategory,
  Annotation, SavedCombination, Idea,
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
  }
}

export const db = new ConstellationDB();

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

export async function cacheConcept(concept: Concept): Promise<void> {
  const existing = await db.concepts.get(concept.id);
  await db.concepts.put({ ...existing, ...concept });
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

/** IDs des concepts à exclure du tirage : adoptés, rejetés, ou passés depuis < 30 jours. */
export async function getExcludedConceptIds(skipDelayDays = 30): Promise<Set<string>> {
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
  await db.concepts.put(c);
  return c;
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
    await db.annotations.update(existing.id, { markdown, updatedAt: new Date() });
  } else {
    await db.annotations.add({ conceptId, markdown, createdAt: new Date(), updatedAt: new Date() });
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
  return combo;
}

export async function getAllCombinations(): Promise<SavedCombination[]> {
  return (await db.combinations.toArray()).sort((a, b) => +b.createdAt - +a.createdAt);
}

export async function deleteCombination(id: string): Promise<void> {
  await db.combinations.delete(id);
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
