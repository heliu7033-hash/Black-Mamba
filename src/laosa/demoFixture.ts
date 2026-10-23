// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — 老黑剪辑台 sample timeline. Captions, chapters, and rails
// come from this fixture so the desk can be opened without user media.
// Rail clips here are labeled demo packaging, not model output.
// TODO(laosa): real 智能填充 still lives in rails.ts (stubSmartFill).

import type { CaptionsData } from '../captions/types';
import type { TimelineItem, TimelineState } from '../editor/types';
import type { LaosaPrefs, RailClip, RailKind } from './types';

export const LAOHEI_DEMO_NAME = '老黑剪辑台演示';
/** Stable marker so repeat visits reopen the same sample project. */
export const LAOHEI_DEMO_DESCRIPTION = 'laohei-desk-demo-v2';
/** Earlier sample projects share this prefix and are upgraded in place. */
export const LAOHEI_DEMO_DESCRIPTION_PREFIX = 'laohei-desk-demo-';

export const LAOHEI_DEMO_FPS = 30;
const DEMO_SECONDS = 24;
const DEMO_FRAMES = DEMO_SECONDS * LAOHEI_DEMO_FPS;
/** Motion cards land about 0.75s ahead of the spoken point, matching the rail TODO. */
const LEAD_FRAMES = 22;

/** Quiet generated bed served from public/. Not a music model. */
export const LAOHEI_DEMO_BED_SRC = '/demo/laohei-bed.wav';

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

interface DemoSpan {
  id: string;
  label: string;
  startFrame: number;
  durationInFrames: number;
}

function speechFrame(startMs: number): number {
  return Math.round((startMs / 1000) * LAOHEI_DEMO_FPS);
}

function aheadOf(startMs: number, durationInFrames: number): DemoSpan {
  const startFrame = Math.max(0, speechFrame(startMs) - LEAD_FRAMES);
  return { id: '', label: '', startFrame, durationInFrames };
}

/** Motion spans sit ~0.75s before each spoken point and do not overlap. */
const MOTION_SPANS: readonly DemoSpan[] = [
  { id: 'laohei_motion_lock', label: '内容锁定', startFrame: 0, durationInFrames: 90 },
  { ...aheadOf(5200, 90), id: 'laohei_motion_grid', label: '九宫格避让' },
  { ...aheadOf(9200, 56), id: 'laohei_motion_keyword', label: '关键词小卡' },
  { ...aheadOf(11200, 86), id: 'laohei_motion_steps', label: '步骤中卡' },
  { ...aheadOf(15600, 90), id: 'laohei_motion_frame', label: '完整框架' },
  { ...aheadOf(20000, 90), id: 'laohei_motion_lang', label: '中英换字' },
];

const BROLL_SPANS: readonly DemoSpan[] = [
  { id: 'laohei_broll_speaker', label: '人物避让', startFrame: speechFrame(5200), durationInFrames: 66 },
  { id: 'laohei_broll_cards', label: '卡型对照', startFrame: speechFrame(9200), durationInFrames: 114 },
  { id: 'laohei_broll_frame', label: '框架示意', startFrame: speechFrame(15600), durationInFrames: 90 },
];

function railClip(span: DemoSpan, rail: RailKind): RailClip {
  return {
    id: span.id,
    rail,
    startFrame: span.startFrame,
    durationInFrames: span.durationInFrames,
    label: span.label,
  };
}

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

function overlayItem(span: DemoSpan): TimelineItem {
  return {
    id: `laohei_card_${span.id}`,
    track: 'V3',
    startFrame: span.startFrame,
    durationInFrames: span.durationInFrames,
    kind: 'text',
    name: span.label,
    width: 1920,
    height: 1080,
    props: {
      text: span.label,
      fontSize: 42,
      fontWeight: 700,
      color: '#080808',
      align: 'center',
      bgEnabled: true,
      bgColor: '#E18C21',
      bgBorder: '0',
      bgRadius: 12,
      bgPaddingX: 28,
      bgPaddingY: 12,
      bgBlur: 0,
      bgShadow: 'none',
      textShadow: 'none',
    },
    transform: { x: 28, y: -36 },
  };
}

/** Locked Remotion picture plus short amber badges and a quiet bed. No user media files. */
export function laoheiDemoTimeline(): TimelineState {
  const stage: TimelineItem = {
    id: 'laohei_stage',
    track: 'V1',
    startFrame: 0,
    durationInFrames: DEMO_FRAMES,
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
    durationInFrames: DEMO_FRAMES,
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
  const bed: TimelineItem = {
    id: 'laohei_bed',
    track: 'A1',
    startFrame: 0,
    durationInFrames: DEMO_FRAMES,
    kind: 'audio',
    name: '炭黑床乐',
    src: LAOHEI_DEMO_BED_SRC,
    volume: 0.2,
  };
  return {
    fps: LAOHEI_DEMO_FPS,
    width: 1920,
    height: 1080,
    items: [stage, title, ...MOTION_SPANS.map(overlayItem), bed],
    selectedId: title.id,
    selectedIds: [title.id],
    trackOrder: ['V3', 'V2', 'V1', 'A1', 'C1'],
    tracks: {
      V3: { kind: 'video', name: '包装示意' },
      V2: { kind: 'video' },
      V1: { kind: 'video' },
      A1: { kind: 'audio', name: '炭黑床乐' },
      C1: { kind: 'caption', name: '剪后字幕', captions: demoCaptions() },
    },
  };
}

/** Default packaging: 黑曼巴炭黑琥珀, 中文, medium card, top-right anchor, finished rails. */
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
      railClip({ id: 'laohei_music', label: '炭黑床乐', startFrame: 0, durationInFrames: DEMO_FRAMES }, 'music'),
      ...MOTION_SPANS.map((span) => railClip(span, 'motion')),
      ...BROLL_SPANS.map((span) => railClip(span, 'broll')),
    ],
  };
}
