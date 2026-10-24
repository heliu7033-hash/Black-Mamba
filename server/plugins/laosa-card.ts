// SPDX-License-Identifier: AGPL-3.0-or-later
// B-CUT 老黑剪辑台 semantic-card route.
// Upstream: Claude via SSXZ (OpenAI-compatible /v1/chat/completions).
// Credentials are read from ~/.claude/settings.json or ANTHROPIC_* env — never returned to the browser.

import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { proxyDispatcher, outboundProxyUrl, environmentProxyUrl } from '../outbound-proxy.ts';
import { ProxyAgent } from 'undici';
import {
  SEMANTIC_CARD_SYSTEM,
  clipSemanticLines,
  extractModelText,
  parseCardRecommendation,
  semanticUserPrompt,
  type SemanticLine,
} from '../../shared/laosa-card.ts';

const DEFAULT_MODELS = ['claude-sonnet-5', 'claude-opus-5-5'] as const;
const CLAUDE_SETTINGS = join(homedir(), '.claude', 'settings.json');

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

function readClaudeSettingsEnv(): Record<string, string> {
  try {
    const raw = readFileSync(CLAUDE_SETTINGS, 'utf8');
    const parsed = JSON.parse(raw) as { env?: Record<string, unknown> };
    const env = parsed.env ?? {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function pick(name: string, fileEnv: Record<string, string>): string {
  return (process.env[name] ?? fileEnv[name] ?? '').trim();
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

function withV1(base: string): string {
  if (/\/v\d+$/.test(base) || base.endsWith('/chat/completions')) return base;
  return `${base}/v1`;
}

type ClaudeTarget = { apiKey: string; base: string; models: string[] };

function claudeEndpoint(): ClaudeTarget | null {
  const fileEnv = readClaudeSettingsEnv();
  const apiKey = pick('ANTHROPIC_AUTH_TOKEN', fileEnv) || pick('ANTHROPIC_API_KEY', fileEnv);
  if (!apiKey) return null;
  const configured = pick('ANTHROPIC_BASE_URL', fileEnv) || 'https://api.ssxzapi.com';
  const base = sanitizeBase(configured);
  if (!base) return null;
  // Do not use ANTHROPIC_MODEL — Claude Code may set it to fable/other coding defaults.
  const preferred = pick('LAOSA_CLAUDE_MODEL', fileEnv)
    || pick('ANTHROPIC_DEFAULT_SONNET_MODEL', fileEnv)
    || pick('ANTHROPIC_DEFAULT_OPUS_MODEL', fileEnv);
  const models = [...new Set([preferred, ...DEFAULT_MODELS].filter(Boolean))];
  return { apiKey, base: withV1(base), models };
}

function ssxzProxyDispatcher(): ProxyAgent | undefined {
  const existing = proxyDispatcher();
  if (existing) return existing;
  // 黑哥 MacPacket 默认代理；Node fetch 不读系统代理，SSXZ 直连会 403。
  const fallback = outboundProxyUrl() || environmentProxyUrl() || 'http://127.0.0.1:1082';
  try {
    return new ProxyAgent(fallback);
  } catch {
    return undefined;
  }
}

async function callChatCompletions(
  target: ClaudeTarget,
  model: string,
  user: string,
): Promise<Response> {
  const path = '/chat/completions';
  const url = target.base.endsWith(path) ? target.base : `${target.base}${path}`;
  const dispatcher = ssxzProxyDispatcher();
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SEMANTIC_CARD_SYSTEM },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit);
}

function linesFromBody(body: unknown): SemanticLine[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { lines?: unknown }).lines)) return [];
  return clipSemanticLines((body as { lines: SemanticLine[] }).lines);
}

function isModelUnavailable(status: number, payload: unknown): boolean {
  if (status !== 404 && status !== 400) return false;
  const text = JSON.stringify(payload ?? {}).toLowerCase();
  return text.includes('model_not_found') || text.includes('not available') || text.includes('not_found_error');
}

export function laosaCardPlugin(): Plugin {
  return {
    name: 'openchatcut-laosa-card',
    configureServer(server) {
      server.middlewares.use('/api/laosa/semantic-card', async (req, res) => {
        try {
          if (req.method === 'GET' || req.method === 'HEAD') {
            sendJson(res, 200, { configured: claudeEndpoint() !== null, upstream: 'claude-ssxz' });
            return;
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method' });
            return;
          }
          const target = claudeEndpoint();
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
          let lastStatus = 0;
          let lastPayload: unknown = null;
          for (const model of target.models) {
            const upstream = await callChatCompletions(target, model, user);
            lastStatus = upstream.status;
            let payload: unknown = null;
            try {
              payload = await upstream.json();
            } catch {
              payload = null;
            }
            lastPayload = payload;
            if (!upstream.ok) {
              if (isModelUnavailable(upstream.status, payload)) continue;
              sendJson(res, 502, { error: 'upstream' });
              return;
            }
            const modelText = extractModelText(payload);
            if (!modelText.trim()) {
              continue;
            }
            const recommendation = parseCardRecommendation(modelText);
            if (!recommendation) {
              // Model returned 200 but not a single {size,reason}; try next model.
              continue;
            }
            sendJson(res, 200, recommendation);
            return;
          }
          const lastText = extractModelText(lastPayload);
          const lastTry = parseCardRecommendation(lastText);
          if (lastStatus >= 200 && lastStatus < 300 && !lastTry) {
            sendJson(res, 502, { error: 'bad_response' });
            return;
          }
          sendJson(res, 502, { error: 'upstream' });
        } catch {
          if (!res.headersSent) sendJson(res, 400, { error: 'invalid_body' });
        }
      });
    },
  };
}
