import { useState, useEffect } from 'react';
import { useSwipeDeck } from './useSwipeDeck';
import { ConceptCard } from './ConceptCard';
import { Led, SegBar, MiniBars } from '../../components/ui/atoms';
import { fetchRandomConcepts } from '../../services/wikidata';
import type { Concept, SwipeMode } from '../../types';

// ---- Static fallback deck ----
const FALLBACK_CONCEPTS: Concept[] = [
  {
    id: 'foucault', name: 'Michel Foucault', years: '1926 — 1984', kind: 'Auteur',
    cats: [['philosophie', 0.7], ['histoire', 0.3]],
    blurb: 'Archéologue des savoirs. Démonte les régimes de vérité, les dispositifs de pouvoir et la fabrique du sujet moderne.',
    refs: ['Surveiller et punir', "L'Archéologie du savoir"], rec: 'REC-0042', sourceKind: 'random',
  },
  {
    id: 'darkSouls', name: 'Dark Souls', years: '2011', kind: 'Œuvre',
    cats: [['jeuvideo', 0.7], ['arts', 0.15], ['litterature', 0.15]],
    blurb: 'Action-RPG cryptique. Récit fragmentaire transmis par l\'objet et l\'architecture.',
    refs: ['From Software', 'Hidetaka Miyazaki'], rec: 'REC-0043', sourceKind: 'random',
  },
  {
    id: 'annales', name: 'École des Annales', years: '1929 — ····', kind: 'Courant',
    cats: [['histoire', 0.55], ['humaines', 0.3], ['geographie', 0.15]],
    blurb: 'Bloch, Febvre, Braudel : refus du récit événementiel. Histoire longue, sérielle, totale.',
    refs: ['Marc Bloch', 'Fernand Braudel'], rec: 'REC-0044', sourceKind: 'random',
  },
  {
    id: 'satie', name: 'Erik Satie', years: '1866 — 1925', kind: 'Personnage',
    cats: [['musique', 0.6], ['personnages', 0.25], ['arts', 0.15]],
    blurb: 'Pianiste cabaret, mystique du dépouillement. Gymnopédies et Vexations — précurseur du minimalisme.',
    refs: ['Gymnopédies', 'Vexations'], rec: 'REC-0045', sourceKind: 'random',
  },
];

const MODES: Array<{ id: SwipeMode; label: string; sub: string }> = [
  { id: 'random',   label: 'Aléatoire',  sub: 'RND' },
  { id: 'themed',   label: 'Thématique', sub: 'THM' },
  { id: 'explore',  label: 'Exploration',sub: 'XPL' },
  { id: 'contrast', label: 'Contraste',  sub: 'CTR' },
  { id: 'cross',    label: 'Croisement', sub: 'XSS' },
];

const NAV_ITEMS = [
  { id: 'swipe', label: 'Swipe', num: '01' },
  { id: 'map', label: 'Map', num: '02' },
  { id: 'ideas', label: 'Idées', num: '03' },
  { id: 'favs', label: 'Favoris', num: '04' },
  { id: 'settings', label: 'Paramètres', num: '05' },
];

// ---- Icons ----
const IconReject = () => <svg viewBox="0 0 24 24" fill="none" stroke="oklch(95% 0.05 25)" strokeWidth="3" strokeLinecap="square"><path d="M5 5L19 19M19 5L5 19" /></svg>;
const IconValid  = () => <svg viewBox="0 0 24 24" fill="none" stroke="oklch(95% 0.05 140)" strokeWidth="3" strokeLinecap="square"><path d="M4 12L10 18L20 6" /></svg>;
const IconSkip   = () => <svg viewBox="0 0 24 24" fill="none" stroke="oklch(95% 0.02 150)" strokeWidth="3" strokeLinecap="square"><path d="M5 12H19M14 7L19 12L14 17" /></svg>;
const IconBack   = () => <svg viewBox="0 0 24 24" fill="none" stroke="oklch(95% 0.06 75)" strokeWidth="3" strokeLinecap="square"><path d="M9 6L3 12M3 12L9 18M3 12H17C19 12 21 14 21 16V18" /></svg>;

function ConstellationLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ filter: 'drop-shadow(0 0 6px var(--phos-deep))' }}>
      <circle cx="14" cy="14" r="11" fill="none" stroke="var(--phos)" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="3" fill="var(--phos)" />
      {[0, 72, 144, 216, 288].map(a => {
        const rad = (a * Math.PI) / 180;
        const x = 14 + Math.cos(rad) * 11;
        const y = 14 + Math.sin(rad) * 11;
        return <circle key={a} cx={x} cy={y} r="2" fill="var(--phos)" />;
      })}
      <line x1="14" y1="14" x2="25" y2="14" stroke="var(--phos)" strokeWidth="1" />
      <line x1="14" y1="14" x2="14" y2="25" stroke="var(--phos)" strokeWidth="1" />
    </svg>
  );
}

function TopNav({ active = 'swipe' }: { active?: string }) {
  return (
    <nav className="cst-nav">
      {NAV_ITEMS.map(n => (
        <a key={n.id} className={n.id === active ? 'on' : ''} href="#">
          <span className="cst-nav-num">{n.num}</span>{n.label}
        </a>
      ))}
    </nav>
  );
}

function ModeSelector({ mode, setMode }: { mode: SwipeMode; setMode: (m: SwipeMode) => void }) {
  return (
    <div className="cst-modes">
      {MODES.map(m => (
        <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
          <span style={{ marginLeft: 14 }}>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function ActionDock({ onAction }: { onAction: (v: 'reject' | 'skip' | 'valid' | 'back') => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 28 }}>
      <div className="cst-action" onClick={() => onAction('reject')}>
        <div className="knob knob--reject"><IconReject /></div>
        <div className="label">Rejeter</div>
        <span className="key">←</span>
      </div>
      <div className="cst-action" onClick={() => onAction('skip')}>
        <div className="knob knob--skip"><IconSkip /></div>
        <div className="label">Passer</div>
        <span className="key">↑</span>
      </div>
      <div className="cst-action" onClick={() => onAction('valid')}>
        <div className="knob knob--valid"><IconValid /></div>
        <div className="label">Valider</div>
        <span className="key">→</span>
      </div>
      <div className="cst-action" onClick={() => onAction('back')} style={{ marginLeft: 14 }}>
        <div className="knob knob--back"><IconBack /></div>
        <div className="label" style={{ fontSize: 9 }}>Retour</div>
        <span className="key">⌫</span>
      </div>
    </div>
  );
}

function LeftRail({ counts, time }: { counts: ReturnType<typeof useSwipeDeck>['counts']; time: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="cst-panel cst-cut" style={{ padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="cst-label">JOURNAL · {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()}</span>
          <Led />
        </div>
        <div className="cst-stat-row"><span>VALIDÉS</span><strong style={{ color: 'var(--green)' }}>+{counts.valid}</strong></div>
        <div className="cst-stat-row"><span>REJETÉS</span><strong style={{ color: 'var(--red)' }}>−{counts.reject}</strong></div>
        <div className="cst-stat-row"><span>PASSÉS</span><strong style={{ color: 'var(--phos-dim)' }}>~{counts.skip}</strong></div>
        <div className="cst-stat-row" style={{ borderBottom: 'none' }}>
          <span>FAVORIS</span><strong style={{ color: 'var(--amber)' }}>{counts.favs}</strong>
        </div>
      </div>

      <div className="cst-panel cst-cut" style={{ padding: '12px 14px' }}>
        <div className="cst-tag" style={{ marginBottom: 6 }}>HORLOGE LOCALE</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 42, color: 'var(--phos-bright)', letterSpacing: '0.04em', textShadow: '0 0 12px var(--phos-deep)' }}>{time}</div>
        <div className="cst-tag" style={{ color: 'var(--phos-dim)' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
        </div>
      </div>

      <div className="cst-panel cst-cut" style={{ padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="cst-label">UNIVERS · ÉTAT</span>
          <span className="cst-tag" style={{ color: 'var(--phos)' }}>STABLE</span>
        </div>
        <div className="cst-tag" style={{ marginBottom: 4 }}>SATURATION CHROMATIQUE</div>
        <SegBar count={20} filled={13} />
        <div style={{ marginTop: 10 }}>
          <div className="cst-tag" style={{ marginBottom: 4 }}>CONNEXIONS LATENTES</div>
          <SegBar count={20} filled={9} warn />
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="cst-tag" style={{ marginBottom: 4 }}>DENSITÉ RÉCENTE ▲</div>
          <MiniBars values={[3, 5, 7, 4, 9, 12, 8, 11, 15, 9, 12, 14]} />
        </div>
      </div>
    </div>
  );
}

function RightRail({ history }: { history: ReturnType<typeof useSwipeDeck>['history'] }) {
  const nodes = [
    { x: 22, y: 28, c: 'oklch(58% 0.16 260)', size: 10 },
    { x: 38, y: 56, c: 'oklch(48% 0.18 330)', size: 14 },
    { x: 65, y: 30, c: 'oklch(68% 0.18 155)', size: 11 },
    { x: 72, y: 64, c: 'oklch(70% 0.18 50)', size: 9 },
    { x: 50, y: 42, c: 'oklch(86% 0.17 135)', size: 18, glow: true },
    { x: 18, y: 70, c: 'oklch(65% 0.25 350)', size: 8 },
    { x: 84, y: 18, c: 'oklch(60% 0.24 295)', size: 12 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="cst-panel cst-cut" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="cst-label">MAP · CARTOGRAPHIE</span>
          <span className="cst-tag">137 NŒUDS</span>
        </div>
        <div className="cst-map-mini cst-panel--inset" style={{ height: 168, position: 'relative' }}>
          {nodes.map((n, i) => (
            <span key={i} style={{
              position: 'absolute', left: `${n.x}%`, top: `${n.y}%`,
              width: n.size, height: n.size, transform: 'translate(-50%, -50%)',
              borderRadius: '50%', background: n.c,
              boxShadow: n.glow ? `0 0 16px ${n.c}, 0 0 4px ${n.c}` : `0 0 6px ${n.c}`,
              border: '1px solid oklch(10% 0.01 150)',
            }} />
          ))}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <line x1="22%" y1="28%" x2="50%" y2="42%" stroke="oklch(35% 0.06 145 / 0.7)" strokeWidth="1" strokeDasharray="2 3" />
            <line x1="65%" y1="30%" x2="50%" y2="42%" stroke="oklch(35% 0.06 145 / 0.7)" strokeWidth="1" strokeDasharray="2 3" />
            <line x1="38%" y1="56%" x2="50%" y2="42%" stroke="oklch(35% 0.06 145 / 0.7)" strokeWidth="1" strokeDasharray="2 3" />
          </svg>
          <span style={{ position: 'absolute', top: 6, left: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-deep)', letterSpacing: '.15em' }}>SECT. 04-N</span>
          <span style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--phos-deep)', letterSpacing: '.15em' }}>ZOOM 0.42×</span>
        </div>
      </div>

      <div className="cst-panel cst-cut" style={{ padding: '12px 14px' }}>
        <div className="cst-label" style={{ marginBottom: 8 }}>FLUX RÉCENT</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {history.length === 0 && (
            <div className="cst-tag" style={{ color: 'var(--phos-deep)', fontStyle: 'italic' }}>Aucune interaction encore…</div>
          )}
          {history.map((h, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontFamily: 'var(--mono)', fontSize: 11,
              color: h.verdict === 'valid' ? 'var(--green)' : h.verdict === 'reject' ? 'var(--red)' : 'var(--phos-dim)',
              padding: '3px 0',
              borderBottom: i < history.length - 1 ? '1px dashed oklch(20% 0.02 150)' : 'none',
            }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 14, fontSize: 14 }}>{h.verdict === 'valid' ? '+' : h.verdict === 'reject' ? '−' : '~'}</span>
                <span style={{ color: 'oklch(82% 0.04 80)' }}>{h.name}</span>
              </span>
              <span className="cst-tag" style={{ fontSize: 9 }}>{h.t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="cst-panel cst-cut" style={{ padding: '12px 14px' }}>
        <div className="cst-label" style={{ marginBottom: 8 }}>CONSEIL OPÉRATEUR</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.5, color: 'oklch(80% 0.04 80)' }}>
          <span style={{ color: 'var(--amber)' }}>›</span> Utilisez <span style={{ color: 'var(--phos)' }}>↑ PASSER</span> pour remettre une carte à plus tard sans la rejeter définitivement.
        </div>
      </div>
    </div>
  );
}

function StatusBar({ mode }: { mode: SwipeMode }) {
  const modeMeta = MODES.find(m => m.id === mode);
  const ticks = '▸ SYNC OK · WIKIDATA ✓ · GLISSEZ POUR DÉCIDER · ESPACE = PASSE · ← REJETER · → GARDER · ⌫ ANNULER · ';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 12px',
      borderTop: '1px solid var(--line-bright)',
      background: 'oklch(11% 0.013 150)',
      fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em',
      color: 'var(--phos-dim)', textTransform: 'uppercase', minHeight: 26,
    }}>
      <Led tone="amber" />
      <span style={{ color: 'var(--amber)' }}>MODE: {modeMeta?.sub}</span>
      <span style={{ color: 'var(--phos-deep)' }}>|</span>
      <div className="cst-marquee" style={{ flex: 1 }}>
        <span>{ticks}{ticks}</span>
      </div>
      <span style={{ color: 'var(--phos-deep)' }}>|</span>
      <span>v0.1.0-φ</span>
    </div>
  );
}

export function SwipeScreen() {
  const [mode, setMode] = useState<SwipeMode>('random');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(true);

  const swipe = useSwipeDeck(FALLBACK_CONCEPTS);

  // Live clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // Load Wikidata concepts
  useEffect(() => {
    fetchRandomConcepts(8)
      .then(concepts => {
        if (concepts.length > 0) swipe.setDeck(concepts);
      })
      .catch(() => { /* keep fallback */ })
      .finally(() => setLoading(false));
  }, []);

  const handleAction = (v: 'reject' | 'skip' | 'valid' | 'back') => {
    if (v === 'back') swipe.back();
    else swipe.cycle(v);
  };

  const current = swipe.current;

  return (
    <div className="cst-frame" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '10px 22px',
        borderBottom: '1px solid var(--line-bright)',
        background: 'linear-gradient(180deg, oklch(16% 0.02 150), oklch(11% 0.013 150))',
        boxShadow: 'inset 0 -1px 0 oklch(40% 0.08 145 / 0.18)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ConstellationLogo />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 0.9, letterSpacing: '0.06em', color: 'var(--phos-bright)', textShadow: '0 0 8px var(--phos-deep)' }}>CONSTELLATION</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.24em', color: 'var(--phos-dim)' }}>TERMINAL PERSONNEL · v0.1.0-φ</div>
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: 'var(--line-bright)', margin: '0 4px' }} />
        <TopNav active="swipe" />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Led tone="phos" /><Led tone="amber" /><Led tone="phos" on={false} />
          </div>
        </div>
      </header>

      {/* Mode selector strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderBottom: '1px solid var(--line)', background: 'oklch(13% 0.015 150)', flexShrink: 0 }}>
        <span className="cst-label" style={{ whiteSpace: 'nowrap' }}>SÉLECTEUR DE MODE ›</span>
        <div style={{ flex: 1 }}><ModeSelector mode={mode} setMode={setMode} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="cst-tag">FILE D'ATTENTE</span>
          <div className="cst-panel cst-panel--inset" style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--amber)', lineHeight: 1 }}>
              {loading ? '···' : String(swipe.deck.length).padStart(3, '0')}
            </span>
            <span className="cst-tag">CONCEPTS</span>
          </div>
        </div>
      </div>

      {/* Body 3 colonnes */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 320px', gap: 22, padding: '22px', overflow: 'hidden' }}>
        <LeftRail counts={swipe.counts} time={time} />

        {/* Centre */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 18, position: 'relative' }}>
          {/* Progress */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="cst-tag" style={{ color: 'var(--phos)' }}>
              ‹ {String(swipe.counts.valid + swipe.counts.reject + swipe.counts.skip + 1).padStart(3, '0')} / {String(swipe.deck.length).padStart(4, '0')} ›
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cst-tag">SESSION</span>
              <div style={{ width: 200 }}>
                <SegBar count={28} filled={Math.min(28, swipe.counts.valid + swipe.counts.reject + swipe.counts.skip)} />
              </div>
            </div>
            <div className="cst-tag" style={{ color: 'var(--phos)' }}>GLISSEZ POUR DÉCIDER</div>
          </div>

          {/* Card + stack */}
          <div style={{ position: 'relative', width: 480, maxWidth: '100%' }}>
            {swipe.particles.map(p => (
              <span key={p.id} className="cst-particle" style={{
                left: `${p.left}%`, top: `${p.top}%`,
                '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
              } as React.CSSProperties} />
            ))}

            {loading && !current ? (
              <div style={{ height: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: 'var(--phos-dim)', letterSpacing: '.12em' }}>CHARGEMENT…</div>
                <div className="cst-tag">INTERROGATION DE WIKIDATA</div>
                <SegBar count={20} filled={10} />
              </div>
            ) : current ? (
              <ConceptCard
                concept={current}
                tilt={swipe.tilt}
                dragOffset={swipe.drag}
                animClass={swipe.animClass}
                onPointerDown={swipe.onPointerDown}
              />
            ) : null}

            {/* Stack shadows */}
            <div style={{ position: 'absolute', inset: 0, zIndex: -1, transform: 'translate(8px, 12px) scale(0.985)', background: 'oklch(12% 0.01 150)', border: '1px solid oklch(22% 0.025 150)', borderRadius: 6 }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: -2, transform: 'translate(16px, 24px) scale(0.97)', background: 'oklch(11% 0.008 150)', border: '1px solid oklch(20% 0.02 150)', borderRadius: 6 }} />
          </div>

          <ActionDock onAction={handleAction} />
        </div>

        <RightRail history={swipe.history} />
      </div>

      <StatusBar mode={mode} />
    </div>
  );
}
