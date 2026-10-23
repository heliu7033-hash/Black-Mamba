// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut 老黑剪辑台 semantic-card route. Reads the OpenAI-compatible key from the
// existing settings store and never returns that key to the browser.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { getKey } from '../keystore.ts';
import { llmProviderPreset, normalizeOpenAiApiMode } from '../../shared/llm-providers.ts';
import {
  SEMANTIC_CARD_SYSTEM,
  clipSemanticLines,
  extractModelText,
  parseCardRecommendation,
  semanticUserPrompt,
  type SemanticLine,
} from '../../shared/laosa-card.ts';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 32_000) throw new Error('too_large');
    chunks.push(buf);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sanitizeBase(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function withVersion(base: string): string {
  if (/\/v\d+$/.test(base) || base.endsWith('/chat/completions') || base.endsWith('/responses')) return base;
  return `${base}/v1`;
}

function endpoint(): { apiKey: string; base: string; mode: 'chat' | 'responses'; model: string } | null {
  const llmKey = getKey('LLM_OPENAI_API_KEY');
  const compatibleKey = getKey('OPENAI_API_KEY');
  const apiKey = llmKey || compatibleKey;
  if (!apiKey) return null;
  const preset = llmProviderPreset('openai');
  const configured = getKey('LLM_OPENAI_BASE_URL') || (!llmKey ? getKey('IMAGE_BASE_URL') : '');
  const base = sanitizeBase(configured || preset.baseUrl);
  if (!base) return null;
  return {
    apiKey,
    base: withVersion(base),
    mode: normalizeOpenAiApiMode(getKey('LLM_OPENAI_API_MODE')),
    model: getKey('LLM_OPENAI_MODEL') || preset.defaultModel,
  };
}

function requestBody(mode: 'chat' | 'responses', model: string, user: string): string {
  if (mode === 'chat') {
    return JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SEMANTIC_CARD_SYSTEM },
        { role: 'user', content: user },
      ],
    });
  }
  return JSON.stringify({
    model,
    store: false,
    input: [
      { role: 'system', content: SEMANTIC_CARD_SYSTEM },
      { role: 'user', content: user },
    ],
  });
}

async function callUpstream(
  target: { apiKey: string; base: string; model: string },
  mode: 'chat' | 'responses',
  user: string,
): Promise<Response> {
  const path = mode === 'chat' ? '/chat/completions' : '/responses';
  const url = target.base.endsWith(path) ? target.base : `${target.base}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.apiKey}`,
    },
    body: requestBody(mode, target.model, user),
    signal: AbortSignal.timeout(20_000),
  });
}

function linesFromBody(body: unknown): SemanticLine[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { lines?: unknown }).lines)) return [];
  return clipSemanticLines((body as { lines: SemanticLine[] }).lines);
}

export function laosaCardPlugin(): Plugin {
  return {
    name: 'openchatcut-laosa-card',
    configureServer(server) {
      server.middlewares.use('/api/laosa/semantic-card', async (req, res) => {
        try {
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method' });
            return;
          }
          const target = endpoint();
          if (!target) {
            sendJson(res, 409, { error: 'missing_key' });
            return;
          }
          const lines = linesFromBody(await readBody(req));
          if (!lines.length) {
            sendJson(res, 400, { error: 'empty_captions' });
            return;
          }
          const user = semanticUserPrompt(lines);
          let upstream = await callUpstream(target, target.mode, user);
          if (!upstream.ok && target.mode === 'responses' && (upstream.status === 404 || upstream.status === 400)) {
            upstream = await callUpstream(target, 'chat', user);
          }
          if (!upstream.ok) {
            sendJson(res, 502, { error: 'upstream' });
            return;
          }
          const payload = await upstream.json() as unknown;
          const recommendation = parseCardRecommendation(extractModelText(payload));
          if (!recommendation) {
            sendJson(res, 502, { error: 'bad_response' });
            return;
          }
          sendJson(res, 200, recommendation);
        } catch {
          if (!res.headersSent) sendJson(res, 400, { error: 'invalid_body' });
        }
      });
    },
  };
}
