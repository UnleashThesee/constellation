import { useEffect, useState } from 'react';
import { CitButton } from './CitizenShell';
import type { Category } from '../../types';

interface Props {
  category: Category | null;
  open: boolean;
  onClose: () => void;
  onApply: (oklch: string) => void;
}

function parseOklch(str: string): { L: number; C: number; h: number } {
  const m = str.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) return { L: 50, C: 0.1, h: 0 };
  return { L: +m[1], C: +m[2], h: +m[3] };
}

const PRESETS = [
  'oklch(35% 0.13 250)', 'oklch(48% 0.20 25)',  'oklch(70% 0.16 88)',
  'oklch(50% 0.18 155)', 'oklch(45% 0.20 330)', 'oklch(60% 0.25 350)',
  'oklch(55% 0.22 28)',  'oklch(65% 0.18 50)',  'oklch(55% 0.24 295)',
  'oklch(42% 0.07 55)',  'oklch(68% 0.13 195)', 'oklch(78% 0.06 0)',
];

export function ColorPickerModal({ category, open, onClose, onApply }: Props) {
  const initial = category ? parseOklch(category.oklch) : { L: 50, C: 0.13, h: 250 };
  const [L, setL] = useState(initial.L);
  const [C, setC] = useState(initial.C);
  const [h, setHue] = useState(initial.h);

  useEffect(() => {
    if (category) {
      const p = parseOklch(category.oklch);
      setL(p.L); setC(p.C); setHue(p.h);
    }
  }, [category]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !category) return null;

  const currentCss = `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'oklch(0% 0 0 / 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 580, maxWidth: '100%',
        background: 'var(--cit-cream)',
        border: '3px solid var(--cit-navy-dk)',
        boxShadow: '8px 8px 0 var(--cit-navy-dk)',
      }}>
        <div style={{
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
          padding: '10px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-butter)' }}>
              ★ MODIFICATION D'UNE COULEUR OFFICIELLE
            </div>
            <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 26, lineHeight: 0.95 }}>
              {category.label}<span style={{ color: 'var(--cit-butter)' }}>!</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--cit-brick)', color: 'var(--cit-cream)',
            border: '2px solid var(--cit-cream)',
            fontFamily: "'Alfa Slab One', serif", fontSize: 14, padding: '0 8px',
            cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '180px 1fr', gap: 18 }}>
          <div>
            <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>APERÇU</div>
            <div style={{
              width: '100%', aspectRatio: '1/1',
              background: currentCss,
              border: '3px solid var(--cit-navy-dk)',
              boxShadow: 'inset 0 0 0 6px var(--cit-cream), inset 0 0 0 7px var(--cit-navy-dk), 4px 4px 0 var(--cit-navy-dk)',
            }}/>
            <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginTop: 6, textAlign: 'center', wordBreak: 'break-all' }}>
              {currentCss}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SliderRow label="TEINTE (H)" value={h} max={360} unit="°" onChange={setHue}/>
            <SliderRow label="CLARTÉ (L)" value={L} max={100} unit="%" onChange={setL}/>
            <SliderRow label="CHROMA (C)" value={C} max={0.4} step={0.01} unit="" decimals={2} onChange={setC}/>

            <div>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>
                ★ PALETTES PRÉ-CHOISIES
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {PRESETS.map(c => (
                  <button key={c} onClick={() => {
                    const p = parseOklch(c);
                    setL(p.L); setC(p.C); setHue(p.h);
                  }} style={{
                    width: 32, height: 32, background: c,
                    border: '2px solid var(--cit-navy-dk)',
                    boxShadow: '2px 2px 0 var(--cit-navy-dk)',
                    cursor: 'pointer', padding: 0,
                  }}/>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          padding: '12px 20px',
          background: 'var(--cit-paper-dk)',
          borderTop: '3px solid var(--cit-navy-dk)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <CitButton onClick={() => {
            const p = parseOklch(category.oklch);
            setL(p.L); setC(p.C); setHue(p.h);
          }}>Réinitialiser</CitButton>
          <CitButton tone="brick" onClick={() => { onApply(currentCss); onClose(); }}>
            ★ Appliquer
          </CitButton>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, max, step = 1, unit, decimals = 0, onChange }: {
  label: string; value: number; max: number; step?: number; unit: string; decimals?: number;
  onChange: (v: number) => void;
}) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginBottom: 4 }}>{label}</div>
      <div style={{ position: 'relative', height: 24, border: '2.5px solid var(--cit-navy-dk)', background: 'var(--cit-paper)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--cit-brick)', borderRight: '2px solid var(--cit-navy-dk)' }}/>
        <input type="range" min={0} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}/>
        <span style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 12,
          color: 'var(--cit-navy-dk)', textShadow: '1px 1px 0 var(--cit-cream)',
        }}>{value.toFixed(decimals)}{unit}</span>
      </div>
    </div>
  );
}
