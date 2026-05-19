import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Aster } from '../components/ui/atoms';

export type ToastTone = 'success' | 'info' | 'warning';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  kicker?: string;
}

interface ToastContextValue {
  show: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => dismiss(id), 4800);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastHost toasts={toasts} dismiss={dismiss}/>
    </ToastContext.Provider>
  );
}

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 70, right: 28, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 12,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)}/>)}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const styles = {
    success: { bg: 'var(--cit-navy-dk)', fg: 'var(--cit-cream)', shadow: '6px 6px 0 var(--cit-brick)', kickerColor: 'var(--cit-butter)' },
    info:    { bg: 'var(--cit-butter)',  fg: 'var(--cit-navy-dk)', shadow: '6px 6px 0 var(--cit-navy-dk)', kickerColor: 'var(--cit-navy-lt)' },
    warning: { bg: 'var(--cit-brick)',   fg: 'var(--cit-cream)',   shadow: '6px 6px 0 var(--cit-navy-dk)', kickerColor: 'var(--cit-butter)' },
  }[toast.tone];

  return (
    <div style={{
      width: 340,
      background: styles.bg, color: styles.fg,
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: styles.shadow,
      padding: '12px 14px',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
      position: 'relative', overflow: 'hidden', pointerEvents: 'auto',
    }}>
      {toast.tone === 'success' && (
        <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4, pointerEvents: 'none' }}/>
      )}
      {toast.tone === 'success'
        ? <Aster size={32}/>
        : <span style={{ fontSize: 24, fontFamily: "'Alfa Slab One', serif", color: toast.tone === 'warning' ? 'var(--cit-butter)' : 'var(--cit-navy-dk)' }}>
            {toast.tone === 'warning' ? '!' : '★'}
          </span>}
      <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
        <div className="cit-condensed" style={{ fontSize: 10, color: styles.kickerColor }}>
          {toast.kicker ?? (toast.tone === 'success' ? '★ NOTIFICATION DU BUREAU' : toast.tone === 'warning' ? 'ATTENTION' : 'ASTUCE')}
        </div>
        <div className={toast.tone === 'info' ? '' : 'cit-h1 cit-h1--reverse'} style={{
          fontSize: 16, lineHeight: 0.95, margin: '2px 0',
          color: styles.fg,
          fontFamily: toast.tone === 'info' ? "'Special Elite', monospace" : undefined,
        }}>
          {toast.title}{toast.tone !== 'info' && <span style={{ color: 'var(--cit-butter)' }}>!</span>}
        </div>
        {toast.body && (
          <div className="cit-typed" style={{ fontSize: 11, color: styles.fg, lineHeight: 1.45 }}>
            {toast.body}
          </div>
        )}
      </div>
      <button onClick={onClose} style={{
        background: 'transparent', color: styles.fg,
        border: `1.5px solid ${styles.fg}`,
        fontFamily: "'Alfa Slab One', serif", fontSize: 12, padding: '0 7px',
        cursor: 'pointer', position: 'relative', zIndex: 1,
      }}>✕</button>
    </div>
  );
}

