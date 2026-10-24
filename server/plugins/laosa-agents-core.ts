// SPDX-License-Identifier: AGPL-3.0-or-later
// Desk-agent server core.
//
// LibTV: proxy https://im.liblib.tv OpenAPI with Authorization: Bearer
// LIBTV_ACCESS_KEY (or VITE_LIBTV_ACCESS_KEY). The key is never returned.
// Optional base: OPENAPI_IM_BASE or IM_BASE_URL.
//
// TapNow: the Vite client cannot call TapNow MCP. When TAPNOW_API_BASE and
// TAPNOW_API_KEY (or TAPNOW_API_TOKEN) are set, this adapter speaks a small
// HTTP contract and downloads the resulting media_url into /media/uploads:
//
//   POST {TAPNOW_API_BASE}{TAPNOW_GENERATE_PATH|/v1/generate}
//   Authorization: Bearer <key>
//   { "prompt": "...", "kind": "image" | "video" }
//   → { "job_id": "...", "status": "generating"|"done"|"failed", "media_url"?, "media_type"? }
//
//   GET {TAPNOW_API_BASE}{TAPNOW_JOB_PATH|/v1/jobs}/{job_id}
//   → same shape. status "done" must include media_url.
//
// TODO: point TAPNOW_API_BASE at a bridge that wraps MCP create_hero_image /
// create_hero_video + get_production_result. This process does not speak MCP.

import { isLibtvResultUrl, kindFromMediaUrl } from '../../src/laosa/agents/libtvExtract.ts';

export interface DeskAgentSecrets {
  libtvKey: string;
  libtvBase: string;
  tapnowKey: string;
  tapnowBase: string;
  tapnowGeneratePath: string;
  tapnowJobPath: string;
}

export interface SavedMedia {
  src: string;
  kind: 'image' | 'video';
  name: string;
}

export interface AgentRuntimeDeps {
  secrets: () => DeskAgentSecrets;
  fetchImpl: typeof fetch;
  saveRemote: (url: string) => Promise<SavedMedia>;
  saveUpload?: (bytes: Uint8Array, contentType: string) => Promise<SavedMedia>;
}

const DEFAULT_LIBTV_BASE = 'https://im.liblib.tv';

function pick(env: Record<string, string | undefined>, ...names: string[]): string {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function safeServiceBase(raw: string, fallback = ''): string {
  const value = raw.trim() || fallback;
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fallback;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return fallback;
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function apiPath(raw: string | undefined, fallback: string): string {
  const value = (raw ?? '').trim() || fallback;
  if (!value.startsWith('/') || value.includes('..') || value.includes('://') || value.includes('?')) return fallback;
  return value.replace(/\/$/, '') || fallback;
}

export function deskAgentSecretsFrom(env: Record<string, string | undefined>): DeskAgentSecrets {
  const libtvKey = pick(env, 'LIBTV_ACCESS_KEY', 'VITE_LIBTV_ACCESS_KEY');
  const tapnowKey = pick(env, 'TAPNOW_API_KEY', 'TAPNOW_API_TOKEN', 'VITE_TAPNOW_API_KEY');
  const tapnowBase = safeServiceBase(pick(env, 'TAPNOW_API_BASE', 'VITE_TAPNOW_API_BASE'));
  return {
    libtvKey,
    libtvBase: safeServiceBase(pick(env, 'OPENAPI_IM_BASE', 'IM_BASE_URL', 'VITE_OPENAPI_IM_BASE'), DEFAULT_LIBTV_BASE),
    tapnowKey,
    tapnowBase,
    tapnowGeneratePath: apiPath(pick(env, 'TAPNOW_GENERATE_PATH'), '/v1/generate'),
    tapnowJobPath: apiPath(pick(env, 'TAPNOW_JOB_PATH'), '/v1/jobs'),
  };
}

export function libtvConfigured(secrets: DeskAgentSecrets): boolean {
  return Boolean(secrets.libtvKey && secrets.libtvBase);
}

export function tapnowConfigured(secrets: DeskAgentSecrets): boolean {
  return Boolean(secrets.tapnowKey && secrets.tapnowBase);
}

export interface TapnowUpstreamJob {
  jobId: string;
  status: 'queued' | 'generating' | 'done' | 'failed';
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseTapnowUpstream(body: unknown): TapnowUpstreamJob | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = asRecord(root.data) ?? root;
  const jobId = text(data.job_id ?? data.jobId ?? data.id);
  const mediaUrl = text(data.media_url ?? data.mediaUrl ?? data.url);
  const mediaTypeRaw = text(data.media_type ?? data.mediaType ?? data.kind).toLowerCase();
  const statusRaw = text(data.status).toLowerCase();
  let status: TapnowUpstreamJob['status'] = 'generating';
  if (['done', 'complete', 'completed', 'succeeded', 'success', 'ready'].includes(statusRaw) || mediaUrl) status = 'done';
  else if (['failed', 'error', 'cancelled', 'canceled'].includes(statusRaw)) status = 'failed';
  else if (['queued', 'pending', 'submitted'].includes(statusRaw)) status = 'queued';
  if (!jobId && !mediaUrl) return null;
  const mediaType = mediaTypeRaw.includes('video')
    ? 'video'
    : mediaTypeRaw.includes('image')
      ? 'image'
      : mediaUrl ? kindFromMediaUrl(mediaUrl) : undefined;
  return {
    jobId: jobId || 'job',
    status: mediaUrl ? 'done' : status,
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(mediaType ? { mediaType } : {}),
  };
}

export function isSafeSessionId(value: string): boolean {
  return /^[A-Za-z0-9-]{8,80}$/.test(value);
}

function sendJson(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req: AsyncIterable<unknown>, limit = 32_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > limit) throw new Error('too_large');
    chunks.push(buf);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readRaw(req: AsyncIterable<unknown>, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > limit) throw new Error('too_large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function routePath(url: string | undefined): { pathname: string; search: URLSearchParams } {
  const parsed = new URL(url ?? '/', 'http://localhost');
  const pathname = parsed.pathname.replace(/^\/api\/laosa\/(?:agents|libtv|tapnow)/, '') || '/';
  return { pathname, search: parsed.searchParams };
}

function bearer(key: string, json = false): Headers {
  const headers = new Headers({ Authorization: `Bearer ${key}` });
  if (json) headers.set('Content-Type', 'application/json');
  return headers;
}

export function createAgentRuntime(deps: AgentRuntimeDeps) {
  const jobs = new Map<string, { upstreamId: string }>();

  async function proxyLibtv(path: string, init: RequestInit): Promise<Response> {
    const secrets = deps.secrets();
    if (!libtvConfigured(secrets)) {
      return new Response(JSON.stringify({ error: 'missing_key' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${secrets.libtvKey}`);
    return deps.fetchImpl(`${secrets.libtvBase}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  }

  async function handleAgents(pathname: string, method: string, req: AsyncIterable<unknown>, res: JsonResponse): Promise<void> {
    if (method === 'GET' && (pathname === '/status' || pathname === '/')) {
      const secrets = deps.secrets();
      sendJson(res, 200, {
        libtv: libtvConfigured(secrets),
        tapnow: tapnowConfigured(secrets),
        mcpInBrowser: false,
        tapnowTransport: tapnowConfigured(secrets) ? 'http' : 'unconfigured',
      });
      return;
    }
    if (method === 'POST' && pathname === '/import') {
      const body = await readJson(req) as { url?: unknown };
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!isLibtvResultUrl(url)) {
        sendJson(res, 400, { error: 'url_rejected' });
        return;
      }
      try {
        const saved = await deps.saveRemote(url);
        sendJson(res, 200, saved);
      } catch {
        sendJson(res, 502, { error: 'download' });
      }
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  }

  async function handleLibtv(pathname: string, method: string, req: AsyncIterable<unknown> & { headers?: Record<string, string | string[] | undefined> }, res: JsonResponse): Promise<void> {
    if (method === 'POST' && pathname === '/session') {
      const body = await readJson(req) as { message?: unknown; sessionId?: unknown };
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
      if (!message) {
        sendJson(res, 400, { error: 'empty_message' });
        return;
      }
      if (sessionId && !isSafeSessionId(sessionId)) {
        sendJson(res, 400, { error: 'bad_session' });
        return;
      }
      const upstream = await proxyLibtv('/openapi/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionId ? { sessionId, message } : { message }),
      });
      if (upstream.status === 409) {
        sendJson(res, 409, { error: 'missing_key' });
        return;
      }
      if (!upstream.ok) {
        sendJson(res, 502, { error: 'upstream' });
        return;
      }
      sendJson(res, 200, await upstream.json());
      return;
    }
    const sessionMatch = pathname.match(/^\/session\/([^/]+)$/);
    if (method === 'GET' && sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1] ?? '');
      if (!isSafeSessionId(sessionId)) {
        sendJson(res, 400, { error: 'bad_session' });
        return;
      }
      const parsed = new URL(reqUrl(req), 'http://localhost');
      const afterSeq = Number(parsed.searchParams.get('afterSeq') ?? '0');
      const query = Number.isInteger(afterSeq) && afterSeq > 0 ? `?afterSeq=${afterSeq}` : '';
      const upstream = await proxyLibtv(`/openapi/session/${sessionId}${query}`, { method: 'GET' });
      if (upstream.status === 409) {
        sendJson(res, 409, { error: 'missing_key' });
        return;
      }
      if (!upstream.ok) {
        sendJson(res, 502, { error: 'upstream' });
        return;
      }
      sendJson(res, 200, await upstream.json());
      return;
    }
    if (method === 'POST' && pathname === '/upload') {
      const secrets = deps.secrets();
      if (!libtvConfigured(secrets)) {
        sendJson(res, 409, { error: 'missing_key' });
        return;
      }
      const contentType = header(req, 'content-type');
      if (!contentType.toLowerCase().includes('multipart/form-data')) {
        sendJson(res, 400, { error: 'multipart' });
        return;
      }
      const bytes = await readRaw(req, 32 * 1024 * 1024);
      const upstream = await deps.fetchImpl(`${secrets.libtvBase}/openapi/file/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secrets.libtvKey}`, 'Content-Type': contentType },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60_000),
      });
      if (!upstream.ok) {
        sendJson(res, 502, { error: 'upstream' });
        return;
      }
      sendJson(res, 200, await upstream.json());
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  }

  async function finishTapnow(job: TapnowUpstreamJob, res: JsonResponse, ourId: string): Promise<void> {
    if (job.status === 'failed') {
      sendJson(res, 200, { jobId: ourId, status: 'failed', error: 'failed' });
      return;
    }
    if (job.status === 'done' && job.mediaUrl) {
      let saved: SavedMedia;
      try {
        saved = await deps.saveRemote(job.mediaUrl);
      } catch {
        sendJson(res, 502, { error: 'download' });
        return;
      }
      const kind = job.mediaType ?? saved.kind;
      sendJson(res, 200, { jobId: ourId, status: 'done', clip: { ...saved, kind } });
      return;
    }
    sendJson(res, 200, { jobId: ourId, status: job.status === 'queued' ? 'queued' : 'generating' });
  }

  async function handleTapnow(pathname: string, method: string, req: AsyncIterable<unknown>, res: JsonResponse): Promise<void> {
    const secrets = deps.secrets();
    if (method === 'POST' && pathname === '/jobs') {
      if (!tapnowConfigured(secrets)) {
        sendJson(res, 409, { error: 'missing_key' });
        return;
      }
      const body = await readJson(req) as { prompt?: unknown; kind?: unknown };
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const kind = body.kind === 'video' ? 'video' : 'image';
      if (!prompt) {
        sendJson(res, 400, { error: 'empty_message' });
        return;
      }
      const upstream = await deps.fetchImpl(`${secrets.tapnowBase}${secrets.tapnowGeneratePath}`, {
        method: 'POST',
        headers: bearer(secrets.tapnowKey, true),
        body: JSON.stringify({ prompt, kind }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!upstream.ok) {
        sendJson(res, 502, { error: 'upstream' });
        return;
      }
      const job = parseTapnowUpstream(await upstream.json());
      if (!job) {
        sendJson(res, 502, { error: 'bad_response' });
        return;
      }
      const ourId = `tn_${crypto.randomUUID()}`;
      jobs.set(ourId, { upstreamId: job.jobId });
      await finishTapnow(job, res, ourId);
      return;
    }
    const jobMatch = pathname.match(/^\/jobs\/([^/]+)$/);
    if (method === 'GET' && jobMatch) {
      const ourId = decodeURIComponent(jobMatch[1] ?? '');
      const known = jobs.get(ourId);
      if (!known || !tapnowConfigured(secrets)) {
        sendJson(res, known ? 409 : 404, { error: known ? 'missing_key' : 'not_found' });
        return;
      }
      const upstream = await deps.fetchImpl(
        `${secrets.tapnowBase}${secrets.tapnowJobPath}/${encodeURIComponent(known.upstreamId)}`,
        { method: 'GET', headers: bearer(secrets.tapnowKey), signal: AbortSignal.timeout(30_000) },
      );
      if (!upstream.ok) {
        sendJson(res, 502, { error: 'upstream' });
        return;
      }
      const job = parseTapnowUpstream(await upstream.json());
      if (!job) {
        sendJson(res, 502, { error: 'bad_response' });
        return;
      }
      await finishTapnow(job, res, ourId);
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  }

  return {
    async handle(scope: 'agents' | 'libtv' | 'tapnow', req: RequestLike, res: JsonResponse): Promise<void> {
      try {
        const method = (req.method ?? 'GET').toUpperCase();
        const { pathname } = routePath(req.url);
        if (scope === 'agents') await handleAgents(pathname, method, req, res);
        else if (scope === 'libtv') await handleLibtv(pathname, method, req, res);
        else await handleTapnow(pathname, method, req, res);
      } catch (error) {
        const code = error instanceof Error && error.message === 'too_large' ? 413 : 400;
        if (!res.headersSent) sendJson(res, code, { error: code === 413 ? 'too_large' : 'bad_request' });
      }
    },
  };
}

interface JsonResponse {
  statusCode: number;
  headersSent?: boolean;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

interface RequestLike extends AsyncIterable<unknown> {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

function header(req: { headers?: Record<string, string | string[] | undefined> }, name: string): string {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function reqUrl(req: { url?: string }): string {
  return req.url ?? '/';
}
