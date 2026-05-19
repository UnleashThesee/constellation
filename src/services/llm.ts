// LLM client (Claude Anthropic / OpenAI) — calls direct depuis le navigateur
// avec la clé API stockée localement par l'utilisateur.

import type { Concept, AppSettings } from '../types';

export interface GeneratedIdea {
  titre: string;
  resume: string;
  conceptsMobilises: Array<{ nom: string; poidsPercu: number }>;
  contraintesRespectees: string[];
}

export interface DeepDive {
  planDetaille: Array<{ etape: string; detail: string }>;
  variations: Array<{ titre: string; angle: string }>;
  references: Array<{ source: string; pourquoi: string }>;
  questions: string[];
}

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
};

function buildIdeasPrompt(params: {
  items: Array<{ concept: Concept; weight: number }>;
  outputType: string;
  constraints: string[];
  additional: string;
}): string {
  const lines: string[] = [];
  lines.push('Tu es un assistant de brainstorm intellectuel pour Constellation, un terminal personnel d\'exploration cognitive.');
  lines.push('');
  lines.push('CONTEXTE — Voici une combinaison de concepts pondérée :');
  params.items.forEach(({ concept, weight }) => {
    lines.push(`- ${concept.name} (poids ${weight}%) — ${concept.blurb}`);
  });
  lines.push('');
  lines.push('Les poids reflètent l\'importance relative à donner à chaque concept.');
  lines.push('');
  if (params.constraints.length > 0) {
    lines.push('CONTRAINTES STRICTES :');
    params.constraints.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }
  lines.push(`TYPE DE PRODUCTION DEMANDÉ : ${params.outputType}`);
  lines.push('');
  if (params.additional.trim()) {
    lines.push(`CONTRAINTE ADDITIONNELLE LIBRE : ${params.additional.trim()}`);
    lines.push('');
  }
  lines.push('Génère 5 à 8 propositions sous la forme JSON suivante :');
  lines.push('[{');
  lines.push('  "titre": "...",');
  lines.push('  "resume": "..." (3 à 5 lignes, en français),');
  lines.push('  "conceptsMobilises": [{"nom": "...", "poidsPercu": 0-100}],');
  lines.push('  "contraintesRespectees": ["..."]');
  lines.push('}]');
  lines.push('');
  lines.push('Réponds UNIQUEMENT par le tableau JSON, sans aucun texte avant ou après.');
  return lines.join('\n');
}

function buildDeepDivePrompt(idea: {
  title: string; content: string;
  items: Array<{ concept: Concept; weight: number }>;
  constraints: string[];
}): string {
  const lines: string[] = [];
  lines.push('Tu es un assistant de brainstorm intellectuel.');
  lines.push('');
  lines.push('IDÉE À APPROFONDIR :');
  lines.push(`Titre : ${idea.title}`);
  lines.push(`Résumé : ${idea.content}`);
  lines.push('');
  lines.push('CONCEPTS MOBILISÉS :');
  idea.items.forEach(({ concept, weight }) => {
    lines.push(`- ${concept.name} (poids ${weight}%) — ${concept.blurb}`);
  });
  if (idea.constraints.length > 0) {
    lines.push('');
    lines.push('CONTRAINTES :');
    idea.constraints.forEach(c => lines.push(`- ${c}`));
  }
  lines.push('');
  lines.push('Approfondis cette idée selon cette structure JSON :');
  lines.push('{');
  lines.push('  "planDetaille": [{"etape": "...", "detail": "..."}, … exactement 6],');
  lines.push('  "variations": [{"titre": "...", "angle": "..."}, … exactement 3],');
  lines.push('  "references": [{"source": "...", "pourquoi": "..."}, … exactement 5],');
  lines.push('  "questions": ["..." × 5]');
  lines.push('}');
  lines.push('');
  lines.push('Réponds UNIQUEMENT par le JSON.');
  return lines.join('\n');
}

async function callClaude(key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.claude,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`Claude API ${res.status}`, res.status, text);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (typeof text !== 'string') throw new LlmError('Réponse Claude vide', 0);
  return text;
}

async function callOpenAI(key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.openai,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`OpenAI API ${res.status}`, res.status, text);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new LlmError('Réponse OpenAI vide', 0);
  return text;
}

export class LlmError extends Error {
  status: number;
  body?: string;
  constructor(message: string, status: number, body?: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function extractJson(text: string): unknown {
  // Strip code fences / extra prose
  const stripped = text.replace(/^[\s\S]*?(?=[{\[])/, '').replace(/[\s\S]*?$/, m => m.replace(/[`\s]+$/, ''));
  try { return JSON.parse(stripped); } catch { /* fall through */ }
  // Try to find a JSON block
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) try { return JSON.parse(arr[0]); } catch { /* */ }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) try { return JSON.parse(obj[0]); } catch { /* */ }
  throw new LlmError('Impossible de parser le JSON retourné par le LLM', 0, text.slice(0, 400));
}

async function callLlm(settings: AppSettings, prompt: string): Promise<string> {
  const key = settings.llmKey?.trim();
  if (!key) throw new LlmError('Clé API absente. Configurez-la dans Réglages.', 401);
  const provider = settings.llmProvider ?? 'claude';
  const model = settings.llmModel ?? DEFAULT_MODELS[provider];
  if (provider === 'claude') return callClaude(key, model, prompt);
  return callOpenAI(key, model, prompt);
}

export async function generateIdeas(params: {
  settings: AppSettings;
  items: Array<{ concept: Concept; weight: number }>;
  outputType: string;
  constraints: string[];
  additional: string;
}): Promise<GeneratedIdea[]> {
  const prompt = buildIdeasPrompt(params);
  const raw = await callLlm(params.settings, prompt);
  const parsed = extractJson(raw);
  // OpenAI in json_object mode may wrap the array in { items: [...] } or similar
  if (Array.isArray(parsed)) return parsed as GeneratedIdea[];
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (Array.isArray(obj[k])) return obj[k] as GeneratedIdea[];
    }
  }
  throw new LlmError('Format de réponse inattendu (attendu : tableau)', 0);
}

export async function deepDiveIdea(params: {
  settings: AppSettings;
  title: string;
  content: string;
  items: Array<{ concept: Concept; weight: number }>;
  constraints: string[];
}): Promise<DeepDive> {
  const prompt = buildDeepDivePrompt(params);
  const raw = await callLlm(params.settings, prompt);
  const parsed = extractJson(raw);
  return parsed as DeepDive;
}

/** Test rapide : envoie un prompt court pour vérifier la clé. */
export async function testLlmKey(settings: AppSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await callLlm(settings, 'Réponds par "OK" et rien d\'autre.');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof LlmError ? e.message : 'Erreur réseau';
    return { ok: false, error: msg };
  }
}
