// SPDX-License-Identifier: AGPL-3.0-or-later
// 老黑剪辑台: style tokens, prefs, chapters, rail auto-land, card JSON, and the sample timeline.
import assert from 'node:assert/strict';
import {
  extractModelText,
  parseCardRecommendation,
  semanticUserPrompt,
} from '../../shared/laosa-card';
import { packagingLines } from './captionLines';
import { LAOHEI_DEMO_CUES, laoheiDemoPrefs, laoheiDemoTimeline } from './demoFixture';
import { docFromTimeline } from '../persist/projectStore';
import { packagingLinesFromTimeline } from './timelineLines';
import { chapterAt, detectChapters, joinCaptionText } from './chapters';
import {
  clearLaosaPrefs,
  defaultLaosaPrefs,
  ensureLaosaPrefs,
  loadCaptionExportLanguage,
  loadLaosaPrefs,
  parseLaosaPrefs,
  saveLaosaPrefs,
} from './prefs';
import { autoLandClip, stubSmartFill } from './rails';
import { DEFAULT_LAOSA_STYLE, LAOSA_STYLES, laosaStyleVars, styleById } from './styles';

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key: string, value: string) => { mem.set(key, String(value)); },
    removeItem: (key: string) => { mem.delete(key); },
    clear: () => mem.clear(),
    key: () => null,
    get length() { return mem.size; },
  },
});

const blackmamba = styleById(DEFAULT_LAOSA_STYLE);
assert.equal(LAOSA_STYLES.length >= 3, true, 'at least three packaging styles');
assert.equal(new Set(LAOSA_STYLES.map((style) => style.id)).size, LAOSA_STYLES.length);
assert.equal(blackmamba.id, 'blackmamba');
assert.equal(blackmamba.bg, '#080808');
assert.equal(blackmamba.accent, '#E18C21');
assert.equal(blackmamba.fg, '#FCFCFC');
const vars = laosaStyleVars(blackmamba);
assert.equal(vars['--ls-bg'], '#080808');
assert.equal(vars['--ls-accent'], '#E18C21');
assert.equal(vars['--ls-fg'], '#FCFCFC');
assert.equal(vars['--cc-bg'], '#080808');
assert.equal(vars['--cc-accent'], '#E18C21');
assert.equal(styleById('nope').id, 'blackmamba');
assert.equal(styleById('cold').fg, '#F4F7FB');

const projectId = 'laosa-verify';
mem.clear();
assert.equal(loadLaosaPrefs(projectId, 'en').language, 'en');
assert.equal(loadLaosaPrefs(projectId, 'en').styleId, 'blackmamba');
saveLaosaPrefs(projectId, {
  ...defaultLaosaPrefs('zh'),
  styleId: 'fresh',
  language: 'en',
  cardSize: 'F',
  anchor: 'tr',
  byItem: { clip1: { size: 'S', anchor: 'bl' } },
  rails: [{ id: 'r1', rail: 'music', startFrame: 0, durationInFrames: 30, label: 'bed' }],
});
const loaded = loadLaosaPrefs(projectId);
assert.equal(loaded.styleId, 'fresh');
assert.equal(loaded.language, 'en');
assert.equal(loaded.cardSize, 'F');
assert.equal(loaded.byItem.clip1?.anchor, 'bl');
assert.equal(loaded.rails[0]?.label, 'bed');
assert.equal(loadCaptionExportLanguage(projectId), 'en');
assert.equal(parseLaosaPrefs('{"styleId":"nope","cardSize":"X","language":"en"}').styleId, 'blackmamba');
assert.equal(parseLaosaPrefs('{"styleId":"nope","cardSize":"X","language":"en"}').cardSize, 'M');
clearLaosaPrefs(projectId);
assert.equal(loadLaosaPrefs(projectId).styleId, 'blackmamba');
assert.equal(loadCaptionExportLanguage(projectId), 'zh');
assert.equal(ensureLaosaPrefs(projectId, 'en').language, 'en');
assert.equal(loadCaptionExportLanguage(projectId), 'en', 'first open stores the caption/export language');

const chapters = detectChapters([
  { text: '开场', startMs: 0, endMs: 800 },
  { text: '目标', startMs: 900, endMs: 1600 },
  { text: '九宫格避让', startMs: 4000, endMs: 5200 },
  { text: '人物窗', startMs: 5300, endMs: 6100 },
  { text: '收束', startMs: 9000, endMs: 9800 },
]);
assert.equal(chapters.length, 3, 'silence gaps open new chapters');
assert.equal(chapters[0]?.title.startsWith('开场'), true);
assert.equal(chapters[1]?.startMs, 4000);
assert.equal(chapterAt(chapters, 4100)?.id, chapters[1]?.id);
assert.equal(joinCaptionText(['Same', 'content']), 'Same content');
assert.equal(joinCaptionText(['内容', '锁定']), '内容锁定');

const shortTail = detectChapters([
  { text: '第一段说明已经比较完整。', startMs: 0, endMs: 9000 },
  { text: '短', startMs: 9100, endMs: 9400 },
]);
assert.equal(shortTail.length, 1, 'a short trailing group merges into the previous chapter');

const packs = packagingLines([
  {
    words: [{ text: '内容没有变', startMs: 0, endMs: 1000 }],
    translation: [{ text: 'Same content', startMs: 0, endMs: 1000 }],
  },
], 'en');
assert.equal(packs[0]?.text, 'Same content');
assert.equal(packs[0]?.endMs, 1000, 'language switch keeps the caption timing');
assert.equal(packagingLines([{ words: [{ text: '内容没有变', startMs: 0, endMs: 1000 }] }], 'en')[0]?.text, '内容没有变');

let rails = autoLandClip([], 'broll', 10, 'cover.mp4', 30);
rails = autoLandClip(rails, 'broll', 20, 'next.mp4', 30);
assert.equal(rails[1]?.startFrame, 40, 'overlapping drop lands after the clip already on the rail');
rails = autoLandClip(rails, 'music', 20, 'bed.wav', 15);
assert.equal(rails[2]?.startFrame, 20, 'a free frame on another rail stays put');
const filled = stubSmartFill([], 'motion', 12);
assert.equal(filled[0]?.label, 'laosa:motion');
assert.equal(filled[0]?.startFrame, 12);

assert.deepEqual(parseCardRecommendation('{"size":"S","reason":"关键词点题"}'), { size: 'S', reason: '关键词点题' });
assert.deepEqual(
  parseCardRecommendation('```json\n{"size":"full","reason":"完整框架"}\n```'),
  { size: 'F', reason: '完整框架' },
);
assert.equal(parseCardRecommendation('{"size":"X","reason":"nope"}'), null);
assert.equal(parseCardRecommendation('not json'), null);
assert.match(semanticUserPrompt([{ text: ' hello ', startMs: 12.4 }]), /1\. \[12\] hello/);
assert.equal(
  extractModelText({ choices: [{ message: { content: '{"size":"M","reason":"步骤"}' } }] }),
  '{"size":"M","reason":"步骤"}',
);
assert.equal(
  extractModelText({ output: [{ content: [{ text: '{"size":"F","reason":"框架"}' }] }] }),
  '{"size":"F","reason":"框架"}',
);

const demoDoc = docFromTimeline(laoheiDemoTimeline(), '老黑剪辑台');
const demoTimeline = demoDoc.timelines[0]!;
const demoZh = packagingLinesFromTimeline(demoTimeline, 'zh');
const demoEn = packagingLinesFromTimeline(demoTimeline, 'en');
assert.equal(demoZh.length, LAOHEI_DEMO_CUES.length, 'sample captions survive project normalization');
assert.equal(demoZh[0]?.text, '内容没有变');
assert.equal(demoEn[0]?.text, 'Same content');
assert.equal(demoZh[0]?.startMs, demoEn[0]?.startMs, 'sample language switch keeps timing');
assert.equal(demoZh[0]?.endMs, demoEn[0]?.endMs);
const demoChapters = detectChapters(demoZh);
assert.equal(demoChapters.length >= 4, true, 'sample captions open several chapters');
const demoPrefs = laoheiDemoPrefs();
assert.equal(demoPrefs.styleId, 'blackmamba');
assert.equal(demoPrefs.language, 'zh');
assert.equal(demoPrefs.cardSize, 'M');
assert.equal(demoPrefs.anchor, 'tr');
assert.deepEqual(demoPrefs.rails.map((clip) => clip.rail), ['music', 'motion', 'broll']);

console.log('laosa.verify: styles, prefs, chapters, rails, semantic card, sample timeline');
