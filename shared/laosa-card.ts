// SPDX-License-Identifier: AGPL-3.0-or-later
// Bcot — 老黑剪辑台 semantic card contract. Shared by the local API and the editor.
// The spoken content stays locked; this only classifies packaging size.

export type CardSize = 'S' | 'M' | 'F';

export interface SemanticLine {
  text: string;
  startMs: number;
  endMs?: number;
}

export interface CardRecommendation {
  size: CardSize;
  reason: string;
}

export const SEMANTIC_CARD_SYSTEM = [
  'You assign one motion-card size for a voiceover.',
  'The spoken content stays locked. Only the card size changes.',
  'S = a keyword, a name, or a single point (corner card).',
  'M = a step, a relationship, or a comparison (half card).',
  'F = a full framework or a list of points (full card).',
  'Reply with JSON only: {"size":"S"|"M"|"F","reason":"short reason, max 40 characters"}.',
].join('\n');

const MAX_LINES = 60;
const MAX_LINE_CHARS = 120;
const MAX_REASON = 80;

export function clipSemanticLines(lines: readonly SemanticLine[]): SemanticLine[] {
  return lines
    .filter((line) => typeof line.text === 'string' && line.text.trim().length > 0 && Number.isFinite(line.startMs))
    .slice(0, MAX_LINES)
    .map((line) => ({
      text: line.text.trim().slice(0, MAX_LINE_CHARS),
      startMs: Math.max(0, Math.round(line.startMs)),
      ...(typeof line.endMs === 'number' && Number.isFinite(line.endMs) ? { endMs: Math.max(0, Math.round(line.endMs)) } : {}),
    }));
}

export function semanticUserPrompt(lines: readonly SemanticLine[]): string {
  return clipSemanticLines(lines)
    .map((line, index) => `${index + 1}. [${line.startMs}] ${line.text}`)
    .join('\n');
}

function sizeFromToken(value: unknown): CardSize | null {
  if (typeof value !== 'string') return null;
  const token = value.trim().toUpperCase();
  if (token === 'S' || token === 'SMALL' || token.startsWith('小')) return 'S';
  if (token === 'M' || token === 'MEDIUM' || token.startsWith('中') || token.startsWith('半')) return 'M';
  if (token === 'F' || token === 'FULL' || token.startsWith('全')) return 'F';
  return null;
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

export function parseCardRecommendation(raw: string): CardRecommendation | null {
  const source = stripFence(raw);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(source);
  } catch {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(source.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const size = sizeFromToken(record.size ?? record.card ?? record.cardSize);
  if (!size) return null;
  const reason = String(record.reason ?? record.why ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON);
  if (!reason) return null;
  return { size, reason };
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    const record = part as Record<string, unknown>;
    return typeof record.text === 'string' ? record.text : '';
  }).join('');
}

/** Pull the assistant text out of a Chat Completions or Responses payload. */
export function extractModelText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;
  const choices = record.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const message = (choices[0] as Record<string, unknown>).message;
    if (message && typeof message === 'object') {
      const text = textFromContent((message as Record<string, unknown>).content);
      if (text) return text;
    }
  }
  const output = record.output;
  if (!Array.isArray(output)) return '';
  return output.map((item) => {
    if (!item || typeof item !== 'object') return '';
    return textFromContent((item as Record<string, unknown>).content);
  }).join('');
}
