// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — offline S/M/F suggestion for the 老黑剪辑台 demo.
// No network. The real model path stays in semanticClient.ts.

import type { CardRecommendation } from '../../shared/laosa-card';
import type { TimedLine } from './types';

function focusLine(lines: readonly TimedLine[], playheadMs: number): TimedLine {
  const inside = lines.find((line) => playheadMs >= line.startMs && playheadMs < line.endMs);
  if (inside) return inside;
  let best = lines[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const dist = playheadMs < line.startMs
      ? line.startMs - playheadMs
      : Math.max(0, playheadMs - line.endMs);
    if (dist < bestDist) {
      best = line;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Deterministic card size from the caption under the playhead.
 * Reasons are Chinese source strings so the UI can translate them, and each one is marked 演示.
 */
export function demoCardSuggestion(lines: readonly TimedLine[], playheadMs: number): CardRecommendation | null {
  if (!lines.length) return null;
  const text = focusLine(lines, playheadMs).text;
  if (/完整框架|全卡|full frame|full card/i.test(text)) {
    return { size: 'F', reason: '演示：完整框架用全卡' };
  }
  if (/关键词|小卡|keyword|small card/i.test(text)) {
    return { size: 'S', reason: '演示：关键词用小卡' };
  }
  if (/步骤|关系|中卡|step|medium card/i.test(text)) {
    return { size: 'M', reason: '演示：步骤关系用中卡' };
  }
  return { size: 'M', reason: '演示：未命中关键词，先用中卡' };
}
