import { useEffect, useState } from 'react';
import { CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Aster, Stamp } from '../../components/ui/atoms';
import { CATEGORIES } from '../../lib/categories';
import { getAdoptedConcepts, getAllInteractions, getSettings, saveSettings } from '../../stores/db';
import { fetchRandomConcepts } from '../../services/wikidata';
import { useToast } from '../../lib/toast';
import { playSound } from '../../lib/sounds';
import type { Concept, CategoryKey } from '../../types';

interface Props {
  onLaunchSeries: (deck: Concept[], anchor: Concept) => void;
}

/**
 * Boost proactif : modal occasionnel suggérant 20 concepts liés à un concept dominant.
 * Conditions : univers > 50 concepts, dernière session > 3 jours, pas plus d'un boost par semaine.
 */
export function BoostModal({ onLaunchSeries }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Concept | null>(null);
  const [preview, setPreview] = useState<Concept[]>([]);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const adopted = await getAdoptedConcepts();
      if (adopted.length < 50) return;

      const interactions = await getAllInteractions();
      if (interactions.length === 0) return;
      const lastInteraction = +interactions[0].timestamp;
      const daysSinceLastSession = (Date.now() - lastInteraction) / (24 * 60 * 60 * 1000);
      if (daysSinceLastSession < 3) return;

      const settings = await getSettings();
      const lastBoost = settings?.lastBoostAt ?? 0;
      const daysSinceLastBoost = (Date.now() - lastBoost) / (24 * 60 * 60 * 1000);
      if (daysSinceLastBoost < 7) return;

      // Choisir le concept dominant : favori OU le plus catégorisé
      const favorites = adopted.filter(c => c.isFavorite);
      const candidates = favorites.length > 0 ? favorites : adopted;
      const dominant = candidates.reduce((best, c) =>
        c.cats.length > best.cats.length ? c : best
      , candidates[0]);

      setAnchor(dominant);

      // Préparer 20 voisins via fetchRandomConcepts puis filtrage par catégorie commune
      try {
        const pool = await fetchRandomConcepts(30);
        const anchorCats = new Set(dominant.cats.map(([k]) => k));
        const neighbors = pool
          .filter(c => c.id !== dominant.id && c.cats.some(([k]) => anchorCats.has(k)))
          .slice(0, 20);
        setPreview(neighbors.slice(0, 4));
        if (neighbors.length >= 5) setOpen(true);
      } catch { /* skip if fetch fails */ }
    })();
  }, []);

  const dismiss = async () => {
    setOpen(false);
    // snooze 7 jours en re-marquant le timestamp
    await saveSettings({ lastBoostAt: Date.now() });
  };

  const launch = async () => {
    if (!anchor) return;
    playSound('llmDone');
    const pool = await fetchRandomConcepts(30);
    const anchorCats = new Set(anchor.cats.map(([k]) => k));
    const series = pool
      .filter(c => c.id !== anchor.id && c.cats.some(([k]) => anchorCats.has(k)))
      .slice(0, 20);
    if (series.length < 5) {
      toast.show({ tone: 'warning', title: 'Pas assez de candidats', body: 'Le Bureau cherchera plus largement.' });
    }
    await saveSettings({ lastBoostAt: Date.now() });
    setOpen(false);
    onLaunchSeries(series, anchor);
  };

  if (!open || !anchor) return null;

  const dominantCat = CATEGORIES[anchor.cats[0]?.[0] ?? 'personnages'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'oklch(0% 0 0 / 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
    }}>
      <div style={{
        width: '100%', maxWidth: 680,
        background: 'var(--cit-cream)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow: '10px 10px 0 var(--cit-navy-dk)',
        overflow: 'hidden',
      }}>
        <div style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
          padding: '18px 24px',
          position: 'relative', overflow: 'hidden',
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center',
        }}>
          <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
          <Sunburst size={96} color="var(--cit-butter)" behindColor="var(--cit-brick)"/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>★ BUREAU D'EXPANSION</div>
            <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 32, lineHeight: 0.92, margin: '2px 0' }}>
              VOUS SUGGÈRE<span style={{ color: 'var(--cit-butter)' }}>…</span>
            </h2>
            <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-cream)', marginTop: 4 }}>
              Plus de 50 dossiers adoptés · pas vu depuis 3 jours+. Le Bureau a préparé 20 concepts liés à
              <strong style={{ color: 'var(--cit-butter)' }}> {anchor.name}</strong>.
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 24px' }}>
          <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 8 }}>
            ★ APERÇU · CONCEPT-ANCRE : {anchor.name.toUpperCase()}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'center',
            padding: '10px 12px', marginBottom: 14,
            background: 'var(--cit-butter)',
            border: '2.5px solid var(--cit-navy-dk)',
            borderLeft: `10px solid ${dominantCat.oklch}`,
            boxShadow: '3px 3px 0 var(--cit-navy-dk)',
          }}>
            <Aster size={36} rotate={-8}/>
            <div>
              <div className="cit-h1" style={{ fontSize: 22, lineHeight: 0.95 }}>{anchor.name}</div>
              <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>{anchor.blurb.slice(0, 120)}…</div>
            </div>
          </div>

          <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 6 }}>
            ★ 4 PREMIERS DE LA SÉRIE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
            {preview.map(c => {
              const cat = CATEGORIES[c.cats[0]?.[0] ?? 'personnages'];
              return (
                <div key={c.id} style={{
                  padding: '6px 10px',
                  background: 'var(--cit-cream)',
                  border: '2px solid var(--cit-navy-dk)',
                  borderLeft: `8px solid ${cat.oklch}`,
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                  color: 'var(--cit-navy-dk)',
                }}>{c.name}</div>
              );
            })}
          </div>

          <Stamp tone="brick" rotate={-3}>★ SÉRIE ACCÉLÉRÉE 20 CARTES</Stamp>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <CitButton tone="navy" onClick={dismiss}>Plus tard · snooze 7j</CitButton>
            <CitButton tone="brick" onClick={launch}>★ Lancer la série</CitButton>
          </div>
        </div>
      </div>
    </div>
  );
}
