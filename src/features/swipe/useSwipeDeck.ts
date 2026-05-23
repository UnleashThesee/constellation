import { useState, useRef, useCallback, useEffect } from 'react';
import type { Concept, SwipeVerdict, SwipeHistoryEntry, SessionStats } from '../../types';
import { recordVerdict } from '../../stores/db';
import { playSound } from '../../lib/sounds';

interface Particle { id: number; dx: number; dy: number; left: number; top: number; }

interface SwipeDeckState {
  current: Concept | undefined;
  deck: Concept[];
  history: SwipeHistoryEntry[];
  counts: SessionStats;
  animClass: string;
  tilt: 'right' | 'left' | 'up' | 'down' | null;
  drag: { x: number; y: number };
  particles: Particle[];
  cycle: (verdict: SwipeVerdict) => void;
  favorite: () => void;
  back: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  setDeck: (concepts: Concept[]) => void;
  appendDeck: (concepts: Concept[]) => void;
  canBack: boolean;
}

const SESSION_ID = `session-${Date.now()}`;

export function useSwipeDeck(initialDeck: Concept[], onTap?: () => void, getIncognito?: () => boolean): SwipeDeckState {
  const [deck, setDeckState] = useState<Concept[]>(initialDeck);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [counts, setCounts] = useState<SessionStats>({ valid: 0, reject: 0, skip: 0, favs: 0 });
  const [animClass, setAnimClass] = useState('');
  const [tilt, setTilt] = useState<'right' | 'left' | 'up' | 'down' | null>(null);
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

  // Ajoute des concepts inédits à la fin (sans perturber la carte courante)
  const appendDeck = useCallback((concepts: Concept[]) => {
    setDeckState(d => {
      const have = new Set(d.map(c => c.id));
      const add = concepts.filter(c => !have.has(c.id));
      return add.length ? [...d, ...add] : d;
    });
  }, []);

  const cycle = useCallback((verdict: SwipeVerdict) => {
    if (animLock.current || !deck.length) return;
    animLock.current = true;

    const current = deck[0];
    const cls = verdict === 'valid' ? 'cst-fly--right'
      : verdict === 'reject' ? 'cst-fly--left'
      : verdict === 'skip' ? 'cst-fly--down' : '';

    setAnimClass(cls);
    playSound(verdict === 'valid' ? 'adopt' : verdict === 'reject' ? 'reject' : 'skip');

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

    // Persiste le concept + le verdict atomiquement (transaction Dexie)
    recordVerdict(current, verdict, SESSION_ID, { private: getIncognito?.() }).catch(() => {});

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
  }, [deck, getIncognito]);

  // Favori (↑) = adopter ET marquer favori en une fois
  const favorite = useCallback(() => {
    if (animLock.current || !deck.length) return;
    animLock.current = true;
    const current = deck[0];
    setAnimClass('cst-fly--up');
    playSound('favorite');
    const sparks = Array.from({ length: 14 }, (_, i) => ({
      id: Date.now() + i,
      dx: (Math.random() - 0.5) * 220,
      dy: (Math.random() - 0.5) * 220 - 60,
      left: 50 + (Math.random() - 0.5) * 60,
      top: 50 + (Math.random() - 0.5) * 40,
    }));
    setParticles(sparks);
    setTimeout(() => setParticles([]), 700);
    recordVerdict(current, 'valid', SESSION_ID, { favorite: true, private: getIncognito?.() }).catch(() => {});
    setTimeout(() => {
      setDeckState(d => { const [head, ...rest] = d; return [...rest, head]; });
      setCounts(c => ({ ...c, valid: c.valid + 1, favs: c.favs + 1 }));
      setHistory(h => [{
        name: current.name.split(' ').pop() ?? current.name,
        verdict: 'valid' as SwipeVerdict,
        t: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      }, ...h].slice(0, 6));
      setAnimClass('');
      setTilt(null);
      setDrag({ x: 0, y: 0 });
      animLock.current = false;
    }, 420);
  }, [deck, getIncognito]);

  const back = useCallback(() => {
    if (animLock.current || deck.length < 2) return;
    playSound('back');
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
      else if (dy > 60) setTilt('down');
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
      else if (dy < -120) favorite();
      else if (dy > 120) cycle('skip');
      else {
        setDrag({ x: 0, y: 0 }); setTilt(null);
        // Tap detection : no significant drag = treat as click → open detail
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) onTap?.();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [cycle, favorite, onTap]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') cycle('valid');
      else if (e.key === 'ArrowLeft') cycle('reject');
      else if (e.key === 'ArrowUp') favorite();
      else if (e.key === 'ArrowDown') cycle('skip');
      else if (e.key === 'Backspace') back();
      else if (e.key === ' ') { e.preventDefault(); cycle('skip'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycle, favorite, back]);

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
    favorite,
    back,
    onPointerDown,
    setDeck,
    appendDeck,
    canBack: history.length > 0 && history.length <= 10,
  };
}
