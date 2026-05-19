import { useState, useEffect } from 'react';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import {
  PostOnboardingHome, getSkipPostOnboarding, setSkipPostOnboarding, markPostOnboardingSeen, hasSeenPostOnboarding,
} from './features/onboarding/PostOnboardingHome';
import { SwipeScreen } from './features/swipe/SwipeScreen';
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
import { ToastProvider } from './lib/toast';
import { getProfile, getSettings } from './stores/db';
import { applyPaletteOverrides, CATEGORIES, CATEGORY_LIST } from './lib/categories';

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

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [tab, setTab] = useState<TabId>('swipe');

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

        const profile = await getProfile();
        if (!profile?.onboardingDone) { setState('onboarding'); return; }
        const skip = await getSkipPostOnboarding();
        const seen = await hasSeenPostOnboarding();
        // Show post-onboarding home only on first launch after onboarding completion
        if (!skip && !seen) { setState('post-onboarding'); await markPostOnboardingSeen(); }
        else setState('app');
      } catch {
        setState('onboarding');
      }
    })();
  }, []);

  const onTabChange = (id: string) => setTab(id as TabId);

  if (state === 'loading') return <LoadingScreen />;
  if (state === 'onboarding') return (
    <ToastProvider>
      <OnboardingScreen onComplete={() => setState('post-onboarding')} />
    </ToastProvider>
  );
  if (state === 'post-onboarding') return (
    <ToastProvider>
      <OfflineBanner/>
      <PostOnboardingHome
        onEnter={() => setState('app')}
        onSkipForever={async () => { await setSkipPostOnboarding(true); setState('app'); }}
      />
    </ToastProvider>
  );

  const screen = (() => {
    switch (tab) {
      case 'map':      return <MapScreen onTabChange={onTabChange} />;
      case 'combine':  return <CombinatorScreen onTabChange={onTabChange} />;
      case 'ideas':    return <IdeasScreen onTabChange={onTabChange} />;
      case 'favs':     return <FavsScreen onTabChange={onTabChange} />;
      case 'settings': return <SettingsScreen onTabChange={onTabChange} />;
      case 'stats':    return <StatsScreen onTabChange={onTabChange} />;
      case 'about':    return <AboutScreen onTabChange={onTabChange} />;
      case 'search':   return <SearchScreen onTabChange={onTabChange} />;
      case 'perso':    return <PersoScreen onTabChange={onTabChange} />;
      case 'combos':   return <CombosLibraryScreen onTabChange={onTabChange} />;
      case 'constraints': return <ConstraintsScreen onTabChange={onTabChange} />;
      case 'swipe':
      default:         return <SwipeScreen onTabChange={onTabChange} />;
    }
  })();

  return <ToastProvider><OfflineBanner/>{screen}</ToastProvider>;
}
