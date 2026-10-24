// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser-side LibTV flow. The access key stays on the server. This module
// posts the user's message, polls the session, and asks the server to download
// result URLs into /media/uploads. Missing key → demo (no session is opened).

import {
  extractLibtvMediaUrls,
  maxMessageSeq,
  messageWithReference,
  parseLibtvCreated,
  parseLibtvMessages,
  parseLibtvUploadUrl,
  type LibtvMessage,
} from './libtvExtract';
import type { TapNowClip } from './tapnowClient';

export interface AgentStatus {
  libtv: boolean;
  tapnow: boolean;
  /** Always false. TapNow MCP is not available inside the Vite client. */
  mcpInBrowser: false;
}

export interface LibtvRunOptions {
  prompt: string;
  reference?: File | null;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPhase?: (phase: 'upload' | 'submit' | 'poll' | 'import') => void;
}

export type LibtvRun =
  | { mode: 'demo' }
  | { mode: 'live'; clips: TapNowClip[]; projectUrl: string };

const DEFAULT_POLL_MS = 8_000;
const DEFAULT_MAX_MS = 180_000;
const REFERENCE_MAX_BYTES = 32 * 1024 * 1024;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function readAgentStatus(fetchImpl: typeof fetch = fetch): Promise<AgentStatus> {
  try {
    const response = await fetchImpl('/api/laosa/agents/status');
    if (!response.ok) return { libtv: false, tapnow: false, mcpInBrowser: false };
    const body = await readJson(response);
    return {
      libtv: body.libtv === true,
      tapnow: body.tapnow === true,
      mcpInBrowser: false,
    };
  } catch {
    return { libtv: false, tapnow: false, mcpInBrowser: false };
  }
}

export async function uploadLibtvReference(file: File, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (file.size > REFERENCE_MAX_BYTES) throw new Error('reference_too_large');
  const body = new FormData();
  body.append('file', file, file.name);
  const response = await fetchImpl('/api/laosa/libtv/upload', { method: 'POST', body });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'upload');
  const url = parseLibtvUploadUrl(payload);
  if (!url) throw new Error('bad_response');
  return url;
}

async function importLibtvUrl(url: string, fetchImpl: typeof fetch): Promise<TapNowClip> {
  const response = await fetchImpl('/api/laosa/agents/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'import');
  const src = typeof body.src === 'string' ? body.src : '';
  const name = typeof body.name === 'string' ? body.name : '';
  const kind = body.kind === 'video' ? 'video' : body.kind === 'image' ? 'image' : null;
  if (!src.startsWith('/media/uploads/') || !name || !kind) throw new Error('bad_response');
  return { src, name, kind };
}

export async function runLibtv(options: LibtvRunOptions): Promise<LibtvRun> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const status = await readAgentStatus(fetchImpl);
  if (!status.libtv) return { mode: 'demo' };
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;

  let referenceUrl = '';
  if (options.reference) {
    options.onPhase?.('upload');
    referenceUrl = await uploadLibtvReference(options.reference, fetchImpl);
  }
  options.onPhase?.('submit');
  const createdResponse = await fetchImpl('/api/laosa/libtv/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageWithReference(options.prompt, referenceUrl) }),
  });
  const createdBody = await readJson(createdResponse);
  if (createdResponse.status === 409 || createdBody.error === 'missing_key') return { mode: 'demo' };
  if (!createdResponse.ok) throw new Error(typeof createdBody.error === 'string' ? createdBody.error : 'upstream');
  const created = parseLibtvCreated(createdBody);
  if (!created) throw new Error('bad_response');

  const started = now();
  const seen: LibtvMessage[] = [];
  let afterSeq = 0;
  options.onPhase?.('poll');
  while (now() - started <= maxMs) {
    await sleep(pollMs);
    const query = afterSeq > 0 ? `?afterSeq=${afterSeq}` : '';
    const response = await fetchImpl(`/api/laosa/libtv/session/${encodeURIComponent(created.sessionId)}${query}`);
    const body = await readJson(response);
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'upstream');
    const messages = parseLibtvMessages(body);
    seen.push(...messages);
    afterSeq = Math.max(afterSeq, maxMessageSeq(messages));
    const urls = extractLibtvMediaUrls(seen).filter((url) => url !== referenceUrl);
    if (!urls.length) continue;
    options.onPhase?.('import');
    const clips: TapNowClip[] = [];
    for (const url of urls) clips.push(await importLibtvUrl(url, fetchImpl));
    return { mode: 'live', clips, projectUrl: created.projectUrl };
  }
  throw new Error('timeout');
}
