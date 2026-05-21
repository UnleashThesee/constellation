import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, FileSeal } from '../../components/ui/atoms';

interface Props { onTabChange?: (id: string) => void }

const SHORTCUTS: Array<[string, string, string]> = [
  ['→', 'Adopter la fiche', 'Mode Swipe'],
  ['←', 'Rejeter la fiche', 'Mode Swipe'],
  ['↑', 'Favori (adopte + ★)', 'Mode Swipe'],
  ['↓', 'Neutre', 'Mode Swipe'],
  ['⌫', 'Annuler la dernière action', 'Mode Swipe'],
  ['tap', 'Ouvrir la fiche détaillée', 'Mode Swipe'],
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Comment le Bureau choisit les fiches ?',
    a: 'Le mode actif détermine la pioche : Aléatoire tire sans filtre, Thématique selon vos catégories cochées, Exploration depuis un concept-pivot, Contraste cherche l\'opposé de votre profil, Croisement cherche à l\'intersection sémantique. Vous pouvez régler la balance de l\'algorithme dans Réglages.',
  },
  {
    q: 'Mes données partent-elles dans le ciel ?',
    a: 'Non. Tout reste sur votre terminal (IndexedDB navigateur). Le Bureau n\'a pas de cloud, pas de serveur, pas de compte. Vous pouvez exporter votre univers manuellement depuis Réglages.',
  },
  {
    q: 'Puis-je créer un concept qui n\'existe pas sur Wikidata ?',
    a: 'Oui — dans la recherche d\'ajout manuel, vous trouverez un bouton « Créer un concept libre ». Donnez-lui un nom, une description, une ou plusieurs catégories.',
  },
  {
    q: 'Le LLM fonctionne comment ?',
    a: 'Vous fournissez votre propre clé API (Anthropic ou OpenAI) dans Réglages. Le Bureau envoie une requête avec votre combinaison + vos contraintes, reçoit 5 à 10 idées en retour. Aucune donnée n\'est conservée côté Bureau.',
  },
];

export function AboutScreen({ onTabChange }: Props) {
  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="À propos du"
        title="BUREAU"
        active="settings"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>VERSION 0.1.0-φ</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{ flex: 1, padding: '22px 32px', overflow: 'auto', background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative' }}>
        {/* Manifesto */}
        <div style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
          border: '3px solid var(--cit-navy-dk)',
          boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          padding: '20px 28px', marginBottom: 22,
          position: 'relative', overflow: 'hidden',
        }}>
          <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
          <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' }}>
            <FileSeal size={120}/>
            <div>
              <div className="cit-script" style={{ fontSize: 38, color: 'var(--cit-butter)', lineHeight: 0.9 }}>
                Notre mission,
              </div>
              <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 44, lineHeight: 0.92, margin: '4px 0' }}>
                FISSURER VOTRE BULLE<span style={{ color: 'var(--cit-butter)' }}>!</span>
              </h2>
              <p className="cit-typed" style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 0', color: 'var(--cit-cream)' }}>
                Constellation est un terminal personnel d'exploration intellectuelle. Vous swipez des concepts, vous construisez votre univers, vous les croisez pour générer des idées de projets. Tout reste chez vous. Le Bureau ne vous espionne pas.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 18, marginBottom: 22 }}>
          <CitPanel title="Raccourcis clavier">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SHORTCUTS.map((s, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '76px 1fr auto', gap: 12, alignItems: 'center',
                  padding: '4px 6px',
                  borderBottom: i < SHORTCUTS.length - 1 ? '1.5px dotted var(--cit-navy-dk)' : 'none',
                }}>
                  <kbd style={{
                    fontFamily: "'Alfa Slab One', serif", fontSize: 14,
                    color: 'var(--cit-navy-dk)',
                    background: 'var(--cit-butter)',
                    border: '2px solid var(--cit-navy-dk)',
                    padding: '2px 8px',
                    boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                    textAlign: 'center',
                  }}>{s[0]}</kbd>
                  <span className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-dk)' }}>{s[1]}</span>
                  <span className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)', letterSpacing: '.12em' }}>{s[2]}</span>
                </div>
              ))}
            </div>
          </CitPanel>

          <CitPanel title="Questions souvent posées">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FAQ.map((f, i) => (
                <details key={i} open={i < 2} style={{ borderBottom: '1.5px dashed var(--cit-navy-dk)', paddingBottom: 8 }}>
                  <summary style={{
                    fontFamily: "'Alfa Slab One', serif", fontSize: 14,
                    color: 'var(--cit-navy-dk)', cursor: 'pointer',
                    listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>★ {f.q}</span>
                    <span style={{ color: 'var(--cit-brick)', fontSize: 18 }}>›</span>
                  </summary>
                  <p className="cit-typed" style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--cit-navy-dk)' }}>{f.a}</p>
                </details>
              ))}
            </div>
          </CitPanel>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
          <CitPanel title="Mentions">
            <div className="cit-typed" style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--cit-navy-dk)' }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>Constellation</strong> est un terminal personnel d'exploration intellectuelle.
                Mono-utilisateur, stockage local, pas de backend.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Données concept : <strong style={{ color: 'var(--cit-brick)' }}>Wikidata</strong> + <strong style={{ color: 'var(--cit-brick)' }}>Wikipédia</strong>.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Typographies : Alfa Slab One, Yellowtail, Oswald, Special Elite. Toutes en licence libre Google Fonts.
              </p>
              <p style={{ margin: 0 }}>
                Le Bureau de l'Exploration Cognitive n'est en aucun cas responsable de votre soif de savoir.
              </p>
            </div>
          </CitPanel>

          <div style={{
            background: 'var(--cit-cream)',
            border: '3px solid var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
            padding: '14px 18px',
          }}>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ VERSION ACTUELLE</div>
            <div className="cit-h1" style={{ fontSize: 36, lineHeight: 0.9, color: 'var(--cit-brick)', textShadow: 'none' }}>
              0.1.0<span style={{ color: 'var(--cit-navy-lt)', fontSize: 18 }}>-φ</span>
            </div>
            <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', marginTop: 4 }}>
              Phase 1 · Édition de printemps
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <CitButton size="sm" tone="navy" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onTabChange?.('settings')}>
                ← Retour aux réglages
              </CitButton>
              <a href="https://github.com/UnleashThesee/constellation" target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                <CitButton size="sm" tone="butter" style={{ width: '100%', justifyContent: 'center' }}>
                  Code source ↗
                </CitButton>
              </a>
            </div>
          </div>
        </div>
      </div>

      <CitizenFooter right="★ MERCI DE VOTRE LECTURE · BONNE EXPLORATION"/>
    </div>
  );
}
