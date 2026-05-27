import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { Concept } from '../../types';

// Couleur + glyphe par catégorie pour les marqueurs de concept (placeholder avant sprites IA).
export const CAT_STYLE: Record<string, { color: number; glyph: string }> = {
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
    const interactive: boolean = this.registry.get('interactive') ?? true;

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

    if (rejected) {
      layers.forEach(l => l?.setTint(0x5a64b0));
      this.add.rectangle(0, 0, W, H, 0x0a0a18, 0.5).setOrigin(0).setDepth(25);
    }

    // Concepts placés automatiquement (marqueurs flottants au-dessus du monde)
    const n = concepts.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const padX = W * 0.12, padY = H * 0.12;
    const stepX = (W - padX * 2) / Math.max(1, (cols - 1) || 1);
    const stepY = (H - padY * 2) / Math.max(1, (rows - 1) || 1);
    const jitter = (s: string) => { let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return ((h % 100) / 100 - 0.5) * 36; };

    concepts.forEach((concept, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (cols === 1 ? W / 2 : padX + c * stepX) + jitter(concept.id);
      const y = (rows === 1 ? H / 2 : padY + r * stepY) + jitter(concept.name);
      const cat = concept.cats[0]?.[0] ?? 'personnages';
      const st = CAT_STYLE[cat] ?? CAT_STYLE.personnages;
      this.add.ellipse(x, y + 15, 26, 10, 0x000000, 0.3).setDepth(29);
      this.add.circle(x, y, 14, st.color).setStrokeStyle(2.5, 0x1a1a2a).setDepth(30);
      this.add.text(x, y, st.glyph, { fontSize: '16px' }).setOrigin(0.5).setDepth(31);
      const label = concept.name.length > 20 ? concept.name.slice(0, 19) + '…' : concept.name;
      this.add.text(x, y + 17, label, {
        fontFamily: 'Oswald, sans-serif', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0).setStroke('#1a1a2a', 4).setDepth(31);
    });

    cam.centerOn(W / 2, H / 2);
    cam.setZoom(this.registry.get('zoom') ?? 0.7);

    if (interactive) {
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!p.isDown) return;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      });
      this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0012, 0.45, 2.5));
      });
    } else {
      // Fond vivant : lente dérive de caméra
      this.tweens.add({ targets: cam, scrollX: { from: cam.scrollX - 60, to: cam.scrollX + 60 }, duration: 24000, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
  }
}

/** Monde pixel-art réutilisable : onglet Jardin (interactif) ou fond du swipe (passif). */
export function GardenCanvas({ concepts, rejected = false, interactive = true, zoom = 0.7 }: {
  concepts: Concept[]; rejected?: boolean; interactive?: boolean; zoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: rejected ? '#0d0d18' : '#1d3a1a',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      pixelArt: true,
      scene: [GardenScene],
    });
    const g = gameRef.current;
    g.registry.set('interactive', interactive);
    g.registry.set('zoom', zoom);
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set('concepts', concepts);
    game.registry.set('rejected', rejected);
    game.registry.set('interactive', interactive);
    game.registry.set('zoom', zoom);
    const scene = game.scene.getScene('garden');
    if (scene) scene.scene.restart();
  }, [concepts, rejected, interactive, zoom]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}/>;
}
