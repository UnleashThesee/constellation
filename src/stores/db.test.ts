import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  db, cacheConcept, recordVerdict, getAdoptedConcepts,
  createTag, addTagToConcept, removeTagFromConcept, cleanupOrphanTags,
  createLink, cleanupDanglingRefs,
  importFromJson,
} from './db';
import type { Concept } from '../types';

function makeConcept(over: Partial<Concept> = {}): Concept {
  return {
    id: over.id ?? 'c1',
    name: over.name ?? 'Test',
    kind: 'Concept',
    cats: [['philosophie', 1]],
    blurb: 'blurb',
    refs: [],
    ...over,
  };
}

// Réinitialise la base entre chaque test
beforeEach(async () => {
  // @ts-expect-error - reset du backend fake-indexeddb
  indexedDB = new IDBFactory();
  if (db.isOpen()) db.close();
  await db.delete().catch(() => {});
  await db.open();
});

describe('cacheConcept dedup', () => {
  it('dédoublonne par wikidataId (même Q-ID, id différent → fusion)', async () => {
    await cacheConcept(makeConcept({ id: 'Q42', wikidataId: 'Q42', name: 'Foucault' }));
    const canonicalId = await cacheConcept(makeConcept({ id: 'autre-id', wikidataId: 'Q42', name: 'Michel Foucault' }));
    expect(canonicalId).toBe('Q42');
    const all = await db.concepts.toArray();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Michel Foucault');
  });

  it('dédoublonne les concepts manuels par nom normalisé', async () => {
    await cacheConcept(makeConcept({ id: 'manual-1', name: 'Mon Concept' }));
    const id = await cacheConcept(makeConcept({ id: 'manual-2', name: '  mon concept  ' }));
    expect(id).toBe('manual-1');
    expect((await db.concepts.toArray()).length).toBe(1);
  });

  it('préserve isFavorite lors de la fusion', async () => {
    await cacheConcept(makeConcept({ id: 'Q1', wikidataId: 'Q1', isFavorite: true }));
    await cacheConcept(makeConcept({ id: 'Q1', wikidataId: 'Q1', isFavorite: false }));
    const c = await db.concepts.get('Q1');
    expect(c?.isFavorite).toBe(true);
  });

  it('ne fusionne pas deux concepts Wikidata distincts', async () => {
    await cacheConcept(makeConcept({ id: 'Q1', wikidataId: 'Q1' }));
    await cacheConcept(makeConcept({ id: 'Q2', wikidataId: 'Q2', name: 'Autre' }));
    expect((await db.concepts.toArray()).length).toBe(2);
  });
});

describe('recordVerdict (transaction atomique)', () => {
  it('persiste le concept et l\'interaction ensemble', async () => {
    const id = await recordVerdict(makeConcept({ id: 'Q5', wikidataId: 'Q5' }), 'valid', 'sess-1');
    expect(id).toBe('Q5');
    const adopted = await getAdoptedConcepts();
    expect(adopted.map(c => c.id)).toContain('Q5');
  });
});

describe('cleanupOrphanTags', () => {
  it('supprime les tags sans association', async () => {
    await cacheConcept(makeConcept({ id: 'c1' }));
    const tag = await createTag('orphelin');
    await addTagToConcept('c1', 'utilise');
    // Le tag 'orphelin' n'a aucune association
    const removed = await cleanupOrphanTags();
    expect(removed).toBe(1);
    const remaining = await db.tags.toArray();
    expect(remaining.find(t => t.id === tag.id)).toBeUndefined();
    expect(remaining.find(t => t.name === 'utilise')).toBeDefined();
  });

  it('un tag dont on retire la dernière association devient orphelin', async () => {
    await cacheConcept(makeConcept({ id: 'c1' }));
    const tag = await addTagToConcept('c1', 'temporaire');
    await removeTagFromConcept('c1', tag.id);
    const removed = await cleanupOrphanTags();
    expect(removed).toBe(1);
  });
});

describe('cleanupDanglingRefs', () => {
  it('supprime les liens vers des concepts inexistants', async () => {
    await cacheConcept(makeConcept({ id: 'c1' }));
    await cacheConcept(makeConcept({ id: 'c2', name: 'Deux' }));
    await createLink('c1', 'c2');
    await createLink('c1', 'fantome'); // c2 existe, fantome non
    await db.concepts.delete('c2'); // rend le 1er lien dangling aussi
    const removed = await cleanupDanglingRefs();
    expect(removed).toBe(2);
    expect((await db.links.toArray()).length).toBe(0);
  });
});

describe('importFromJson', () => {
  it('refuse un JSON non parsable', async () => {
    const r = await importFromJson('{not json');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parsing/i);
  });

  it('refuse un tableau au lieu d\'un objet', async () => {
    const r = await importFromJson('[]');
    expect(r.ok).toBe(false);
  });

  it('refuse si une table n\'est pas un tableau', async () => {
    const r = await importFromJson(JSON.stringify({ concepts: { not: 'array' } }));
    expect(r.ok).toBe(false);
  });

  it('refuse des concepts sans id', async () => {
    const r = await importFromJson(JSON.stringify({ concepts: [{ name: 'sans id' }] }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/id/i);
  });

  it('ignore les clés inconnues mais importe les tables valides', async () => {
    const r = await importFromJson(JSON.stringify({
      concepts: [{ id: 'x1', name: 'X', kind: 'Concept', cats: [['arts', 1]], blurb: '', refs: [] }],
      tableInconnue: [{ foo: 'bar' }],
    }));
    expect(r.ok).toBe(true);
    expect(r.skipped).toContain('tableInconnue');
    expect(r.imported.find(t => t.table === 'concepts')?.rows).toBe(1);
    expect(await db.concepts.get('x1')).toBeDefined();
  });

  it('ne touche pas la base si la validation échoue', async () => {
    await cacheConcept(makeConcept({ id: 'existant' }));
    await importFromJson(JSON.stringify({ concepts: [{ name: 'no id' }] }));
    // L'existant doit toujours être là
    expect(await db.concepts.get('existant')).toBeDefined();
  });
});
