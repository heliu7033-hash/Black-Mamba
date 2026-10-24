// SPDX-License-Identifier: AGPL-3.0-or-later
// B-CUT — scaffold rails for 智能音乐 / 动效 / B-roll.
// Auto-land finds the next free frame on that rail. Smart fill uses captions
// (and optional semantic size) so the desk stays interactive without a model.

import type { CardSize } from '../../shared/laosa-card';
import type { RailClip, RailKind, TimedLine } from './types';

export const RAIL_PLACEHOLDER: Record<RailKind, string> = {
  music: 'laosa:music',
  motion: 'laosa:motion',
  broll: 'laosa:broll',
};

const DEFAULT_DURATION = 90;
/** Motion cards land about 0.75s ahead of the spoken point. */
const LEAD_FRAMES_AT_30 = 22;

function overlaps(clip: RailClip, start: number, duration: number): boolean {
  return start < clip.startFrame + clip.durationInFrames && start + duration > clip.startFrame;
}

/**
 * Drop a clip onto a rail without covering an existing one.
 * The requested frame wins when it is free; otherwise the clip lands at the end of the blocker.
 */
export function autoLandClip(
  clips: readonly RailClip[],
  rail: RailKind,
  atFrame: number,
  label: string,
  durationInFrames = DEFAULT_DURATION,
  extra?: Partial<Pick<RailClip, 'src' | 'cardSize'>>,
): RailClip[] {
  const duration = Math.max(1, Math.floor(durationInFrames));
  let start = Math.max(0, Math.floor(atFrame));
  const mine = clips
    .filter((clip) => clip.rail === rail)
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame);
  for (const clip of mine) {
    if (overlaps(clip, start, duration)) start = clip.startFrame + clip.durationInFrames;
  }
  const next: RailClip = {
    id: `rail_${rail}_${start}_${mine.length}`,
    rail,
    startFrame: start,
    durationInFrames: duration,
    label: label.trim().slice(0, 120) || RAIL_PLACEHOLDER[rail],
    ...(extra?.src ? { src: extra.src } : {}),
    ...(extra?.cardSize ? { cardSize: extra.cardSize } : {}),
  };
  return [...clips, next];
}

export function removeRailClip(clips: readonly RailClip[], id: string): RailClip[] {
  return clips.filter((clip) => clip.id !== id);
}

export function updateRailClip(
  clips: readonly RailClip[],
  id: string,
  patch: Partial<Pick<RailClip, 'label' | 'cardSize' | 'src'>>,
): RailClip[] {
  return clips.map((clip) => {
    if (clip.id !== id) return clip;
    return {
      ...clip,
      ...(typeof patch.label === 'string' ? { label: patch.label.trim().slice(0, 120) || clip.label } : {}),
      ...(patch.cardSize ? { cardSize: patch.cardSize } : {}),
      ...(patch.src !== undefined ? { src: patch.src || undefined } : {}),
    };
  });
}

function leadFrames(fps: number): number {
  return Math.max(1, Math.round((LEAD_FRAMES_AT_30 / 30) * Math.max(1, fps)));
}

function lineNearPlayhead(lines: readonly TimedLine[], playheadMs: number): TimedLine | null {
  if (!lines.length) return null;
  const covering = lines.find((line) => playheadMs >= line.startMs && playheadMs < line.endMs);
  if (covering) return covering;
  let best: TimedLine | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const mid = (line.startMs + line.endMs) / 2;
    const dist = Math.abs(mid - playheadMs);
    if (dist < bestDist) {
      best = line;
      bestDist = dist;
    }
  }
  return best;
}

function clipLabel(text: string, max = 18): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}

export interface SmartFillOptions {
  fps?: number;
  lines?: readonly TimedLine[];
  /** When set (from semantic recommend), motion clips carry the card size. */
  cardSize?: CardSize;
  reason?: string;
  demo?: boolean;
}

/**
 * Caption-aware smart fill for the three packaging rails.
 * Without a model this still lands labeled clips from the spoken line under the playhead
 * (or a size/reason from a prior semantic recommend). Placeholders (`laosa:*`) are only
 * used when there is no caption text at all.
 */
export function smartFill(
  clips: readonly RailClip[],
  rail: RailKind,
  playheadFrame: number,
  options: SmartFillOptions = {},
): RailClip[] {
  const fps = Math.max(1, options.fps ?? 30);
  const playheadMs = (playheadFrame / fps) * 1000;
  const line = lineNearPlayhead(options.lines ?? [], playheadMs);
  const demoTag = options.demo ? '演示·' : '';

  if (rail === 'music') {
    const label = line
      ? `${demoTag}床乐 · ${clipLabel(line.text, 14)}`
      : `${demoTag}炭黑床乐`;
    const duration = Math.max(DEFAULT_DURATION, Math.round(8 * fps));
    return autoLandClip(clips, rail, playheadFrame, label || RAIL_PLACEHOLDER.music, duration);
  }

  if (rail === 'motion') {
    const size = options.cardSize;
    const sizePrefix = size ? `${size}·` : '';
    const fromReason = options.reason ? clipLabel(options.reason.replace(/^演示[：:]/, ''), 16) : '';
    const fromLine = line ? clipLabel(line.text, 16) : '';
    const label = `${demoTag}${sizePrefix}${fromReason || fromLine || '动效'}`;
    const start = Math.max(0, playheadFrame - leadFrames(fps));
    const duration = size === 'F' ? Math.round(3 * fps) : size === 'S' ? Math.round(1.8 * fps) : DEFAULT_DURATION;
    return autoLandClip(clips, rail, start, label, duration, size ? { cardSize: size } : undefined);
  }

  // broll
  const label = line
    ? `${demoTag}B-roll · ${clipLabel(line.text, 14)}`
    : `${demoTag}B-roll 占位`;
  const duration = line
    ? Math.max(45, Math.round(((line.endMs - line.startMs) / 1000) * fps))
    : DEFAULT_DURATION;
  const start = line ? Math.round((line.startMs / 1000) * fps) : playheadFrame;
  return autoLandClip(clips, rail, start, label, duration);
}

/** @deprecated Use smartFill. Kept so older call sites and verifies keep compiling during the cutover. */
export function stubSmartFill(clips: readonly RailClip[], rail: RailKind, playheadFrame: number): RailClip[] {
  return smartFill(clips, rail, playheadFrame, { demo: true });
}
