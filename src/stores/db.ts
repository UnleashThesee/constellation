import Dexie, { type Table } from 'dexie';
import type { Concept, Interaction, UserProfile, AppSettings } from '../types';

export class ConstellationDB extends Dexie {
  concepts!: Table<Concept>;
  interactions!: Table<Interaction>;
  profile!: Table<UserProfile>;
  settings!: Table<AppSettings>;

  constructor() {
    super('ConstellationDB');
    this.version(1).stores({
      concepts:     'id, wikidataId, name, *cats, createdAt',
      interactions: '++id, conceptId, verdict, timestamp, sessionId',
      profile:      '++id',
      settings:     '++id',
    });
  }
}

export const db = new ConstellationDB();

// ---- helpers ----

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

export async function recordInteraction(
  conceptId: string,
  verdict: import('../types').SwipeVerdict,
  sessionId: string,
): Promise<void> {
  await db.interactions.add({ conceptId, verdict, timestamp: new Date(), sessionId });
}

export async function cacheConcept(concept: Concept): Promise<void> {
  await db.concepts.put(concept);
}

export async function getCachedConcept(id: string): Promise<Concept | undefined> {
  return db.concepts.get(id);
}
