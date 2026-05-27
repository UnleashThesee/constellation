import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { CitizenMasthead, CitizenFooter } from '../../components/ui/CitizenShell';
import { getAdoptedConcepts, getConceptsByVerdict } from '../../stores/db';
import type { Concept } from '../../types';

interface Props { onTabChange?: (id: string) => void }

// Palette + glyphe placeholder par catégorie (en attendant les sprites IA).
const CAT_STYLE: Record<string, { color: number; glyph: string }> = {
  philosophie: { color: 0x4b4a8a, glyph: '💡' },
  sciences:    { color: 0x2f8a5f, glyph: '🔬' },
  humaines:    { color: 0xc09a4a, glyph: '👥' },
  economie:    { color: 0xc8a13a, glyph: '💰' },
  litterature: { color: 0x9a3b7a, glyph: '📖' },
  arts:        { color: 0xc8527e, glyph: '🎨' },
  musique:     { color: 0xc85638, glyph: '🎵' },
  cinema:      { color: 0xc8802f, glyph: '🎬' },
  jeuvideo:    { color: 0x7a52c8, glyph: '🎮' },
  histoire:    { color: 0x8a6b3a, glyph: '🏛️' },
  geographie:  { color: 0x2f9a9a, glyph: '🗺️' },
  personnages: { color: 0x9a7b6b, glyph: '🧑' },
};
const TILE_W = 72;
const TILE_H = 36;

function darken(color: number, f: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * f);
  const g = Math.floor(((color >> 8) & 0xff) * f);
  const b = Math.floor((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

class GardenScene extends Phaser.Scene {
  constructor() { super('garden'); }

  create() {
    const concepts: Concept[] = this.registry.get('concepts') ?? [];
    const rejected: boolean = this.registry.get('rejected') ?? false;

    this.cameras.main.setBackgroundColor(rejected ? '#171426' : '#d7e6c8');

    const n = Math.max(concepts.length, 1);
    const cols = Math.max(3, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(3, Math.ceil(n / cols));
    const gridC = cols + 2;
    const gridR = rows + 2;

    const groundFill = rejected ? 0x241f36 : 0x9cc081;
    const groundLine = rejected ? 0x342d4e : 0x87ac6e;

    // Sol isométrique
    const ground = this.add.graphics();
    for (let r = 0; r < gridR; r++) {
      for (let c = 0; c < gridC; c++) {
        const x = (c - r) * (TILE_W / 2);
        const y = (c + r) * (TILE_H / 2);
        ground.fillStyle(groundFill, 1);
        ground.lineStyle(1, groundLine, 0.8);
        ground.beginPath();
        ground.moveTo(x, y - TILE_H / 2);
        ground.lineTo(x + TILE_W / 2, y);
        ground.lineTo(x, y + TILE_H / 2);
        ground.lineTo(x - TILE_W / 2, y);
        ground.closePath();
        ground.fillPath();
        ground.strokePath();
      }
    }

    // Concepts placés automatiquement (pas de drag manuel)
    concepts.forEach((concept, i) => {
      const c = (i % cols) + 1;
      const r = Math.floor(i / cols) + 1;
      const x = (c - r) * (TILE_W / 2);
      const y = (c + r) * (TILE_H / 2);
      const cat = concept.cats[0]?.[0] ?? 'personnages';
      const st = CAT_STYLE[cat] ?? CAT_STYLE.personnages;
      const H = 22;

      const cube = this.add.graphics();
      // face gauche
      cube.fillStyle(darken(st.color, 0.65), 1);
      cube.beginPath();
      cube.moveTo(x - TILE_W / 4, y - TILE_H / 4);
      cube.lineTo(x, y);
      cube.lineTo(x, y - H);
      cube.lineTo(x - TILE_W / 4, y - TILE_H / 4 - H);
      cube.closePath(); cube.fillPath();
      // face droite
      cube.fillStyle(darken(st.color, 0.5), 1);
      cube.beginPath();
      cube.moveTo(x + TILE_W / 4, y - TILE_H / 4);
      cube.lineTo(x, y);
      cube.lineTo(x, y - H);
      cube.lineTo(x + TILE_W / 4, y - TILE_H / 4 - H);
      cube.closePath(); cube.fillPath();
      // dessus
      cube.fillStyle(st.color, 1);
      cube.lineStyle(1.5, 0x1a1a2a, 0.6);
      cube.beginPath();
      cube.moveTo(x, y - H);
      cube.lineTo(x + TILE_W / 4, y - TILE_H / 4 - H);
      cube.lineTo(x, y - TILE_H / 2 - H);
      cube.lineTo(x - TILE_W / 4, y - TILE_H / 4 - H);
      cube.closePath(); cube.fillPath(); cube.strokePath();

      this.add.text(x, y - TILE_H / 4 - H, st.glyph, { fontSize: '18px' }).setOrigin(0.5);
      this.add.text(x, y + 4, concept.name.length > 18 ? concept.name.slice(0, 17) + '…' : concept.name, {
        fontFamily: 'Oswald, sans-serif', fontSize: '10px',
        color: rejected ? '#cabfe0' : '#27331f',
      }).setOrigin(0.5, 0);
    });

    // Centre la caméra sur le milieu du monde
    const midX = ((cols / 2) - (rows / 2)) * (TILE_W / 2);
    const midY = ((cols / 2) + (rows / 2)) * (TILE_H / 2);
    this.cameras.main.centerOn(midX, midY);

    // Pan + zoom
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0012, 0.35, 2.5));
    });
  }
}

export default function GardenScreen({ onTabChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [rejected, setRejected] = useState<Concept[]>([]);
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    getAdoptedConcepts().then(setAdopted).catch(() => {});
    getConceptsByVerdict('reject').then(setRejected).catch(() => {});
  }, []);

  // Crée le jeu Phaser une fois
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#d7e6c8',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: [GardenScene],
    });
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

  // Met à jour le monde quand les données / le mode changent
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set('concepts', showRejected ? rejected : adopted);
    game.registry.set('rejected', showRejected);
    const scene = game.scene.getScene('garden');
    if (scene) scene.scene.restart();
  }, [adopted, rejected, showRejected]);

  const count = showRejected ? rejected.length : adopted.length;

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker={showRejected ? 'Le monde des' : 'Votre'}
        title={showRejected ? 'REJETÉS' : 'JARDIN'}
        active="garden"
        onTabChange={onTabChange}
        right={<>
          <button onClick={() => setShowRejected(v => !v)} style={{
            background: showRejected ? 'var(--cit-navy-dk)' : 'transparent',
            color: showRejected ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
            border: '2.5px solid var(--cit-navy-dk)', padding: '6px 14px', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
            boxShadow: '2px 2px 0 var(--cit-navy-dk)',
          }}>{showRejected ? '🌱 Voir le jardin' : '🌫️ Monde des rejetés'}</button>
        </>}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}/>
        {count === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none',
            fontFamily: "'Special Elite', monospace", fontSize: 14, color: showRejected ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
            textShadow: '1px 1px 0 oklch(100% 0 0 / 0.4)',
          }}>
            {showRejected ? 'Aucun concept rejeté pour l’instant.' : 'Votre jardin est vide — adoptez des concepts dans le Swipe pour le peupler.'}
          </div>
        )}
        <div style={{
          position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
          background: 'oklch(0% 0 0 / 0.45)', color: 'var(--cit-cream)', padding: '4px 10px',
          fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: '.08em',
        }}>
          {count} concept{count > 1 ? 's' : ''} · glissez pour explorer · molette pour zoomer
        </div>
      </div>
      <CitizenFooter right="★ JARDIN (v2 · prototype) · SPRITES PLACEHOLDER EN ATTENDANT L’IA"/>
    </div>
  );
}
