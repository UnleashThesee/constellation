import { useState, useRef, useCallback, useEffect } from 'react';
import type { Concept, SwipeVerdict, SwipeHistoryEntry, SessionStats } from '../../types';
import { recordInteraction, cacheConcept } from '../../stores/db';

interface Particle { id: number; dx: number; dy: number; left: number; top: number; }

interface SwipeDeckState {
  current: Concept | undefined;
  deck: Concept[];
  history: SwipeHistoryEntry[];
  counts: SessionStats;
  animClass: string;
  tilt: 'right' | 'left' | 'up' | null;
  drag: { x: number; y: number };
  particles: Particle[];
  cycle: (verdict: SwipeVerdict) => void;
  back: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  setDeck: (concepts: Concept[]) => void;
  canBack: boolean;
}

const SESSION_ID = `session-${Date.now()}`;

export function useSwipeDeck(initialDeck: Concept[], onTap?: () => void): SwipeDeckState {
  const [deck, setDeckState] = useState<Concept[]>(initialDeck);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [counts, setCounts] = useState<SessionStats>({ valid: 0, reject: 0, skip: 0, favs: 0 });
  const [animClass, setAnimClass] = useState('');
  const [tilt, setTilt] = useState<'right' | 'left' | 'up' | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const animLock = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Sync deck when initialDeck changes (async load)
  useEffect(() => {
    if (initialDeck.length > 0 && deck.length === 0) {
      setDeckState(initialDeck);
    }
  }, [initialDeck]);

  const setDeck = useCallback((concepts: Concept[]) => {
    setDeckState(concepts);
  }, []);

  const cycle = useCallback((verdict: SwipeVerdict) => {
    if (animLock.current || !deck.length) return;
    animLock.current = true;

    const current = deck[0];
    const cls = verdict === 'valid' ? 'cst-fly--right'
      : verdict === 'reject' ? 'cst-fly--left'
      : verdict === 'skip' ? 'cst-fly--up' : '';

    setAnimClass(cls);

    if (verdict === 'valid') {
      const sparks = Array.from({ length: 12 }, (_, i) => ({
        id: Date.now() + i,
        dx: (Math.random() - 0.5) * 200,
        dy: (Math.random() - 0.5) * 200 - 40,
        left: 50 + (Math.random() - 0.5) * 60,
        top: 50 + (Math.random() - 0.5) * 40,
      }));
      setParticles(sparks);
      setTimeout(() => setParticles([]), 700);
    }

    // Persist concept then record interaction (fire and forget)
    cacheConcept(current).then(() => recordInteraction(current.id, verdict, SESSION_ID)).catch(() => {});

    setTimeout(() => {
      setDeckState(d => {
        const [head, ...rest] = d;
        return [...rest, head];
      });
      setCounts(c => ({
        ...c,
        valid:  verdict === 'valid'  ? c.valid  + 1 : c.valid,
        reject: verdict === 'reject' ? c.reject + 1 : c.reject,
        skip:   verdict === 'skip'   ? c.skip   + 1 : c.skip,
      }));
      setHistory(h => [{
        name: current.name.split(' ').pop() ?? current.name,
        verdict,
        t: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      }, ...h].slice(0, 6));
      setAnimClass('');
      setTilt(null);
      setDrag({ x: 0, y: 0 });
      animLock.current = false;
    }, 420);
  }, [deck]);

  const back = useCallback(() => {
    if (animLock.current || deck.length < 2) return;
    setDeckState(d => {
      const last = d[d.length - 1];
      return [last, ...d.slice(0, -1)];
    });
    setHistory(h => h.slice(1));
  }, [deck]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (animLock.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };

    const move = (ev: PointerEvent) => {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      setDrag({ x: dx, y: dy });
      if (dx > 60) setTilt('right');
      else if (dx < -60) setTilt('left');
      else if (dy < -60) setTilt('up');
      else setTilt(null);
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      dragStart.current = null;
      if (dx > 120) cycle('valid');
      else if (dx < -120) cycle('reject');
      else if (dy < -120) cycle('skip');
      else {
        setDrag({ x: 0, y: 0 }); setTilt(null);
        // Tap detection : no significant drag = treat as click → open detail
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) onTap?.();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [cycle, onTap]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') cycle('valid');
      else if (e.key === 'ArrowLeft') cycle('reject');
      else if (e.key === 'ArrowUp') cycle('skip');
      else if (e.key === 'Backspace') back();
      else if (e.key === ' ') { e.preventDefault(); cycle('skip'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycle, back]);

  return {
    current: deck[0],
    deck,
    history,
    counts,
    animClass,
    tilt,
    drag,
    particles,
    cycle,
    back,
    onPointerDown,
    setDeck,
    canBack: history.length > 0 && history.length <= 10,
  };
}
