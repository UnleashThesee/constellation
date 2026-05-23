import { useState } from 'react';
import type { TabId } from '../../App';

interface Props {
  active: string;
  onChange: (id: TabId) => void;
}

const MAIN_TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'swipe',   label: 'Swipe',  icon: '✦' },
  { id: 'map',     label: 'Map',    icon: '◉' },
  { id: 'ideas',   label: 'Idées',  icon: '★' },
];

const PLUS_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'combine',     label: 'Générer des idées' },
  { id: 'favs',        label: 'Favoris' },
  { id: 'perso',       label: 'Étiquettes & Tags' },
  { id: 'combos',      label: 'Bibliothèque combinaisons' },
  { id: 'constraints', label: 'Bibliothèque contraintes' },
  { id: 'search',      label: 'Recherche manuelle' },
  { id: 'stats',       label: 'Statistiques' },
  { id: 'settings',    label: 'Réglages' },
  { id: 'about',       label: 'À propos & aide' },
];

export function MobileBottomNav({ active, onChange }: Props) {
  const [plusOpen, setPlusOpen] = useState(false);
  const isPlus = !MAIN_TABS.some(t => t.id === active);

  return (
    <>
      {/* Bottom nav (visible only on mobile, via CSS media query) */}
      <nav className="cit-mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--cit-cream)',
        borderTop: '3px solid var(--cit-navy-dk)',
        boxShadow: '0 -4px 0 var(--cit-navy-dk)',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        display: 'none',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {MAIN_TABS.map(t => {
            const on = active === t.id;
            return (
              <button key={t.id} onClick={() => onChange(t.id)} style={{
                padding: '10px 4px',
                background: on ? 'var(--cit-navy-dk)' : 'transparent',
                color: on ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
                border: 'none',
                borderTop: on ? '3px solid var(--cit-brick)' : '3px solid transparent',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
                letterSpacing: '.10em', textTransform: 'uppercase',
                minHeight: 56,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1, fontFamily: "'Alfa Slab One', serif" }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
          <button onClick={() => setPlusOpen(true)} style={{
            padding: '10px 4px',
            background: isPlus ? 'var(--cit-navy-dk)' : 'transparent',
            color: isPlus ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
            border: 'none',
            borderTop: isPlus ? '3px solid var(--cit-brick)' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700,
            letterSpacing: '.10em', textTransform: 'uppercase',
            minHeight: 56,
          }}>
            <span style={{ fontSize: 18, lineHeight: 1, fontFamily: "'Alfa Slab One', serif" }}>⋯</span>
            Plus
          </button>
        </div>
      </nav>

      {/* Plus drawer */}
      {plusOpen && (
        <div onClick={() => setPlusOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'oklch(0% 0 0 / 0.55)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%',
            background: 'var(--cit-cream)',
            border: '3px solid var(--cit-navy-dk)',
            borderBottom: 'none',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}>
            <div style={{
              background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
              padding: '12px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span className="cit-h1 cit-h1--reverse" style={{ fontSize: 18 }}>PLUS<span style={{ color: 'var(--cit-butter)' }}>!</span></span>
              <button onClick={() => setPlusOpen(false)} style={{
                background: 'var(--cit-brick)', color: 'var(--cit-cream)',
                border: '2px solid var(--cit-cream)',
                padding: '4px 10px',
                fontFamily: "'Alfa Slab One', serif", fontSize: 14, cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PLUS_TABS.map(t => {
                const on = active === t.id;
                return (
                  <button key={t.id} onClick={() => { onChange(t.id); setPlusOpen(false); }} style={{
                    padding: '14px 16px', textAlign: 'left',
                    background: on ? 'var(--cit-butter)' : 'var(--cit-paper)',
                    color: 'var(--cit-navy-dk)',
                    border: '2px solid var(--cit-navy-dk)',
                    boxShadow: on ? '3px 3px 0 var(--cit-brick)' : '2px 2px 0 var(--cit-navy-dk)',
                    cursor: 'pointer',
                    fontFamily: "'Alfa Slab One', serif", fontSize: 16,
                    minHeight: 56,
                  }}>★ {t.label}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
