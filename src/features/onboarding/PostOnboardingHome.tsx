import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster, FileSeal } from '../../components/ui/atoms';
import { CATEGORIES } from '../../lib/categories';
import { db, getAdoptedConcepts, saveSettings, getSettings } from '../../stores/db';
import type { Concept, CategoryKey } from '../../types';

interface Props {
  onEnter: () => void;
  onSkipForever: () => void;
}

export function PostOnboardingHome({ onEnter, onSkipForever }: Props) {
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [stats, setStats] = useState({ adopted: 0, rejected: 0, skipped: 0 });
  const [recent, setRecent] = useState<Concept[]>([]);
  const [name, setName] = useState('Citoyen');

  useEffect(() => {
    (async () => {
      const a = await getAdoptedConcepts();
      setAdopted(a);
      setRecent(a.slice(0, 4));
      const ints = await db.interactions.toArray();
      setStats({
        adopted: ints.filter(i => i.verdict === 'valid').length,
        rejected: ints.filter(i => i.verdict === 'reject').length,
        skipped: ints.filter(i => i.verdict === 'skip').length,
      });
      const profile = await db.profile.toCollection().first();
      if (profile) setName('Citoyen'); // could expand later if profile.name added
    })();
  }, []);

  // Category distribution
  const catCounts: Record<string, number> = {};
  adopted.forEach(c => c.cats.forEach(([k, w]) => { catCounts[k] = (catCounts[k] ?? 0) + w; }));
  const topCats = (Object.entries(catCounts) as Array<[CategoryKey, number]>)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = Math.max(...topCats.map(([, v]) => v), 1);

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker={`Bonjour,`}
        title={name.toUpperCase()}
        active="swipe"
        right={<>
          <Stamp tone="brick" rotate={-3}>★ ACCUEIL · ÉDITION DU JOUR</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        flex: 1, padding: '24px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        {/* Hero greeting */}
        <div style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
          border: '3px solid var(--cit-navy-dk)',
          boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          padding: '24px 32px', marginBottom: 22,
          position: 'relative', overflow: 'hidden',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center',
        }}>
          <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
          <FileSeal size={100}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="cit-script" style={{ fontSize: 32, color: 'var(--cit-butter)', lineHeight: 0.9 }}>
              Re-bonjour,
            </div>
            <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 48, lineHeight: 0.92, margin: '4px 0' }}>
              VOTRE BUREAU<span style={{ color: 'var(--cit-butter)' }}>!</span>
            </h2>
            <p className="cit-typed" style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--cit-cream)', margin: '8px 0 0' }}>
              Votre univers compte aujourd'hui <strong style={{ color: 'var(--cit-butter)' }}>{adopted.length} concepts adoptés</strong>.
              Le Bureau a hâte de vous proposer la prochaine fournée.
            </p>
          </div>
          <Sunburst size={120} color="var(--cit-butter)" behindColor="var(--cit-brick)"/>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
          {[
            { label: 'TAILLE UNIVERS', v: String(adopted.length).padStart(3, '0'), c: 'var(--cit-navy)' },
            { label: 'RECYCLÉS',      v: String(stats.rejected).padStart(3, '0'), c: 'var(--cit-brick)' },
            { label: 'PASSÉS',         v: String(stats.skipped).padStart(3, '0'), c: 'var(--cit-mustard)' },
            { label: 'CATÉGORIES',    v: String(Object.keys(catCounts).length).padStart(2, '0'), c: 'var(--cit-rust)' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)',
              boxShadow: '4px 4px 0 var(--cit-navy-dk)',
              padding: '10px 14px',
            }}>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ {s.label}</div>
              <div className="cit-h1" style={{ fontSize: 40, lineHeight: 0.9, color: s.c, textShadow: 'none', marginTop: 4 }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>
          <CitPanel title="Composition de votre univers">
            {topCats.length === 0 ? (
              <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                Pas encore de catégories dominantes.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topCats.map(([k, v]) => {
                  const cat = CATEGORIES[k];
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 12, height: 12, background: cat.oklch, border: '1.5px solid var(--cit-navy-dk)' }}/>
                      <span className="cit-condensed" style={{ fontSize: 11, fontWeight: 700, width: 110, color: 'var(--cit-navy-dk)' }}>{cat.label}</span>
                      <div style={{ flex: 1, height: 12, background: 'var(--cit-paper)', border: '1.5px solid var(--cit-navy-dk)' }}>
                        <div style={{ width: `${(v / maxCat) * 100}%`, height: '100%', background: cat.oklch, borderRight: '1.5px solid var(--cit-navy-dk)' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CitPanel>

          <CitPanel title="Concepts récemment adoptés">
            {recent.length === 0 ? (
              <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                Aucun pour l'instant.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recent.map(c => {
                  const cat = CATEGORIES[c.cats[0]?.[0] ?? 'personnages'];
                  return (
                    <div key={c.id} style={{
                      display: 'grid', gridTemplateColumns: '12px 1fr', gap: 8, alignItems: 'center',
                      padding: '4px 8px', background: 'var(--cit-paper)',
                      border: '2px solid var(--cit-navy-dk)',
                    }}>
                      <span style={{ width: 12, height: 12, background: cat.oklch, border: '1.5px solid var(--cit-navy-dk)' }}/>
                      <span className="cit-h1" style={{ fontSize: 14, lineHeight: 1 }}>{c.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CitPanel>
        </div>

        {/* CTA strip */}
        <div style={{
          background: 'var(--cit-brick)', color: 'var(--cit-cream)',
          border: '3px solid var(--cit-navy-dk)',
          boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          padding: '18px 24px',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18,
          alignItems: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}/>
          <Aster size={48} rotate={-6}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 32, lineHeight: 0.92 }}>
              REPRENEZ L'EXPLORATION<span style={{ color: 'var(--cit-butter)' }}>!</span>
            </div>
            <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-cream)', marginTop: 4 }}>
              Le Bureau a préparé une nouvelle pile de fiches à examiner.
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CitButton tone="butter" onClick={onEnter}>★ Entrer dans Constellation</CitButton>
            <button onClick={onSkipForever} style={{
              background: 'transparent', color: 'var(--cit-cream)',
              border: '1.5px solid var(--cit-butter)',
              padding: '4px 10px', cursor: 'pointer',
              fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600,
              letterSpacing: '.12em', textTransform: 'uppercase',
            }}>Ne plus afficher cet accueil</button>
          </div>
        </div>
      </div>

      <CitizenFooter right="★ BIENVENUE DE RETOUR · BONNE EXPLORATION"/>
    </div>
  );
}

/** Helpers persistance "skip post-onboarding home". */
export async function getSkipPostOnboarding(): Promise<boolean> {
  const s = await getSettings();
  return !!s?.skipPostOnboarding;
}

export async function setSkipPostOnboarding(skip: boolean): Promise<void> {
  await saveSettings({ skipPostOnboarding: skip });
}

export async function hasSeenPostOnboarding(): Promise<boolean> {
  const s = await getSettings();
  return !!s?.hasSeenPostOnboarding;
}

export async function markPostOnboardingSeen(): Promise<void> {
  await saveSettings({ hasSeenPostOnboarding: true });
}
