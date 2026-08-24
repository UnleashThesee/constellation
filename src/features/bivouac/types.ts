// Bivouac — types partagés.

export interface LatLng { lat: number; lng: number }
export interface BBox { south: number; west: number; north: number; east: number }

// ── Éléments bruts Overpass (`out geom;`) ────────────────────────────────────
export interface OsmPt { lat: number; lon: number }
export interface OsmNode { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
export interface OsmWay { type: 'way'; id: number; tags?: Record<string, string>; geometry?: OsmPt[] }
export interface OsmRelMember { type: string; role?: string; geometry?: OsmPt[] }
export interface OsmRelation { type: 'relation'; id: number; tags?: Record<string, string>; members?: OsmRelMember[] }
export type OsmElement = OsmNode | OsmWay | OsmRelation;

/** Données OSM classées par usage (coordonnées en lat/lng). */
export interface ParsedOsm {
  /** Chaque forêt = un groupe d'anneaux (extérieurs + trous). */
  forests: LatLng[][][];
  /** Cours d'eau + contours de plans d'eau, en polylignes. */
  water: LatLng[][];
  /** Sources / points d'eau ponctuels. */
  springs: LatLng[];
  /** Voies carrossables d'approche (pistes, petites routes, parkings). */
  access: LatLng[][];
  /** Axes bruyants (grandes routes, voies ferrées). */
  noise: LatLng[][];
  /** Habitations : points de lieux-dits/villages. */
  habitatPoints: LatLng[];
  /** Habitations : contours de zones résidentielles. */
  habitatAreas: LatLng[][];
}

/** Distances brutes mesurées autour d'un point candidat, en mètres. */
export interface Metrics {
  dWater: number;
  dEdge: number;    // distance au bord de forêt = « profondeur »
  dAccess: number;
  dHabitat: number;
  dNoise: number;
  /** Pente moyenne en %, si l'affinage altimétrique a tourné. */
  slopePct?: number;
  /** Minutes de voiture depuis le point de départ. */
  driveMin?: number;
  /** Distance à vol d'oiseau depuis le point de départ, en mètres. */
  crowM: number;
}

export interface Spot {
  id: string;
  lat: number;
  lng: number;
  metrics: Metrics;
  /** Score 0–100 par critère. */
  scores: Record<string, number>;
  /** Score global pondéré 0–100. */
  total: number;
}

export type Weights = Record<string, number>;

export interface SearchParams {
  origin: LatLng;
  /** Rayon de recherche en km. */
  radiusKm: number;
  /** Pas de la grille de candidats, en mètres. */
  gridStep: number;
  /** Distance minimale entre deux spots retenus, en mètres. */
  minSeparation: number;
  maxResults: number;
  weights: Weights;
}

export type Phase = 'idle' | 'download' | 'parse' | 'index' | 'scan' | 'rank' | 'refine' | 'done' | 'error';

export interface Progress {
  phase: Phase;
  /** 0–1, ou undefined si indéterminé. */
  ratio?: number;
  message: string;
}

/** Fiche de terrain d'un spot mis de côté. */
export interface SavedSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  note: string;
  status: 'todo' | 'good' | 'bad';
  total: number;
  metrics: Metrics;
  savedAt: number;
}
