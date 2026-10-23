// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — Astra-style chapters from post-edit caption lines.
// Boundaries follow silence and sentence breaks. They do not rewrite the timeline.

import type { ChapterMark, TimedLine } from './types';

const GAP_MS = 1200;
const MIN_CHAPTER_MS = 2500;
const SENTENCE_SPLIT_MS = 8000;
const TITLE_CHARS = 48;

function cleanLines(lines: readonly TimedLine[]): TimedLine[] {
  return lines
    .map((line) => ({
      text: line.text.replace(/\s+/g, ' ').trim(),
      startMs: line.startMs,
      endMs: line.endMs,
    }))
    .filter((line) => line.text.length > 0 && Number.isFinite(line.startMs) && Number.isFinite(line.endMs) && line.endMs > line.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function isCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

export function joinCaptionText(parts: readonly string[]): string {
  const text = parts.map((part) => part.trim()).filter(Boolean);
  if (!text.length) return '';
  const joiner = text.some(isCjk) ? '' : ' ';
  return text.join(joiner).replace(/\s+/g, ' ').trim();
}

function endsSentence(text: string): boolean {
  return /[。！？!?]$/.test(text.trim());
}

function titleOf(group: readonly TimedLine[]): string {
  const title = joinCaptionText(group.map((line) => line.text)).slice(0, TITLE_CHARS);
  return title || '…';
}

function span(group: readonly TimedLine[]): number {
  return group[group.length - 1]!.endMs - group[0]!.startMs;
}

/** Group post-edit caption lines into chapter marks. */
export function detectChapters(lines: readonly TimedLine[]): ChapterMark[] {
  const cleaned = cleanLines(lines);
  if (!cleaned.length) return [];
  const groups: TimedLine[][] = [[cleaned[0]!]];
  for (let index = 1; index < cleaned.length; index += 1) {
    const current = cleaned[index]!;
    const previous = cleaned[index - 1]!;
    const group = groups[groups.length - 1]!;
    const gap = current.startMs - previous.endMs;
    const sentenceBreak = endsSentence(previous.text) && span(group) >= SENTENCE_SPLIT_MS;
    if (gap >= GAP_MS || sentenceBreak) groups.push([current]);
    else group.push(current);
  }
  const merged: TimedLine[][] = [];
  for (const group of groups) {
    const previous = merged[merged.length - 1];
    const gap = previous ? group[0]!.startMs - previous[previous.length - 1]!.endMs : GAP_MS;
    // A pause already earned its own chapter. Only swallow a short fragment that
    // was split off a nearby sentence, so silence stays a boundary.
    if (previous && span(group) < MIN_CHAPTER_MS && gap < GAP_MS) previous.push(...group);
    else merged.push([...group]);
  }
  return merged.map((group, index) => ({
    id: `ch-${index + 1}`,
    startMs: group[0]!.startMs,
    endMs: group[group.length - 1]!.endMs,
    title: titleOf(group),
  }));
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function chapterAt(chapters: readonly ChapterMark[], timeMs: number): ChapterMark | null {
  if (!chapters.length) return null;
  const hit = chapters.find((chapter, index) => {
    const end = index === chapters.length - 1 ? Number.POSITIVE_INFINITY : chapter.endMs;
    return timeMs >= chapter.startMs && timeMs < end;
  });
  return hit ?? null;
}
