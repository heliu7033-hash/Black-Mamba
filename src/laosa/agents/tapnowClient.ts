// SPDX-License-Identifier: AGPL-3.0-or-later
// TapNow agent client. The Vite page cannot open the TapNow MCP session
// (create_hero_image / create_hero_video / get_production_result). Callers use
// this interface: a demo client, or an HTTP client that talks to the local
// /api/laosa/tapnow adapter when TAPNOW_API_BASE and TAPNOW_API_KEY are set.

import type { GeneratedKind } from './libtvExtract';

export interface TapNowClip {
  name: string;
  kind: GeneratedKind;
  src: string;
}

export interface TapNowSubmitResult {
  jobId: string;
  status: 'queued' | 'generating' | 'done' | 'failed';
  clip?: TapNowClip;
}

export interface TapNowPollResult {
  status: 'queued' | 'generating' | 'done' | 'failed';
  clip?: TapNowClip;
  error?: string;
}

export interface TapNowAgentClient {
  readonly mode: 'demo' | 'http';
  submit(prompt: string, kind: GeneratedKind): Promise<TapNowSubmitResult>;
  poll(jobId: string): Promise<TapNowPollResult>;
}

export class DemoTapNowAgentClient implements TapNowAgentClient {
  readonly mode = 'demo' as const;

  async submit(prompt: string): Promise<TapNowSubmitResult> {
    const slug = prompt.trim().slice(0, 12) || 'demo';
    return { jobId: `demo_${slug}`, status: 'generating' };
  }

  async poll(): Promise<TapNowPollResult> {
    return { status: 'done' };
  }
}

interface HttpOptions {
  fetchImpl?: typeof fetch;
}

function clipOf(value: unknown): TapNowClip | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const src = typeof record.src === 'string' ? record.src : '';
  const name = typeof record.name === 'string' ? record.name : '';
  const kind = record.kind === 'video' ? 'video' : record.kind === 'image' ? 'image' : null;
  if (!src.startsWith('/media/uploads/') || !name || !kind) return undefined;
  return { src, name, kind };
}

function statusOf(value: unknown): TapNowSubmitResult['status'] {
  if (value === 'queued' || value === 'done' || value === 'failed' || value === 'generating') return value;
  return 'generating';
}

export class HttpTapNowAgentClient implements TapNowAgentClient {
  readonly mode = 'http' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async submit(prompt: string, kind: GeneratedKind): Promise<TapNowSubmitResult> {
    const response = await this.fetchImpl('/api/laosa/tapnow/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, kind }),
    });
    const body = await response.json() as Record<string, unknown>;
    if (response.status === 409 || body.error === 'missing_key') {
      throw new Error('missing_key');
    }
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'upstream');
    const jobId = typeof body.jobId === 'string' ? body.jobId : '';
    if (!jobId) throw new Error('bad_response');
    return { jobId, status: statusOf(body.status), clip: clipOf(body.clip) };
  }

  async poll(jobId: string): Promise<TapNowPollResult> {
    const response = await this.fetchImpl(`/api/laosa/tapnow/jobs/${encodeURIComponent(jobId)}`);
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      return { status: 'failed', error: typeof body.error === 'string' ? body.error : 'upstream' };
    }
    return { status: statusOf(body.status), clip: clipOf(body.clip), error: typeof body.error === 'string' ? body.error : undefined };
  }
}

export function createTapNowAgentClient(configured: boolean, fetchImpl?: typeof fetch): TapNowAgentClient {
  return configured ? new HttpTapNowAgentClient({ fetchImpl }) : new DemoTapNowAgentClient();
}
