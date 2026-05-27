import { useState, useRef, useCallback, useEffect } from 'react';
import type { Concept, SwipeVerdict, SwipeHistoryEntry, SessionStats } from '../../types';
import { recordVerdict } from '../../stores/db';
import { playSound } from '../../lib/sounds';

interface Particle { id: number; dx: number; dy: number; left: number; top: number; }

export interface TreatedEntry { concept: Concept; verdict: SwipeVerdict; fav: boolean }

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
  treatedIds: Set<string>;
  // File des cartes traitées (ordre chronologique) pour l'affichage de la queue.
  treatedLog: TreatedEntry[];
}

const SESSION_ID = `session-${Date.now()}`;

export interface CommittedSwipe { concept: Concept; verdict: SwipeVerdict; fav: boolean }

export function useSwipeDeck(
  initialDeck: Concept[],
  onTap?: () => void,
  getIncognito?: () => boolean,
  onCommitted?: (e: CommittedSwipe) => void,
): SwipeDeckState {
  const [deck, setDeckState] = useState<Concept[]>(initialDeck);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [counts, setCounts] = useState<SessionStats>({ valid: 0, reject: 0, skip: 0, favs: 0 });
  const [animClass, setAnimClass] = useState('');
  const [tilt, setTilt] = useState<'right' | 'left' | 'up' | 'down' | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const animLock = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  // Pile des cartes traitées (pour l'annulation). Les cartes traitées sont
  // RETIRÉES de la pioche — jamais remises en queue — pour ne pas reboucler.
  const treatedRef = useRef<TreatedEntry[]>([]);
  // Journal d'affichage (state → re-render de la queue). Borné pour la mémoire ;
  // en lockstep avec treatedRef (push au swipe, pop à l'annulation).
  const [treatedLog, setTreatedLog] = useState<TreatedEntry[]>([]);
  // Ensemble (non borné) de tous les ids déjà jugés cette session : permet de
  // filtrer toute reconstruction de pioche pour ne jamais re-présenter une carte.
  const treatedIdsRef = useRef<Set<string>>(new Set());
  // Miroir synchrone de la pioche : `cycle`/`favorite` lisent la tête ICI (et
  // non dans la closure) pour ne jamais agir sur une carte périmée. Maintenu à
  // jour DANS l'updater de state → toujours cohérent avec ce qui est commité.
  const deckRef = useRef<Concept[]>(initialDeck);
  const writeDeck = useCallback((next: Concept[] | ((d: Concept[]) => Concept[])) => {
    setDeckState(prev => {
      const v = typeof next === 'function' ? (next as (d: Concept[]) => Concept[])(prev) : next;
      deckRef.current = v;
      return v;
    });
  }, []);
  // Miroirs des callbacks-props (recréés à chaque rendu côté appelant) pour que
  // cycle/favorite/onPointerDown gardent une identité STABLE : sinon le listener
  // clavier se re-attache à chaque rendu, rouvrant la fenêtre de course.
  const onTapRef = useRef(onTap); onTapRef.current = onTap;
  const getIncognitoRef = useRef(getIncognito); getIncognitoRef.current = getIncognito;
  const onCommittedRef = useRef(onCommitted); onCommittedRef.current = onCommitted;

  // Sync deck when initialDeck changes (async load)
  useEffect(() => {
    if (initialDeck.length > 0 && deck.length === 0) {
      writeDeck(initialDeck);
    }
  }, [initialDeck]);

  const setDeck = useCallback((concepts: Concept[]) => {
    writeDeck(concepts);
  }, [writeDeck]);

  // Ajoute des concepts inédits à la fin (sans perturber la carte courante)
  const appendDeck = useCallback((concepts: Concept[]) => {
    writeDeck(d => {
      const have = new Set(d.map(c => c.id));
      // On exclut aussi les cartes déjà traitées : l'appelant filtre AVANT
      // ses `await` (cache), mais un swipe peut survenir pendant ce délai —
      // ce dernier filtre, évalué au commit, ferme la course.
      const add = concepts.filter(c => !have.has(c.id) && !treatedIdsRef.current.has(c.id));
      return add.length ? [...d, ...add] : d;
    });
  }, [writeDeck]);

  const cycle = useCallback((verdict: SwipeVerdict) => {
    if (animLock.current) return;
    const current = deckRef.current[0];
    if (!current) return;
    animLock.current = true;

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
    recordVerdict(current, verdict, SESSION_ID, { private: getIncognitoRef.current?.() }).catch(() => {});
    onCommittedRef.current?.({ concept: current, verdict, fav: false });

    setTimeout(() => {
      writeDeck(d => (d[0]?.id === current.id ? d.slice(1) : d.filter(c => c.id !== current.id)));
      treatedRef.current = [...treatedRef.current, { concept: current, verdict, fav: false }].slice(-6);
      treatedIdsRef.current.add(current.id);
      setTreatedLog(l => [...l, { concept: current, verdict, fav: false }].slice(-60));
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
  }, [writeDeck]);

  // Favori (↑) = adopter ET marquer favori en une fois
  const favorite = useCallback(() => {
    if (animLock.current) return;
    const current = deckRef.current[0];
    if (!current) return;
    animLock.current = true;
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
    recordVerdict(current, 'valid', SESSION_ID, { favorite: true, private: getIncognitoRef.current?.() }).catch(() => {});
    onCommittedRef.current?.({ concept: current, verdict: 'valid', fav: true });
    setTimeout(() => {
      writeDeck(d => (d[0]?.id === current.id ? d.slice(1) : d.filter(c => c.id !== current.id)));
      treatedRef.current = [...treatedRef.current, { concept: current, verdict: 'valid' as SwipeVerdict, fav: true }].slice(-6);
      treatedIdsRef.current.add(current.id);
      setTreatedLog(l => [...l, { concept: current, verdict: 'valid' as SwipeVerdict, fav: true }].slice(-60));
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
  }, [writeDeck]);

  const back = useCallback(() => {
    if (animLock.current || treatedRef.current.length === 0) return;
    playSound('back');
    const last = treatedRef.current[treatedRef.current.length - 1];
    treatedRef.current = treatedRef.current.slice(0, -1);
    treatedIdsRef.current.delete(last.concept.id);
    setTreatedLog(l => l.slice(0, -1));
    writeDeck(d => [last.concept, ...d.filter(c => c.id !== last.concept.id)]);
    setCounts(c => ({
      valid:  c.valid  - (last.verdict === 'valid'  ? 1 : 0),
      reject: c.reject - (last.verdict === 'reject' ? 1 : 0),
      skip:   c.skip   - (last.verdict === 'skip'   ? 1 : 0),
      favs:   c.favs   - (last.fav ? 1 : 0),
    }));
    setHistory(h => h.slice(1));
  }, [writeDeck]);

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
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) onTapRef.current?.();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [cycle, favorite]);

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
    treatedIds: treatedIdsRef.current,
    treatedLog,
  };
}
