import type { Concept } from '../types';
import { getEmbedding, getEmbeddings, putEmbedding } from '../stores/db';

// Embeddings sémantiques via transformers.js (all-MiniLM-L6-v2, 384 dims).
// Le modèle (~25 Mo) est téléchargé depuis le CDN HuggingFace à la première
// utilisation puis mis en cache par le navigateur ; les vecteurs par concept
// sont persistés dans IndexedDB. Tout est chargé en lazy : la librairie n'entre
// jamais dans le bundle principal et n'est importée que si une fonctionnalité
// sémantique est réellement utilisée.

type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
export type EmbeddingsStatus = 'idle' | 'loading' | 'ready' | 'error';

let status: EmbeddingsStatus = 'idle';
let extractorPromise: Promise<Extractor> | null = null;

export function embeddingsStatus(): EmbeddingsStatus {
  return status;
}

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    status = 'loading';
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Pas de modèles locaux : on récupère depuis le Hub HuggingFace.
      env.allowLocalModels = false;
      const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      status = 'ready';
      return pipe as unknown as Extractor;
    })().catch((e) => {
      status = 'error';
      extractorPromise = null;
      throw e;
    });
  }
  return extractorPromise;
}

function conceptText(c: Concept): string {
  return [c.name, c.kind, c.blurb, c.blurbLong]
    .filter(Boolean)
    .join('. ')
    .slice(0, 512);
}

/** Embedding d'un concept (cache IndexedDB d'abord, sinon calcul + persistance). */
export async function embedConcept(c: Concept): Promise<number[]> {
  const cached = await getEmbedding(c.id);
  if (cached) return cached;
  const extractor = await getExtractor();
  const out = await extractor(conceptText(c), { pooling: 'mean', normalize: true });
  const vec = Array.from(out.data);
  await putEmbedding(c.id, vec);
  return vec;
}

/**
 * Embeddings d'un lot de concepts. Renvoie une Map id→vecteur. Les concepts
 * déjà en cache sont lus en masse ; les manquants sont calculés un par un.
 * Les échecs individuels sont ignorés (le concept est simplement absent de la Map).
 */
export async function embedConcepts(concepts: Concept[]): Promise<Map<string, number[]>> {
  const result = await getEmbeddings(concepts.map((c) => c.id));
  const missing = concepts.filter((c) => !result.has(c.id));
  for (const c of missing) {
    try {
      result.set(c.id, await embedConcept(c));
    } catch {
      // modèle indisponible / hors-ligne : on saute ce concept
      break;
    }
  }
  return result;
}

/** Similarité cosinus. Les vecteurs étant normalisés, c'est le produit scalaire. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/** Barycentre normalisé d'un ensemble de vecteurs (centre de gravité sémantique). */
export function centroid(vecs: number[][]): number[] | null {
  if (vecs.length === 0) return null;
  const dim = vecs[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) sum[i] += v[i];
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    sum[i] /= vecs.length;
    norm += sum[i] * sum[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) sum[i] /= norm;
  return sum;
}
