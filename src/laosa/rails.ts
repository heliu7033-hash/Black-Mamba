// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — scaffold rails for 智能音乐 / 动效 / B-roll.
// Auto-land finds the next free frame on that rail. Model fill is intentionally stubbed.

import type { RailClip, RailKind } from './types';

export const RAIL_PLACEHOLDER: Record<RailKind, string> = {
  music: 'laosa:music',
  motion: 'laosa:motion',
  broll: 'laosa:broll',
};

const DEFAULT_DURATION = 90;

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
  };
  return [...clips, next];
}

/**
 * TODO(laosa): replace this scaffold with model-backed fill.
 * 智能音乐 should pick a bed and beat-align it.
 * 动效 should land motion cards about 0.75s ahead of the spoken point.
 * B-roll should cover cuts from supplemental footage.
 * Until those models are wired, auto-land inserts a labeled placeholder.
 */
export function stubSmartFill(clips: readonly RailClip[], rail: RailKind, playheadFrame: number): RailClip[] {
  return autoLandClip(clips, rail, playheadFrame, RAIL_PLACEHOLDER[rail], DEFAULT_DURATION);
}
