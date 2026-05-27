import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { CitizenMasthead, CitizenFooter } from '../../components/ui/CitizenShell';
import { getAdoptedConcepts, getConceptsByVerdict } from '../../stores/db';
import type { Concept } from '../../types';

interface Props { onTabChange?: (id: string) => void }

// Couleur + glyphe par catégorie pour les marqueurs de concept (placeholder avant sprites IA).
const CAT_STYLE: Record<string, { color: number; glyph: string }> = {
  philosophie: { color: 0x5b5ad6, glyph: '💡' },
  sciences:    { color: 0x2f9a5f, glyph: '🔬' },
  humaines:    { color: 0xd0a445, glyph: '👥' },
  economie:    { color: 0xd8b13a, glyph: '💰' },
  litterature: { color: 0xb24a90, glyph: '📖' },
  arts:        { color: 0xe0608e, glyph: '🎨' },
  musique:     { color: 0xe06038, glyph: '🎵' },
  cinema:      { color: 0xe0902f, glyph: '🎬' },
  jeuvideo:    { color: 0x8b5cf6, glyph: '🎮' },
  histoire:    { color: 0xa07b3a, glyph: '🏛️' },
  geographie:  { color: 0x2fb0b0, glyph: '🗺️' },
  personnages: { color: 0xb08a7a, glyph: '🧑' },
};

class GardenScene extends Phaser.Scene {
  constructor() { super('garden'); }

  preload() {
    this.load.image('tux-tiles', 'assets/garden/tuxmon-tiles.png');
    this.load.tilemapTiledJSON('tux-map', 'assets/garden/tuxemon-town.json');
  }

  create() {
    const concepts: Concept[] = this.registry.get('concepts') ?? [];
    const rejected: boolean = this.registry.get('rejected') ?? false;

    const map = this.make.tilemap({ key: 'tux-map' });
    const tiles = map.addTilesetImage('tuxmon-sample-32px-extruded', 'tux-tiles', 32, 32, 1, 2);
    const layers = tiles ? [
      map.createLayer('Below Player', tiles, 0, 0),
      map.createLayer('World', tiles, 0, 0),
      map.createLayer('Above Player', tiles, 0, 0),
    ] : [];
    layers[2]?.setDepth(20);

    const W = map.widthInPixels, H = map.heightInPixels;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setBackgroundColor(rejected ? '#0d0d18' : '#1d3a1a');

    // Monde des rejetés : ambiance nocturne/brumeuse
    if (rejected) {
      layers.forEach(l => l?.setTint(0x5a64b0));
      this.add.rectangle(0, 0, W, H, 0x0a0a18, 0.5).setOrigin(0).setDepth(25);
    }

    // Concepts placés automatiquement (pins flottants au-dessus du monde)
    const n = concepts.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const padX = W * 0.12, padY = H * 0.12;
    const stepX = (W - padX * 2) / Math.max(1, cols - 1 || 1);
    const stepY = (H - padY * 2) / Math.max(1, rows - 1 || 1);

    concepts.forEach((concept, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const jitter = (s: string) => { let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return ((h % 100) / 100 - 0.5) * 36; };
      const x = (cols === 1 ? W / 2 : padX + c * stepX) + jitter(concept.id);
      const y = (rows === 1 ? H / 2 : padY + r * stepY) + jitter(concept.name);
      const cat = concept.cats[0]?.[0] ?? 'personnages';
      const st = CAT_STYLE[cat] ?? CAT_STYLE.personnages;

      // ombre + pastille colorée + glyphe
      this.add.ellipse(x, y + 15, 26, 10, 0x000000, 0.3).setDepth(29);
      this.add.circle(x, y, 14, st.color).setStrokeStyle(2.5, 0x1a1a2a).setDepth(30);
      this.add.text(x, y, st.glyph, { fontSize: '16px' }).setOrigin(0.5).setDepth(31);
      const label = concept.name.length > 20 ? concept.name.slice(0, 19) + '…' : concept.name;
      this.add.text(x, y + 17, label, {
        fontFamily: 'Oswald, sans-serif', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0).setStroke('#1a1a2a', 4).setDepth(31);
    });

    cam.centerOn(W / 2, H / 2);
    cam.setZoom(0.7);

    // Pan (drag) + zoom (molette)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0012, 0.45, 2.5));
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

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#1d3a1a',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      pixelArt: true,
      scene: [GardenScene],
    });
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

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
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', padding: 24, textAlign: 'center',
            fontFamily: "'Special Elite', monospace", fontSize: 14, color: '#fff', textShadow: '1px 1px 0 #000',
          }}>
            {showRejected ? 'Aucun concept rejeté pour l’instant.' : 'Votre jardin est vide — adoptez des concepts dans le Swipe pour le peupler.'}
          </div>
        )}
        <div style={{
          position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
          background: 'oklch(0% 0 0 / 0.5)', color: 'var(--cit-cream)', padding: '4px 10px',
          fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: '.08em',
        }}>
          {count} concept{count > 1 ? 's' : ''} · glissez pour explorer · molette pour zoomer
        </div>
      </div>
      <CitizenFooter right="★ JARDIN (v2) · DÉCOR : TUXEMON (CC BY-SA) · SPRITES DE CONCEPTS IA À VENIR"/>
    </div>
  );
}
