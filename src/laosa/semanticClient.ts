// SPDX-License-Identifier: AGPL-3.0-or-later
// Bcot — semantic card client. Claude/SSXZ credentials stay on the server.

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

/** True when the server can read Claude/SSXZ credentials (~/.claude/settings.json or ANTHROPIC_*). */
export async function readOpenAiCompatibleKey(): Promise<boolean> {
  const response = await fetch('/api/laosa/semantic-card');
  if (!response.ok) throw new SemanticCardError('unreachable');
  const body = await response.json() as { configured?: boolean };
  return body.configured === true;
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
