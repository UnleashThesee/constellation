import type { ReactNode } from 'react';
import { FileSeal } from './atoms';

const CITIZEN_TABS = [
  { id: 'swipe',    label: '★ Le Swipe' },
  { id: 'garden',   label: 'Jardin' },
  { id: 'map',      label: 'Cartographie' },
  { id: 'ideas',    label: 'Idées' },
  { id: 'favs',     label: 'Favoris' },
  { id: 'settings', label: 'Réglages' },
];

export function CitizenTabs({ active = 'swipe', onChange }: { active?: string; onChange?: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
      {CITIZEN_TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange?.(t.id)}
          className={`cit-tab ${t.id === active ? 'cit-tab--active' : 'cit-tab--muted'}`}
          style={{ cursor: 'pointer', border: '2px solid var(--cit-navy-dk)', borderBottom: 'none' }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function CitizenMasthead({ kicker, title, exclamation = '!', subtitle, right, active = 'swipe', onTabChange }: {
  kicker?: string; title: string; exclamation?: string; subtitle?: string;
  right?: React.ReactNode; active?: string; onTabChange?: (id: string) => void;
}) {
  return (
    <div style={{ position: 'relative', padding: '14px 32px 0', zIndex: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FileSeal size={54} />
          <div>
            {kicker && (
              <div className="cit-script" style={{ fontSize: 28, lineHeight: 0.85, color: 'var(--cit-navy)' }}>
                {kicker}
              </div>
            )}
            <div className="cit-h1" style={{ fontSize: 42, lineHeight: 0.9, color: 'var(--cit-navy-dk)' }}>
              {title}<span style={{ color: 'var(--cit-brick)' }}>{exclamation}</span>
            </div>
            <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginTop: 4 }}>
              {subtitle ?? 'CONSTELLATION · BUREAU DE L\'EXPLORATION COGNITIVE · ÉDITION DU SOIR'}
            </div>
          </div>
        </div>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{right}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
        <CitizenTabs active={active} onChange={onTabChange} />
        <div style={{ flex: 1 }} />
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', paddingBottom: 4 }}>
          VOL. III · NUMÉRO 042 · MAI 1957
        </div>
      </div>
      <div style={{ borderBottom: '4px solid var(--cit-navy-dk)' }} />
    </div>
  );
}

export function CitizenFooter({ left, right }: { left?: string; right?: string }) {
  return (
    <div style={{
      padding: '8px 32px',
      background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
      borderTop: '3px solid var(--cit-navy-dk)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      zIndex: 3, position: 'relative',
      fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: '.22em',
      fontWeight: 600, textTransform: 'uppercase',
    }}>
      <span>{left ?? '★ CONSTELLATION · BUREAU 4-N · v0.1.0 · IMPRIMÉ EN FRANCE ★'}</span>
      {right && <span style={{ color: 'var(--cit-cream)' }}>{right}</span>}
    </div>
  );
}

export function CitButton({ children, tone, onClick, size = 'md', kbd, icon, style, disabled }: {
  children: ReactNode; tone?: 'brick' | 'butter' | 'navy';
  onClick?: () => void; size?: 'sm' | 'md'; kbd?: string; icon?: ReactNode; style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const cls = tone === 'brick' ? 'cit-btn--brick' : tone === 'butter' ? 'cit-btn--butter' : tone === 'navy' ? 'cit-btn--navy' : '';
  return (
    <button
      className={`cit-btn ${cls}`}
      onClick={onClick}
      disabled={disabled}
      style={{ padding: size === 'sm' ? '6px 12px' : '10px 18px', fontSize: size === 'sm' ? 13 : 16, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      {icon && <span style={{ width: '1em', height: '1em', display: 'inline-flex', alignItems: 'center', marginRight: 6 }}>{icon}</span>}
      <span>{children}</span>
      {kbd && (
        <span style={{ marginLeft: 4, fontFamily: "'Special Elite', monospace", fontSize: 10, border: '1.5px solid currentColor', padding: '1px 5px', opacity: 0.75 }}>
          {kbd}
        </span>
      )}
    </button>
  );
}

export function CitPanel({ title, accent = 'cream', shadow = true, children, style }: {
  title?: ReactNode; accent?: 'cream' | 'butter' | 'navy' | 'brick';
  shadow?: boolean; children: React.ReactNode; style?: React.CSSProperties;
}) {
  const bg = accent === 'butter' ? 'var(--cit-butter)' : accent === 'navy' ? 'var(--cit-navy-dk)' : accent === 'brick' ? 'var(--cit-brick)' : 'var(--cit-cream)';
  const fg = (accent === 'navy' || accent === 'brick') ? 'var(--cit-cream)' : 'var(--cit-navy-dk)';
  return (
    <div style={{ background: bg, color: fg, border: '3px solid var(--cit-navy-dk)', boxShadow: shadow ? '5px 5px 0 var(--cit-navy-dk)' : 'none', ...style }}>
      {title && (
        <div style={{
          background: accent === 'navy' ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
          color: accent === 'navy' ? 'var(--cit-navy-dk)' : 'var(--cit-butter)',
          padding: '5px 12px', fontFamily: "'Alfa Slab One', serif",
          fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {title}
        </div>
      )}
      <div style={{ padding: '10px 14px' }}>{children}</div>
    </div>
  );
}
