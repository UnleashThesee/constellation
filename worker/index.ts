// Worker Cloudflare : sert les assets statiques (SPA) et expose /api/sprite,
// un proxy vers l'API images d'OpenAI (gpt-image-1) qui cache la clé côté
// serveur. La génération est paresseuse (déclenchée par le client à la demande).

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  OPENAI_API_KEY?: string;
}

// Oriente le prompt selon le domaine du concept.
const CAT_HINT: Record<string, string> = {
  philosophie: 'an iconic symbolic object evoking the idea',
  sciences:    'an iconic scientific instrument or symbol',
  humaines:    'a symbolic object of social science',
  economie:    'an iconic object evoking economics',
  litterature: 'an iconic book or literary object',
  arts:        'an iconic art object',
  musique:     'an iconic musical object',
  cinema:      'an iconic cinema object',
  jeuvideo:    'an iconic retro game object',
  histoire:    'an iconic historical artifact',
  geographie:  'an iconic place or map object',
  personnages: 'a small cute character portrait',
};

function buildPrompt(name: string, cat: string): string {
  const hint = CAT_HINT[cat] ?? 'a single iconic object';
  return `16-bit pixel art sprite of "${name}" — ${hint}. `
    + `Cozy Stardew Valley / SNES JRPG style, single centered subject, bold clean dark outline, `
    + `limited warm palette, soft pixel shading, flat plain background, no text, no words, no frame, no border.`;
}

async function handleSprite(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') ?? '').trim().slice(0, 120);
  const cat = url.searchParams.get('cat') ?? 'personnages';
  if (!name) return new Response('missing name', { status: 400 });
  if (!env.OPENAI_API_KEY) return new Response('OPENAI_API_KEY non configurée', { status: 503 });

  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildPrompt(name, cat),
        n: 1,
        size: '1024x1024',
        quality: 'low',
        background: 'transparent',
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(`openai ${r.status}: ${t.slice(0, 300)}`, { status: 502 });
    }
    const data = (await r.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return new Response('réponse OpenAI vide', { status: 502 });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return new Response(`échec génération: ${(e as Error).message}`, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/sprite') return handleSprite(request, env);
    return env.ASSETS.fetch(request);
  },
};
