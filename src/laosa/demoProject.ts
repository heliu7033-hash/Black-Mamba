// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — Lao Sa desk sample. Spoken lines and the Remotion picture are
// locked in the document. Style, language, and card size only change packaging.
// No media files: solids, a text mark, and caption cues are enough to show
// chapters, rails, and the card frame.

import type { CaptionsData } from '../captions/types';
import type { ProjectDoc, TimelineItem, TimelineState } from '../editor/types';
import { createProject, docFromTimeline, listProjects } from '../persist/projectStore';
import type { ProjectMeta } from '../persist/projectStoreCoordinators';
import { defaultLaosaPrefs, loadLaosaPrefs, saveLaosaPrefs } from './prefs';
import type { RailClip } from './types';

export const LAOSA_DEMO_NAME = '老萨包装台';
export const LAOSA_DEMO_DESCRIPTION = 'laosa-packaging-demo';

const FPS = 30;
const DURATION = 44 * FPS;

interface Phrase {
  zh: string;
  en: string;
  startMs: number;
  endMs: number;
}

/** Silence between groups is past the chapter gap, so each group becomes a chapter. */
const PHRASES: readonly Phrase[] = [
  { zh: '同一个口播', en: 'Same voiceover', startMs: 200, endMs: 1600 },
  { zh: '内容锁定', en: 'Content locked', startMs: 1700, endMs: 3200 },
  { zh: '只换包装', en: 'Packaging only', startMs: 3300, endMs: 5000 },

  { zh: '九宫格选空位', en: 'Nine-grid picks a cell', startMs: 7200, endMs: 9000 },
  { zh: '避开人物和字幕', en: 'Clear of the person', startMs: 9100, endMs: 11000 },

  { zh: '关键词用小卡', en: 'Keyword: small', startMs: 13200, endMs: 15000 },
  { zh: '步骤关系用中卡', en: 'Steps: medium', startMs: 15100, endMs: 17000 },
  { zh: '完整框架用全卡', en: 'Framework: full', startMs: 17100, endMs: 19200 },

  { zh: '中英只换文字', en: 'Words switch only', startMs: 21400, endMs: 23200 },
  { zh: '声音和时间不动', en: 'Voice and timing stay', startMs: 23300, endMs: 25200 },

  { zh: '系统先打底', en: 'System lays the base', startMs: 27400, endMs: 29200 },
  { zh: '再人工精调', en: 'Then refine by hand', startMs: 29300, endMs: 31200 },
];

function visual(
  id: string,
  track: string,
  name: string,
  item: Pick<TimelineItem, 'kind' | 'props'> & Partial<Pick<TimelineItem, 'transform'>>,
): TimelineItem {
  return {
    id,
    track,
    name,
    startFrame: 0,
    durationInFrames: DURATION,
    ...item,
  };
}

function demoCaptions(): CaptionsData {
  return {
    enabled: true,
    template: 'black-bar',
    pacing: 'phrase',
    bilingual: false,
    translationLang: 'English',
    words: PHRASES.map((phrase) => ({ text: phrase.zh, start: phrase.startMs, end: phrase.endMs })),
    translation: PHRASES.map((phrase) => ({ text: phrase.en, start: phrase.startMs, end: phrase.endMs })),
    styleOverride: { color: '#FCFCFC' },
  };
}

/** Locked studio still plus post-edit captions. Nothing here requires a user file. */
export function laosaDemoTimeline(): TimelineState {
  return {
    fps: FPS,
    width: 1920,
    height: 1080,
    items: [
      visual('laosa-bg', 'track_v1', '炭黑底', { kind: 'solid', props: { color: '#080808' } }),
      visual('laosa-lamp', 'track_v2', '琥珀灯带', {
        kind: 'solid',
        props: { color: '#E18C21' },
        transform: { crop: { left: 0.03, top: 0.06, right: 0.955, bottom: 0.06 } },
      }),
      visual('laosa-figure', 'track_v3', '人物窗', {
        kind: 'solid',
        props: { color: '#1A140C' },
        transform: { crop: { left: 0.16, top: 0.14, right: 0.5, bottom: 0.2 } },
      }),
      visual('laosa-mark', 'track_v4', '内容锁定', {
        kind: 'text',
        props: {
          text: '内容锁定',
          color: '#E18C21',
          fontSize: 84,
          fontWeight: 800,
          align: 'right',
        },
      }),
    ],
    selectedId: null,
    captionsHidden: false,
    trackOrder: ['track_v4', 'track_v3', 'track_v2', 'track_v1', 'track_c1'],
    tracks: {
      track_v1: { kind: 'video', name: '炭黑底' },
      track_v2: { kind: 'video', name: '琥珀灯带' },
      track_v3: { kind: 'video', name: '人物窗' },
      track_v4: { kind: 'video', name: '内容锁定' },
      track_c1: { kind: 'caption', name: '口播字幕', captions: demoCaptions() },
    },
  };
}

export function laosaDemoDoc(): ProjectDoc {
  return docFromTimeline(laosaDemoTimeline(), '老萨口播');
}

/** Music, motion, and B-roll already on the rails so the desk is not an empty scaffold. */
export function laosaDemoRails(): RailClip[] {
  return [
    { id: 'demo-music', rail: 'music', startFrame: 0, durationInFrames: DURATION, label: '床底氛围' },
    { id: 'demo-motion', rail: 'motion', startFrame: 24, durationInFrames: 180, label: '人物大字' },
    { id: 'demo-motion-2', rail: 'motion', startFrame: 420, durationInFrames: 150, label: '要点卡' },
    { id: 'demo-broll', rail: 'broll', startFrame: 300, durationInFrames: 240, label: '补充画面' },
    { id: 'demo-broll-2', rail: 'broll', startFrame: 780, durationInFrames: 210, label: '素材落轨' },
  ];
}

export function seedLaosaDemoPrefs(projectId: string): void {
  saveLaosaPrefs(projectId, {
    ...defaultLaosaPrefs('zh'),
    rails: laosaDemoRails(),
  });
}

let opening: Promise<ProjectMeta> | null = null;

async function openOrCreate(): Promise<ProjectMeta> {
  const existing = (await listProjects()).find((project) => project.description === LAOSA_DEMO_DESCRIPTION);
  if (existing) {
    // A first open can persist empty prefs before this seed lands. The sample
    // has no clip-delete control, so empty rails mean the desk never got its base.
    if (loadLaosaPrefs(existing.id).rails.length === 0) seedLaosaDemoPrefs(existing.id);
    return existing;
  }
  const created = await createProject(LAOSA_DEMO_NAME, laosaDemoDoc(), { description: LAOSA_DEMO_DESCRIPTION });
  seedLaosaDemoPrefs(created.id);
  return created;
}

/** Find the packaging demo or create it. Safe to call from the dashboard and from `#/laosa`. */
export function ensureLaosaDemoProject(): Promise<ProjectMeta> {
  if (!opening) {
    opening = openOrCreate().finally(() => {
      opening = null;
    });
  }
  return opening;
}
