import { useState, useEffect } from 'react';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { SwipeScreen } from './features/swipe/SwipeScreen';
import { getProfile } from './stores/db';

type AppState = 'loading' | 'onboarding' | 'app';

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

export default function App() {
  const [state, setState] = useState<AppState>('loading');

  useEffect(() => {
    getProfile().then(profile => {
      if (profile?.onboardingDone) setState('app');
      else setState('onboarding');
    }).catch(() => setState('onboarding'));
  }, []);

  if (state === 'loading') return <LoadingScreen />;
  if (state === 'onboarding') return <OnboardingScreen onComplete={() => setState('app')} />;
  return <SwipeScreen />;
}
