import type { Concept, CategoryKey, CategoryWeight } from '../types';
import { cacheConcept, getCachedConcept, cacheWikiGet, cacheWikiSet } from '../stores/db';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API_FR = 'https://fr.wikipedia.org/api/rest_v1';

/**
 * fetch avec backoff exponentiel sur 429 (rate limit) et 5xx.
 * Respecte l'en-tête Retry-After si présent. Max 3 tentatives.
 */
export async function fetchWithRetry(input: string, init?: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(input, init);
    } catch (err) {
      // Erreur réseau : on retente avec backoff
      if (attempt >= maxRetries) throw err;
      await new Promise(r => setTimeout(r, 2 ** attempt * 500));
      attempt++;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 800; // 800ms, 1.6s, 3.2s
      await new Promise(r => setTimeout(r, waitMs));
      attempt++;
      continue;
    }
    return res;
  }
}

// ---- SPARQL queries ----

// 30 concepts culturels variés couvrant les 12 catégories pour l'onboarding
const ONBOARDING_SPARQL = `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?instanceLabel WHERE {
  VALUES ?item {
    wd:Q7199 wd:Q9358 wd:Q32522 wd:Q9252 wd:Q154842
    wd:Q3772 wd:Q47209 wd:Q93341 wd:Q174 wd:Q1402
    wd:Q36180 wd:Q45789 wd:Q153570 wd:Q81074 wd:Q208202
    wd:Q79025 wd:Q185925 wd:Q22688 wd:Q42511 wd:Q25191
    wd:Q160852 wd:Q7243 wd:Q30461 wd:Q38193 wd:Q184843
    wd:Q188450 wd:Q11934 wd:Q60787 wd:Q170978 wd:Q208569
  }
  ?item wdt:P31 ?instance.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
LIMIT 30
`;

// Recherche libre (avec pagination)
const searchSPARQL = (query: string, limit = 10, offset = 0) => `
SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org";
      wikibase:api "EntitySearch";
      mwapi:search "${query.replace(/"/g, '\\"')}";
      mwapi:language "fr";
      mwapi:limit "${Math.min(50, limit + offset)}".
    ?item wikibase:apiOutputItem mwapi:item.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
LIMIT ${limit}
OFFSET ${offset}
`;

// ---- Wikidata item → catégories heuristiques ----

const WIKIDATA_TYPE_TO_CAT: Array<[string[], CategoryKey[]]> = [
  [['Q5'], ['personnages']],
  [['Q36180', 'Q482980', 'Q4964182', 'Q1930187'], ['litterature']],
  [['Q11424', 'Q201658'], ['cinema']],
  [['Q482994', 'Q215380', 'Q488205'], ['musique']],
  [['Q7397', 'Q16166344'], ['jeuvideo']],
  [['Q11862764', 'Q18536349', 'Q21198', 'Q28640'], ['sciences']],
  [['Q35120', 'Q4830453', 'Q783794'], ['economie']],
  [['Q11862764', 'Q11862764'], ['humaines']],
  [['Q3305213', 'Q93184', 'Q213156'], ['arts']],
  [['Q9174', 'Q179805', 'Q4830453', 'Q2920921'], ['philosophie']],
  [['Q3914', 'Q100995'], ['histoire']],
  [['Q82794', 'Q1187580'], ['geographie']],
];

function guessCategories(instanceOf: string[], description: string): CategoryWeight[] {
  const scores: Partial<Record<CategoryKey, number>> = {};

  for (const [types, cats] of WIKIDATA_TYPE_TO_CAT) {
    const match = types.some(t => instanceOf.includes(t));
    if (match) {
      for (const cat of cats) {
        scores[cat] = (scores[cat] ?? 0) + 1;
      }
    }
  }

  // Heuristiques textuelles sur la description
  const desc = description.toLowerCase();
  if (desc.includes('philosoph') || desc.includes('penseur') || desc.includes('théori'))
    scores.philosophie = (scores.philosophie ?? 0) + 2;
  if (desc.includes('musicien') || desc.includes('musique') || desc.includes('compositeur'))
    scores.musique = (scores.musique ?? 0) + 2;
  if (desc.includes('réalisateur') || desc.includes('cinéast') || desc.includes('film'))
    scores.cinema = (scores.cinema ?? 0) + 2;
  if (desc.includes('jeu vidéo') || desc.includes('video game') || desc.includes('jeu de rôle'))
    scores.jeuvideo = (scores.jeuvideo ?? 0) + 2;
  if (desc.includes('écrivain') || desc.includes('auteur') || desc.includes('roman') || desc.includes('poète'))
    scores.litterature = (scores.litterature ?? 0) + 2;
  if (desc.includes('artiste') || desc.includes('peintre') || desc.includes('sculpteur'))
    scores.arts = (scores.arts ?? 0) + 2;
  if (desc.includes('historien') || desc.includes('histoire') || desc.includes('archéolog'))
    scores.histoire = (scores.histoire ?? 0) + 2;
  if (desc.includes('géograph') || desc.includes('pays') || desc.includes('ville') || desc.includes('territoire'))
    scores.geographie = (scores.geographie ?? 0) + 2;
  if (desc.includes('économist') || desc.includes('économie') || desc.includes('entrepreneur'))
    scores.economie = (scores.economie ?? 0) + 2;
  if (desc.includes('scientifique') || desc.includes('mathématicien') || desc.includes('physicien') || desc.includes('biologiste'))
    scores.sciences = (scores.sciences ?? 0) + 2;

  if (Object.keys(scores).length === 0) scores.personnages = 1;

  const total = Object.values(scores).reduce((s, v) => s + (v ?? 0), 0);
  const sorted = (Object.entries(scores) as Array<[CategoryKey, number]>)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const catTotal = sorted.reduce((s, [, v]) => s + v, 0);
  return sorted.map(([k, v]) => [k, Math.round((v / catTotal) * 100) / 100] as CategoryWeight);
}

function guessKind(instanceOf: string[], description: string): string {
  const desc = description.toLowerCase();
  if (instanceOf.includes('Q5')) return 'Personnage';
  if (instanceOf.some(i => ['Q7397', 'Q16166344'].includes(i))) return 'Jeu vidéo';
  if (instanceOf.some(i => ['Q11424', 'Q201658'].includes(i))) return 'Film';
  if (instanceOf.some(i => ['Q482994', 'Q215380'].includes(i))) return 'Œuvre musicale';
  if (desc.includes('roman') || desc.includes('livre') || instanceOf.includes('Q7725634')) return 'Œuvre';
  if (desc.includes('courant') || desc.includes('mouvement') || desc.includes('école')) return 'Courant';
  if (desc.includes('théorie') || desc.includes('concept') || desc.includes('doctrine')) return 'Théorie';
  return 'Concept';
}

// ---- SPARQL executor ----

async function sparql<T>(query: string): Promise<T[]> {
  const url = new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');

  const res = await fetchWithRetry(url.toString(), {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}`);
  const data = await res.json();
  return data.results?.bindings ?? [];
}

// ---- Wikipedia thumbnail ----

async function fetchWikipediaThumbnail(frTitle: string): Promise<string | undefined> {
  try {
    const encoded = encodeURIComponent(frTitle.replace(/ /g, '_'));
    const res = await fetch(`${WIKIPEDIA_API_FR}/page/summary/${encoded}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.thumbnail?.source;
  } catch {
    return undefined;
  }
}

// ---- Wikidata semantic relations ----

export interface SemanticRelation {
  propertyId: string;       // P31, P279, etc.
  propertyLabel: string;    // "instance de", "sous-classe de", etc.
  targetQid: string;        // Q42
  targetLabel: string;      // "Douglas Adams"
}

const PROPERTY_LABELS: Record<string, string> = {
  P31:  'est un·e',           // instance of
  P279: 'sous-classe de',      // subclass of
  P361: 'partie de',           // part of
  P527: 'comprend',            // has part
  P737: 'influencé·e par',     // influenced by
  P135: 'mouvement',           // movement
  P136: 'genre',               // genre
  P101: 'champ',               // field of work
};

const ALLOWED_PROPS = Object.keys(PROPERTY_LABELS);

/** Récupère 5-7 relations sémantiques pertinentes pour un Q-ID Wikidata. Cache 30j. */
/** Retourne les Q-IDs des targets de toutes les relations sémantiques (filtré P31/P279/etc.). */
export async function fetchRelatedQids(qid: string): Promise<string[]> {
  const relations = await fetchSemanticRelations(qid);
  return relations.map(r => r.targetQid).filter(Boolean);
}

export async function fetchSemanticRelations(qid: string): Promise<SemanticRelation[]> {
  if (!qid || !/^Q\d+$/.test(qid)) return [];
  const cacheKey = `semantic:${qid}`;
  const cached = await cacheWikiGet<SemanticRelation[]>(cacheKey);
  if (cached) return cached;

  const sparql = `
SELECT ?prop ?propLabel ?target ?targetLabel WHERE {
  VALUES ?prop { ${ALLOWED_PROPS.map(p => `wdt:${p}`).join(' ')} }
  wd:${qid} ?prop ?target .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" }
}
LIMIT 12`;

  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetchWithRetry(url, { headers: { 'Accept': 'application/sparql-results+json' } });
    if (!res.ok) return [];
    const data = await res.json();
    type Binding = {
      prop?: { value: string };
      target?: { value: string };
      targetLabel?: { value: string };
    };
    const bindings = (data.results?.bindings ?? []) as Binding[];
    const relations: SemanticRelation[] = bindings
      .map(b => {
        const propUri = b.prop?.value ?? '';
        const targetUri = b.target?.value ?? '';
        const propertyId = propUri.split('/').pop()?.replace('direct/', '') ?? '';
        const targetQid = targetUri.split('/').pop() ?? '';
        const targetLabel = b.targetLabel?.value ?? targetQid;
        return {
          propertyId,
          propertyLabel: PROPERTY_LABELS[propertyId] ?? propertyId,
          targetQid,
          targetLabel,
        };
      })
      // Skip results where target label looks like a Q-ID (no human label found)
      .filter(r => r.targetQid && !/^Q\d+$/.test(r.targetLabel))
      .slice(0, 7);

    if (relations.length > 0) await cacheWikiSet(cacheKey, relations);
    return relations;
  } catch {
    return [];
  }
}

export async function fetchWikipediaExtract(title: string): Promise<string | undefined> {
  const cacheKey = `wiki-extract:${title}`;
  const cached = await cacheWikiGet<string>(cacheKey);
  if (cached) return cached;

  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  let extract: string | undefined;
  try {
    const res = await fetch(`${WIKIPEDIA_API_FR}/page/summary/${encoded}`);
    if (res.ok) {
      const data = await res.json();
      if (data.extract) extract = data.extract as string;
    }
  } catch { /* fallthrough */ }
  if (!extract) {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`);
      if (res.ok) {
        const data = await res.json();
        if (data.extract) extract = data.extract as string;
      }
    } catch { /* ignore */ }
  }
  if (extract) cacheWikiSet(cacheKey, extract).catch(() => {});
  return extract;
}

// ---- Wikidata entity details ----

interface RawBinding {
  item?: { value: string };
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  instanceLabel?: { value: string };
  frwiki?: { value: string };
}

function bindingToConcept(b: RawBinding): Concept | null {
  if (!b.item?.value || !b.itemLabel?.value) return null;

  const qid = b.item.value.replace('http://www.wikidata.org/entity/', '');
  const name = b.itemLabel.value;
  const desc = b.itemDescription?.value ?? '';
  const instanceLabels = b.instanceLabel?.value ? [b.instanceLabel.value] : [];

  const cats = guessCategories([], desc);
  const kind = guessKind(instanceLabels, desc);

  return {
    id: qid,
    wikidataId: qid,
    name,
    kind,
    cats,
    blurb: desc || `${name} — concept issu de Wikidata.`,
    refs: [],
    portrait: undefined,
    rec: `REC-${qid}`,
    sourceKind: 'random',
    createdAt: new Date(),
  };
}

// ---- Public API ----

export async function fetchOnboardingConcepts(): Promise<Concept[]> {
  const rows = await sparql<RawBinding>(ONBOARDING_SPARQL);

  const concepts: Concept[] = [];
  for (const row of rows) {
    const c = bindingToConcept(row);
    if (c) concepts.push(c);
  }

  // Shuffle et limiter à 30
  const shuffled = concepts.sort(() => Math.random() - 0.5).slice(0, 30);

  // Enrichir portraits en parallèle (best-effort)
  await Promise.allSettled(
    shuffled.map(async (c) => {
      const cached = await getCachedConcept(c.id);
      if (cached?.portrait) { c.portrait = cached.portrait; return; }
      const img = await fetchWikipediaThumbnail(c.name);
      if (img) c.portrait = img;
      await cacheConcept(c);
    }),
  );

  return shuffled;
}

export async function searchConcepts(query: string, limit = 10, offset = 0): Promise<Concept[]> {
  const rows = await sparql<RawBinding>(searchSPARQL(query, limit, offset));
  return rows.map(bindingToConcept).filter(Boolean) as Concept[];
}

export async function fetchConceptById(qid: string): Promise<Concept | null> {
  const cached = await getCachedConcept(qid);
  if (cached) return cached;

  const url = new URL(WIKIDATA_API);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qid);
  url.searchParams.set('languages', 'fr|en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const entity = data.entities?.[qid];
  if (!entity) return null;

  const name =
    entity.labels?.fr?.value ?? entity.labels?.en?.value ?? qid;
  const desc =
    entity.descriptions?.fr?.value ?? entity.descriptions?.en?.value ?? '';

  const instanceOf: string[] = (entity.claims?.P31 ?? [])
    .map((c: { mainsnak?: { datavalue?: { value?: { id?: string } } } }) =>
      c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);

  const frTitle = entity.sitelinks?.frwiki?.title;
  const portrait = frTitle ? await fetchWikipediaThumbnail(frTitle) : undefined;

  const concept: Concept = {
    id: qid,
    wikidataId: qid,
    name,
    kind: guessKind(instanceOf, desc),
    cats: guessCategories(instanceOf, desc),
    blurb: desc || `${name} — entité Wikidata.`,
    refs: [],
    portrait,
    rec: `REC-${qid}`,
    sourceKind: 'random',
    createdAt: new Date(),
  };

  await cacheConcept(concept);
  return concept;
}

/**
 * Récupère ~500 Q-IDs Wikidata triés par notoriété (count de sitelinks Wikipedia).
 * Cache TTL 30j. Utilisé comme pool de tirage du mode Aléatoire.
 */
const NOTORIETY_SPARQL = `
SELECT ?item WHERE {
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl > 80)
  VALUES ?type { wd:Q5 wd:Q571 wd:Q11424 wd:Q7889 wd:Q482994 wd:Q386724 wd:Q15619164 wd:Q179805 }
  ?item wdt:P31/wdt:P279* ?type .
}
ORDER BY DESC(?sl)
LIMIT 500`;

export async function fetchNotorietyBase(): Promise<string[]> {
  const cacheKey = 'notoriety-base-v1';
  const cached = await cacheWikiGet<string[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(NOTORIETY_SPARQL)}&format=json`;
    const res = await fetchWithRetry(url, { headers: { 'Accept': 'application/sparql-results+json' } });
    if (!res.ok) return [];
    const data = await res.json();
    type Binding = { item?: { value: string } };
    const bindings = (data.results?.bindings ?? []) as Binding[];
    const ids = bindings
      .map(b => b.item?.value?.split('/').pop())
      .filter((x): x is string => !!x);
    if (ids.length > 0) await cacheWikiSet(cacheKey, ids);
    return ids;
  } catch {
    return [];
  }
}

export async function fetchRandomConcepts(count = 5): Promise<Concept[]> {
  // Essaie d'abord la base notoriété pré-filtrée (cache 30j)
  const notority = await fetchNotorietyBase();
  if (notority.length >= 20) {
    const shuffled = [...notority].sort(() => Math.random() - 0.5).slice(0, count + 8);
    const results = await Promise.allSettled(shuffled.map(fetchConceptById));
    const concepts = results
      .filter((r): r is PromiseFulfilledResult<Concept> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .slice(0, count);
    if (concepts.length >= count - 2) return concepts;
  }
  // Fallback : pool d'IDs en dur (concepts notables connus)
  const NOTABLE_IDS = [
    'Q9358', 'Q7199', 'Q32522', 'Q9252', 'Q154842', 'Q3772', 'Q47209',
    'Q93341', 'Q174', 'Q1402', 'Q36180', 'Q45789', 'Q153570', 'Q81074',
    'Q208202', 'Q79025', 'Q185925', 'Q22688', 'Q42511', 'Q25191',
    'Q160852', 'Q7243', 'Q30461', 'Q38193', 'Q184843', 'Q188450',
    'Q11934', 'Q60787', 'Q170978', 'Q208569', 'Q862', 'Q8028',
    'Q3741',  'Q9061',  'Q1343',  'Q9217',  'Q55422', 'Q7391',
  ];
  const shuffled = NOTABLE_IDS.sort(() => Math.random() - 0.5).slice(0, count + 5);
  const results = await Promise.allSettled(shuffled.map(fetchConceptById));
  return results
    .filter((r): r is PromiseFulfilledResult<Concept> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .slice(0, count);
}

// ============================================================
// Stratégies de suggestion via vraie SPARQL Wikidata (#11 + #12)
// ============================================================

const REL_PROPS = ['P31', 'P279', 'P361', 'P527', 'P737', 'P135', 'P136', 'P101'];

/** Mapping contrainte texte → Q-ID Wikidata (recherche fuzzy). */
const CONSTRAINT_QID_MAP: Record<string, string> = {
  'auteurs': 'Q482980', 'auteur': 'Q482980',
  'écrivains': 'Q36180', 'écrivain': 'Q36180',
  'philosophes': 'Q4964182', 'philosophe': 'Q4964182',
  'films': 'Q11424', 'film': 'Q11424',
  'livres': 'Q571', 'livre': 'Q571', 'romans': 'Q8261',
  'œuvres': 'Q386724', 'oeuvres': 'Q386724',
  'courants': 'Q968159', 'mouvements': 'Q968159',
  'lieux': 'Q17334923', 'lieu': 'Q17334923',
  'personnes': 'Q5', 'gens': 'Q5', 'humains': 'Q5',
  'théoriciens': 'Q3242115', 'scientifiques': 'Q901',
  'musiciens': 'Q639669', 'compositeurs': 'Q36834',
  'peintres': 'Q1028181', 'artistes': 'Q483501',
  'réalisateurs': 'Q2526255', 'cinéastes': 'Q2526255',
};

export interface ConstraintResolution {
  mappable: Array<{ text: string; qid: string }>;
  unmappable: string[];
}

/** Résout des contraintes texte en Q-IDs Wikidata (fuzzy). */
export function resolveConstraints(constraints: string[]): ConstraintResolution {
  const mappable: Array<{ text: string; qid: string }> = [];
  const unmappable: string[] = [];
  for (const c of constraints) {
    const norm = c.toLowerCase().trim();
    let qid = CONSTRAINT_QID_MAP[norm];
    if (!qid) {
      const key = Object.keys(CONSTRAINT_QID_MAP).find(k => norm.includes(k) || k.includes(norm));
      if (key) qid = CONSTRAINT_QID_MAP[key];
    }
    if (qid) mappable.push({ text: c, qid });
    else unmappable.push(c);
  }
  return { mappable, unmappable };
}

/**
 * Résout un mot-clé en QID Wikidata via l'API `wbsearchentities` (recherche
 * live, français puis anglais). Renvoie le meilleur item, ou null.
 */
export async function searchEntityId(query: string): Promise<string | null> {
  const lookup = async (lang: string): Promise<string | null> => {
    try {
      const url = new URL(WIKIDATA_API);
      url.searchParams.set('action', 'wbsearchentities');
      url.searchParams.set('search', query);
      url.searchParams.set('language', lang);
      url.searchParams.set('uselang', lang);
      url.searchParams.set('type', 'item');
      url.searchParams.set('limit', '1');
      url.searchParams.set('format', 'json');
      url.searchParams.set('origin', '*');
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      const id = data.search?.[0]?.id;
      return typeof id === 'string' && /^Q\d+$/.test(id) ? id : null;
    } catch {
      return null;
    }
  };
  return (await lookup('fr')) ?? (await lookup('en'));
}

/**
 * Comme `resolveConstraints`, mais complète les termes inconnus de la table
 * figée par une recherche Wikidata live. Tout thème en langage naturel devient
 * ainsi mappable, sans dépendre du dictionnaire codé en dur.
 */
export async function resolveConstraintsLive(constraints: string[]): Promise<ConstraintResolution> {
  const base = resolveConstraints(constraints);
  if (base.unmappable.length === 0) return base;
  const mappable = [...base.mappable];
  const unmappable: string[] = [];
  const found = await Promise.all(base.unmappable.map(t => searchEntityId(t)));
  base.unmappable.forEach((t, i) => {
    const qid = found[i];
    if (qid) mappable.push({ text: t, qid });
    else unmappable.push(t);
  });
  return { mappable, unmappable };
}

/** Construit et exécute la requête SPARQL conjonctive pour des contraintes déjà résolues. */
async function conceptsForResolved(mappable: Array<{ text: string; qid: string }>, limit: number): Promise<Concept[]> {
  if (mappable.length === 0) return [];
  const clauses = mappable.map(m => `?item wdt:P31/wdt:P279* wd:${m.qid} .`).join('\n  ');
  const query = `
SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
  ${clauses}
  ?item wikibase:sitelinks ?sl . FILTER(?sl > 20)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
ORDER BY DESC(?sl)
LIMIT ${limit}`;
  try {
    const rows = await sparql<RawBinding>(query);
    return rows.map(bindingToConcept).filter(Boolean) as Concept[];
  } catch {
    return [];
  }
}

/**
 * #12 — Récupère des concepts respectant des contraintes Wikidata conjonctives.
 * Construit `?item wdt:P31/wdt:P279* wd:<QID>` (AND) pour chaque contrainte mappable.
 */
export async function fetchConceptsByConstraints(constraints: string[], limit = 12): Promise<Concept[]> {
  const { mappable } = resolveConstraints(constraints);
  return conceptsForResolved(mappable, limit);
}

/** Variante du précédent qui résout les thèmes via Wikidata live (au-delà de la table figée). */
export async function fetchConceptsByConstraintsLive(constraints: string[], limit = 12): Promise<Concept[]> {
  const { mappable } = await resolveConstraintsLive(constraints);
  return conceptsForResolved(mappable, limit);
}

/**
 * #11 Exploration — voisins Wikidata (forward + reverse) d'un ensemble de Q-IDs,
 * via les propriétés sémantiques filtrées, triés par notoriété.
 */
export async function fetchNeighborConcepts(qids: string[], limit = 20): Promise<Concept[]> {
  const valid = qids.filter(q => /^Q\d+$/.test(q)).slice(0, 8);
  if (valid.length === 0) return [];
  const anchors = valid.map(q => `wd:${q}`).join(' ');
  const props = REL_PROPS.map(p => `wdt:${p}`).join(' ');
  const query = `
SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
  VALUES ?anchor { ${anchors} }
  VALUES ?prop { ${props} }
  { ?anchor ?prop ?item. } UNION { ?item ?prop ?anchor. }
  ?item wikibase:sitelinks ?sl . FILTER(?sl > 12)
  FILTER(?item NOT IN (${anchors}))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
ORDER BY DESC(?sl)
LIMIT ${limit}`;
  try {
    const rows = await sparql<RawBinding>(query);
    return rows.map(bindingToConcept).filter(Boolean) as Concept[];
  } catch {
    return [];
  }
}

/**
 * #11 Croisement — concepts voisins COMMUNS à plusieurs Q-IDs.
 * Récupère les voisins de chacun puis intersecte (≥ 2 ancrages partagés).
 */
export async function fetchCommonNeighborConcepts(qids: string[], limit = 20): Promise<Concept[]> {
  const valid = qids.filter(q => /^Q\d+$/.test(q)).slice(0, 5);
  if (valid.length < 2) return fetchNeighborConcepts(valid, limit);
  const neighborSets = await Promise.all(valid.map(q => fetchNeighborConcepts([q], 40)));
  // Compte combien d'ancrages chaque candidat touche
  const score = new Map<string, { concept: Concept; hits: number }>();
  neighborSets.forEach(set => {
    set.forEach(c => {
      const e = score.get(c.id);
      if (e) e.hits++;
      else score.set(c.id, { concept: c, hits: 1 });
    });
  });
  return [...score.values()]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map(e => e.concept);
}
