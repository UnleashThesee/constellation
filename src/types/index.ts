// ============================================================
// TYPES CONSTELLATION — Phase 1
// ============================================================

export type CategoryKey =
  | 'philosophie' | 'sciences' | 'humaines' | 'economie'
  | 'litterature' | 'arts' | 'musique' | 'cinema'
  | 'jeuvideo' | 'histoire' | 'geographie' | 'personnages';

export interface Category {
  key: CategoryKey;
  label: string;
  short: string;
  oklch: string;
}

export type CategoryWeight = [CategoryKey, number];

export type SwipeVerdict = 'valid' | 'reject' | 'skip';

export interface Concept {
  id: string;
  wikidataId?: string;
  name: string;
  years?: string;
  kind: string; // Auteur, Œuvre, Courant, Personnage, Théorie…
  cats: CategoryWeight[];
  blurb: string;
  blurbLong?: string;        // extrait Wikipedia long
  portrait?: string;          // URL image Wikimedia ou placeholder text
  refs: string[];
  coord?: string;
  rec?: string;
  sourceKind?: SourceKind;
  sourceTag?: string;
  isFavorite?: boolean;
  isManual?: boolean;         // créé manuellement (concept libre)
  createdAt?: Date;
}

export type SourceKind = 'linked' | 'random' | 'explore' | 'contrast' | 'cross';

export interface Interaction {
  id?: number;
  conceptId: string;
  verdict: SwipeVerdict;
  timestamp: Date;
  sessionId: string;
}

export interface UserProfile {
  id?: number;
  onboardingDone: boolean;
  onboardingVerdicts: Array<{ conceptId: string; verdict: SwipeVerdict }>;
  seedConcepts: string[];
  categoryWeights: Partial<Record<CategoryKey, number>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppSettings {
  id?: number;
  theme: 'phosphore' | 'amber' | 'cyan';
  swipeMode: SwipeMode;
  llmProvider?: 'claude' | 'openai';
  llmKey?: string;
  llmModel?: string;
  algorithmWeights?: { explore: number; random: number; contrast: number; trending: number };
  algorithmPresets?: Array<{ name: string; weights: { explore: number; random: number; contrast: number; trending: number } }>;
  paletteOverrides?: Record<string, string>;
}

export type SwipeMode = 'random' | 'themed' | 'explore' | 'contrast' | 'cross';

export interface SessionStats {
  valid: number;
  reject: number;
  skip: number;
  favs: number;
}

export interface SwipeHistoryEntry {
  name: string;
  verdict: SwipeVerdict;
  t: string;
}

// Wikidata raw entity shape (partial)
export interface WikidataEntity {
  id: string;
  labels?: { fr?: { value: string }; en?: { value: string } };
  descriptions?: { fr?: { value: string }; en?: { value: string } };
  claims?: Record<string, WikidataClaim[]>;
  sitelinks?: { frwiki?: { title: string }; enwiki?: { title: string } };
}

export interface WikidataClaim {
  mainsnak: {
    snaktype: string;
    property: string;
    datavalue?: {
      type: string;
      value: unknown;
    };
  };
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page: string } };
}

// ---- Tags, étiquettes personnelles, annotations ----

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: Date;
}

export interface ConceptTag {
  id?: number;
  conceptId: string;
  tagId: string;
}

export interface PersonalCategory {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface ConceptPersonalCategory {
  id?: number;
  conceptId: string;
  categoryId: string;
}

export interface Annotation {
  id?: number;
  conceptId: string;
  markdown: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Combinaisons sauvegardées ----

export interface SavedCombination {
  id: string;
  name: string;
  items: Array<{ conceptId: string; weight: number }>;
  constraints: string[];
  mixOklch: string;
  createdAt: Date;
  lastUsedAt: Date;
  isFavorite: boolean;
  ideasGeneratedCount: number;
  status: 'active' | 'archived';
}

// ---- Idées générées ----

export type IdeaStatus = 'new' | 'inprogress' | 'abandoned' | 'done';

export interface Idea {
  id: string;
  title: string;
  content: string;
  conceptIdsWithWeights: Array<{ conceptId: string; weight: number }>;
  outputType: string;
  constraints: string[];
  status: IdeaStatus;
  notes: string;
  tags: string[];
  inheritedOklch?: string;
  combinationId?: string;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}
