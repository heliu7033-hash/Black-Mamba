// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — semantic card client. The key never leaves the server settings store.

import {
  clipSemanticLines,
  parseCardRecommendation,
  type CardRecommendation,
  type SemanticLine,
} from '../../shared/laosa-card';

export type SemanticErrorCode = 'missing_key' | 'empty_captions' | 'upstream' | 'bad_response' | 'unreachable';

export class SemanticCardError extends Error {
  readonly code: SemanticErrorCode;
  constructor(code: SemanticErrorCode) {
    super(code);
    this.code = code;
  }
}

const KEY_NAMES = ['LLM_OPENAI_API_KEY', 'OPENAI_API_KEY'] as const;

export async function readOpenAiCompatibleKey(): Promise<boolean> {
  const response = await fetch('/api/keys');
  if (!response.ok) throw new SemanticCardError('unreachable');
  const body = await response.json() as { keys?: Record<string, { configured?: boolean }> };
  return KEY_NAMES.some((name) => body.keys?.[name]?.configured === true);
}

export async function requestSemanticCard(lines: readonly SemanticLine[]): Promise<CardRecommendation> {
  const clipped = clipSemanticLines(lines);
  if (!clipped.length) throw new SemanticCardError('empty_captions');
  let response: Response;
  try {
    response = await fetch('/api/laosa/semantic-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: clipped }),
    });
  } catch {
    throw new SemanticCardError('unreachable');
  }
  let body: { size?: unknown; reason?: unknown; error?: unknown } = {};
  try {
    body = await response.json() as typeof body;
  } catch {
    throw new SemanticCardError('bad_response');
  }
  if (!response.ok) {
    const code = body.error;
    if (code === 'missing_key' || code === 'empty_captions' || code === 'upstream' || code === 'bad_response') {
      throw new SemanticCardError(code);
    }
    throw new SemanticCardError('upstream');
  }
  const parsed = parseCardRecommendation(JSON.stringify({ size: body.size, reason: body.reason }));
  if (!parsed) throw new SemanticCardError('bad_response');
  return parsed;
}
