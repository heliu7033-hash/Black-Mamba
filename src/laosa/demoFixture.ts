// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — 老黑剪辑台 sample timeline. Captions, chapters, and rails
// come from this fixture so the desk can be opened without user media.

import type { CaptionsData } from '../captions/types';
import type { TimelineItem, TimelineState } from '../editor/types';
import type { LaosaPrefs } from './types';

export const LAOHEI_DEMO_NAME = '老黑剪辑台演示';
/** Stable marker so repeat visits reopen the same sample project. */
export const LAOHEI_DEMO_DESCRIPTION = 'laohei-desk-demo-v1';

export const LAOHEI_DEMO_FPS = 30;
const DEMO_SECONDS = 24;

export interface DemoCue {
  text: string;
  en: string;
  startMs: number;
  endMs: number;
}

/** Post-edit caption lines. Gaps of 1.2s or more open a new chapter. */
export const LAOHEI_DEMO_CUES: readonly DemoCue[] = [
  { text: '内容没有变', en: 'Same content', startMs: 0, endMs: 1800 },
  { text: '只换包装。', en: 'Packaging only.', startMs: 1900, endMs: 3400 },
  { text: '九宫格避让人物。', en: 'Nine-grid clears the speaker.', startMs: 5200, endMs: 7400 },
  { text: '关键词用小卡。', en: 'Keywords use a small card.', startMs: 9200, endMs: 11000 },
  { text: '步骤关系用中卡。', en: 'Steps use a medium card.', startMs: 11200, endMs: 13000 },
  { text: '完整框架用全卡。', en: 'A full frame uses a full card.', startMs: 15600, endMs: 17800 },
  { text: '中英只换字。', en: 'Language swaps the words.', startMs: 20000, endMs: 22000 },
];

function demoCaptions(): CaptionsData {
  return {
    enabled: true,
    template: 'black-bar',
    pacing: 'phrase',
    sourceMode: 'item',
    sourceEntries: [{
      id: 'lane_laohei_demo',
      itemId: 'manual:lane_laohei_demo',
      label: '剪后口播',
      words: LAOHEI_DEMO_CUES.map((cue) => ({
        text: cue.text,
        start: cue.startMs,
        end: cue.endMs,
      })),
    }],
    translation: LAOHEI_DEMO_CUES.map((cue) => ({
      text: cue.en,
      start: cue.startMs,
      end: cue.endMs,
    })),
  };
}

/** Locked Remotion picture: a charcoal stage and a title. No user media files. */
export function laoheiDemoTimeline(): TimelineState {
  const durationInFrames = DEMO_SECONDS * LAOHEI_DEMO_FPS;
  const stage: TimelineItem = {
    id: 'laohei_stage',
    track: 'V1',
    startFrame: 0,
    durationInFrames,
    kind: 'solid',
    name: '炭黑舞台',
    width: 1920,
    height: 1080,
    props: { color: '#080808' },
  };
  const title: TimelineItem = {
    id: 'laohei_title',
    track: 'V2',
    startFrame: 0,
    durationInFrames,
    kind: 'text',
    name: '锁定口播',
    width: 1920,
    height: 1080,
    props: {
      text: '同一口播\n内容锁定',
      fontSize: 84,
      fontWeight: 700,
      color: '#FCFCFC',
      align: 'center',
    },
  };
  return {
    fps: LAOHEI_DEMO_FPS,
    width: 1920,
    height: 1080,
    items: [stage, title],
    selectedId: title.id,
    selectedIds: [title.id],
    trackOrder: ['V2', 'V1', 'C1'],
    tracks: {
      V2: { kind: 'video' },
      V1: { kind: 'video' },
      C1: { kind: 'caption', name: '剪后字幕', captions: demoCaptions() },
    },
  };
}

/** Default packaging for the sample: 黑曼巴炭黑琥珀, 中文, medium card, top-right anchor, three rails. */
export function laoheiDemoPrefs(): LaosaPrefs {
  return {
    styleId: 'blackmamba',
    language: 'zh',
    cardSize: 'M',
    anchor: 'tr',
    byItem: {
      laohei_title: { size: 'M', anchor: 'tr' },
    },
    rails: [
      { id: 'laohei_music', rail: 'music', startFrame: 0, durationInFrames: 240, label: '床乐' },
      { id: 'laohei_motion', rail: 'motion', startFrame: 30, durationInFrames: 120, label: '图解提前' },
      { id: 'laohei_broll', rail: 'broll', startFrame: 150, durationInFrames: 180, label: '补充画面' },
    ],
  };
}
