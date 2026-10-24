// SPDX-License-Identifier: AGPL-3.0-or-later
// Drive a TapNowAgentClient until a local media clip is ready, or report demo.

import { promptMediaKind } from './libtvExtract';
import { readAgentStatus } from './libtvClient';
import { createTapNowAgentClient, type TapNowClip } from './tapnowClient';

export interface TapnowRunOptions {
  prompt: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPhase?: (phase: 'submit' | 'poll') => void;
}

export type TapnowRun =
  | { mode: 'demo' }
  | { mode: 'live'; clips: TapNowClip[] };

export async function runTapnow(options: TapnowRunOptions): Promise<TapnowRun> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const status = await readAgentStatus(fetchImpl);
  if (!status.tapnow) return { mode: 'demo' };
  const client = createTapNowAgentClient(true, fetchImpl);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? 4_000;
  const maxMs = options.maxMs ?? 180_000;
  const kind = promptMediaKind(options.prompt);
  options.onPhase?.('submit');
  let job;
  try {
    job = await client.submit(options.prompt, kind);
  } catch (error) {
    if (error instanceof Error && error.message === 'missing_key') return { mode: 'demo' };
    throw error;
  }
  if (job.clip) return { mode: 'live', clips: [job.clip] };
  const started = now();
  options.onPhase?.('poll');
  while (now() - started <= maxMs) {
    await sleep(pollMs);
    const polled = await client.poll(job.jobId);
    if (polled.status === 'failed') throw new Error(polled.error || 'failed');
    if (polled.clip) return { mode: 'live', clips: [polled.clip] };
  }
  throw new Error('timeout');
}
