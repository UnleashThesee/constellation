import { describe, it, expect } from 'vitest';
import { resolveConstraints } from './wikidata';

describe('resolveConstraints', () => {
  it('mappe les contraintes connues vers des Q-IDs', () => {
    const r = resolveConstraints(['auteurs', 'films']);
    expect(r.mappable).toHaveLength(2);
    expect(r.mappable.find(m => m.text === 'auteurs')?.qid).toBe('Q482980');
    expect(r.mappable.find(m => m.text === 'films')?.qid).toBe('Q11424');
    expect(r.unmappable).toHaveLength(0);
  });

  it('classe les contraintes libres en non mappables', () => {
    const r = resolveConstraints(['rien qui soit triste']);
    expect(r.mappable).toHaveLength(0);
    expect(r.unmappable).toContain('rien qui soit triste');
  });

  it('fait du fuzzy matching (sous-chaîne)', () => {
    const r = resolveConstraints(['des auteurs français']);
    expect(r.mappable.length).toBeGreaterThan(0);
    expect(r.mappable[0].qid).toBe('Q482980');
  });

  it('gère le mélange mappable + non mappable', () => {
    const r = resolveConstraints(['philosophes', 'inventé après 1990']);
    expect(r.mappable.find(m => m.qid === 'Q4964182')).toBeDefined();
    expect(r.unmappable).toContain('inventé après 1990');
  });
});
