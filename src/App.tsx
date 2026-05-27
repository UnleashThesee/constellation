import { useState, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { SwipeScreen } from './features/swipe/SwipeScreen';
import { SwipeScreenV3 } from './features/swipe/SwipeScreenV3';
import { MapScreen } from './features/map/MapScreen';
import { CombinatorScreen } from './features/combinator/CombinatorScreen';
import { IdeasScreen } from './features/ideas/IdeasScreen';
import { FavsScreen } from './features/favs/FavsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { StatsScreen } from './features/stats/StatsScreen';
import { AboutScreen } from './features/about/AboutScreen';
import { SearchScreen } from './features/search/SearchScreen';
import { PersoScreen } from './features/perso/PersoScreen';
import { CombosLibraryScreen } from './features/combos/CombosLibraryScreen';
import { ConstraintsScreen } from './features/constraints/ConstraintsScreen';
import { BoostModal } from './features/boost/BoostModal';
import { setPendingSwipeDeck } from './lib/pending';
import { MobileBottomNav } from './components/ui/MobileBottomNav';
import { ToastProvider } from './lib/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getProfile, saveProfile, getSettings, saveSettings, runMaintenance } from './stores/db';
import { applyPaletteOverrides, CATEGORIES, CATEGORY_LIST } from './lib/categories';

const THEME_CLASSES = ['theme-cit-phos', 'theme-cit-amber', 'theme-cit-dossier', 'theme-cit-bristol'];
export function applyThemeClass(theme: string): void {
  if (typeof document === 'undefined') return;
  THEME_CLASSES.forEach(c => document.body.classList.remove(c));
  // 'citizen' (par défaut) = aucune classe ; les autres = classe correspondante
  if (theme === 'phos') document.body.classList.add('theme-cit-phos');
  else if (theme === 'amber') document.body.classList.add('theme-cit-amber');
  else if (theme === 'dossier') document.body.classList.add('theme-cit-dossier');
  else if (theme === 'bristol') document.body.classList.add('theme-cit-bristol');
}

type AppState = 'loading' | 'onboarding' | 'post-onboarding' | 'app';
export type TabId =
  | 'swipe' | 'map' | 'combine' | 'ideas' | 'favs' | 'settings'
  | 'stats' | 'about' | 'search' | 'perso' | 'combos' | 'constraints';

function LoadingScreen() {
  return (
    <div className="cst-frame" style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <svg width="64" height="64" viewBox="0 0 28 28" style={{ filter: 'drop-shadow(0 0 12px var(--phos))' }}>
        <circle cx="14" cy="14" r="11" fill="none" stroke="var(--phos)" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="var(--phos)" />
        {[0, 72, 144, 216, 288].map(a => {
          const rad = (a * Math.PI) / 180;
          const x = 14 + Math.cos(rad) * 11;
          const y = 14 + Math.sin(rad) * 11;
          return <circle key={a} cx={x} cy={y} r="2" fill="var(--phos)" />;
        })}
      </svg>
      <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.06em', color: 'var(--phos-bright)', textShadow: '0 0 16px var(--phos-deep)' }}>
        CONSTELLATION
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.24em', color: 'var(--phos-dim)', textTransform: 'uppercase' }}>
        Initialisation du terminal…
      </div>
    </div>
  );
}

// Choisit l'interface Swipe (v2 classique / v3 cartouche) selon les Réglages.
// La route se remonte à chaque navigation vers /swipe, donc le choix est relu.
function SwipeRoute({ onTabChange }: { onTabChange?: (id: string) => void }) {
  const [ui, setUi] = useState<'v2' | 'v3' | null>(null);
  useEffect(() => { getSettings().then(s => setUi(s?.swipeUi === 'v3' ? 'v3' : 'v2')); }, []);
  if (ui === null) return null;
  return ui === 'v3'
    ? <SwipeScreenV3 onTabChange={onTabChange} />
    : <SwipeScreen onTabChange={onTabChange} />;
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
      background: 'var(--cit-brick)', color: 'var(--cit-cream)',
      padding: '6px 18px', textAlign: 'center',
      fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700,
      letterSpacing: '.14em', textTransform: 'uppercase',
      borderBottom: '3px solid var(--cit-navy-dk)',
      boxShadow: '0 4px 0 var(--cit-navy-dk)',
    }}>
      ★ HORS-LIGNE · LE BUREAU FONCTIONNE SUR CACHE LOCAL UNIQUEMENT ★
    </div>
  );
}

const VALID_TABS: TabId[] = [
  'swipe', 'map', 'combine', 'ideas', 'favs', 'settings',
  'stats', 'about', 'search', 'perso', 'combos', 'constraints',
];

function tabFromPath(pathname: string): TabId {
  const seg = pathname.replace(/^\/+/, '').split('/')[0];
  return VALID_TABS.includes(seg as TabId) ? seg as TabId : 'swipe';
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const navigate = useNavigate();
  const location = useLocation();
  const tab = tabFromPath(location.pathname);

  const setTab = (t: TabId) => navigate(`/${t}`);
  const onTabChange = (id: string) => navigate(`/${id}`);

  // Tracking du temps d'usage : accumule dans settings.totalUsageMs
  useEffect(() => {
    if (state !== 'app') return;
    const start = Date.now();
    let stopped = false;
    const flush = async () => {
      if (stopped) return;
      stopped = true;
      const elapsed = Date.now() - start;
      const s = await getSettings();
      const prev = s?.totalUsageMs ?? 0;
      await saveSettings({ totalUsageMs: prev + elapsed });
    };
    // Sauvegarde quand l'onglet devient invisible (changement d'onglet, fermeture)
    const onVis = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        // Apply user palette overrides before rendering any colored UI
        const settings = await getSettings();
        if (settings?.chromaticEnabled === false) {
          CATEGORY_LIST.forEach(c => { CATEGORIES[c.key].oklch = 'oklch(45% 0.04 250)'; });
        } else {
          applyPaletteOverrides(settings?.paletteOverrides);
        }
        // Apply theme class on <body>
        applyThemeClass(typeof settings?.theme === 'string' ? settings.theme : 'citizen');

        // Maintenance best-effort (caches expirés, orphelins) — non bloquant
        runMaintenance();

        const profile = await getProfile();
        if (!profile?.onboardingDone) {
          // Plus d'onboarding/quizz : on initialise silencieusement et on entre direct.
          await saveProfile({ onboardingDone: true }).catch(() => {});
        }
        setState('app');
      } catch {
        setState('app');
      }
    })();
  }, []);

  if (state === 'loading') return <LoadingScreen />;

  const screen = (
    <Routes>
      <Route path="/map" element={<MapScreen onTabChange={onTabChange} />} />
      <Route path="/combine" element={<CombinatorScreen onTabChange={onTabChange} />} />
      <Route path="/ideas" element={<IdeasScreen onTabChange={onTabChange} />} />
      <Route path="/favs" element={<FavsScreen onTabChange={onTabChange} />} />
      <Route path="/settings" element={<SettingsScreen onTabChange={onTabChange} />} />
      <Route path="/stats" element={<StatsScreen onTabChange={onTabChange} />} />
      <Route path="/about" element={<AboutScreen onTabChange={onTabChange} />} />
      <Route path="/search" element={<SearchScreen onTabChange={onTabChange} />} />
      <Route path="/perso" element={<PersoScreen onTabChange={onTabChange} />} />
      <Route path="/combos" element={<CombosLibraryScreen onTabChange={onTabChange} />} />
      <Route path="/constraints" element={<ConstraintsScreen onTabChange={onTabChange} />} />
      <Route path="/swipe" element={<SwipeRoute onTabChange={onTabChange} />} />
      <Route path="*" element={<Navigate to="/swipe" replace />} />
    </Routes>
  );

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <OfflineBanner/>
        <ErrorBoundary key={tab} label={tab} onReset={() => setTab('swipe')}>
          {screen}
        </ErrorBoundary>
        <BoostModal onLaunchSeries={(deck, anchor) => {
          setPendingSwipeDeck(deck, `Série liée à ${anchor.name}`);
          setTab('swipe');
        }}/>
        <MobileBottomNav active={tab} onChange={onTabChange}/>
      </ToastProvider>
    </MotionConfig>
  );
}
