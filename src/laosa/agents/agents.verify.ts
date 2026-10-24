// SPDX-License-Identifier: AGPL-3.0-or-later
// LibTV extraction, TapNow client, and timeline placement. No live network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCommands } from '../../editor/storeCommandBuilder';
import { projectReduce } from '../../editor/reduce';
import type { AnyAction, ProjectDispatch } from '../../editor/reduce';
import { isHistoryControlAction } from '../../editor/reduce';
import type { MediaAsset, ProjectDoc, TimelineState } from '../../editor/types';
import {
  extractLibtvMediaUrls,
  isLibtvResultUrl,
  messageWithReference,
  parseLibtvCreated,
  promptMediaKind,
} from './libtvExtract';
import { runLibtv } from './libtvClient';
import { placeGeneratedAssets } from './placeGenerated';
import { runTapnow } from './runTapnow';
import { createTapNowAgentClient, DemoTapNowAgentClient, HttpTapNowAgentClient } from './tapnowClient';

const RESULT = 'https://libtv-res.liblib.art/claw/proj/cat.png';
const VIDEO = 'https://libtv-res.liblib.art/claw/proj/shot.mp4';
const REFERENCE = 'https://libtv-res.liblib.art/claw/proj/ref.jpg';

assert.equal(isLibtvResultUrl(RESULT), true);
assert.equal(isLibtvResultUrl(VIDEO), true);
assert.equal(isLibtvResultUrl('https://libtv-res.liblib.art/claw/a.jpeg'), true);
assert.equal(isLibtvResultUrl('https://libtv-res.liblib.art/claw/a.webp'), true);
assert.equal(isLibtvResultUrl('https://libtv-res.liblib.art/claw/a.mov'), true);
assert.equal(isLibtvResultUrl('https://libtv-res.liblib.art/claw/a.webm'), true);
assert.equal(isLibtvResultUrl('http://libtv-res.liblib.art/claw/a.png'), false);
assert.equal(isLibtvResultUrl('https://evil.example/a.png'), false);
assert.equal(isLibtvResultUrl('https://user:pass@libtv-res.liblib.art/a.png'), false);
assert.equal(isLibtvResultUrl('https://libtv-res.liblib.art/a.txt'), false);

assert.equal(promptMediaKind('画一只炭黑的猫'), 'image');
assert.equal(promptMediaKind('生一个动漫视频'), 'video');
assert.equal(promptMediaKind('a slow motion clip'), 'video');

const urls = extractLibtvMediaUrls([
  { role: 'user', content: `参考：${REFERENCE}` },
  { role: 'assistant', content: `done ${RESULT} and ${VIDEO}` },
  {
    role: 'tool',
    content: JSON.stringify({ task_result: { images: [{ previewPath: 'https://libtv-res.liblib.art/claw/proj/tool.png' }] } }),
  },
  { role: 'tool', content: 'not json https://libtv-res.liblib.art/claw/proj/tool.mp4' },
]);
assert.deepEqual(urls, [
  RESULT,
  VIDEO,
  'https://libtv-res.liblib.art/claw/proj/tool.png',
  'https://libtv-res.liblib.art/claw/proj/tool.mp4',
]);
assert.equal(urls.includes(REFERENCE), false, 'a reference pasted by the user is not a result');

assert.equal(messageWithReference('画一只猫', REFERENCE), `画一只猫\n参考：${REFERENCE}`);
assert.equal(messageWithReference('  画一只猫  '), '画一只猫');
assert.equal(parseLibtvCreated({ data: { sessionId: '90f05e0c-5d08-4148-be40-e30fc7c7bedf', projectUuid: 'abc' } })?.projectUrl,
  'https://www.liblib.tv/canvas?projectId=abc');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

{
  let calls = 0;
  const result = await runLibtv({
    prompt: '画一只猫',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { libtv: false, tapnow: false, mcpInBrowser: true });
    },
  });
  assert.equal(result.mode, 'demo');
  assert.equal(calls, 1, 'demo mode does not open a LibTV session');
}

{
  const calls: string[] = [];
  let clock = 0;
  const sessionId = '90f05e0c-5d08-4148-be40-e30fc7c7bedf';
  const result = await runLibtv({
    prompt: '画一只猫',
    pollMs: 8,
    maxMs: 30,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/api/laosa/agents/status')) return jsonResponse(200, { libtv: true, tapnow: false, mcpInBrowser: false });
      if (url.endsWith('/api/laosa/libtv/session') && init?.method === 'POST') {
        assert.equal(JSON.parse(String(init.body)).message, '画一只猫');
        return jsonResponse(200, { data: { sessionId, projectUuid: 'abc' } });
      }
      if (url.includes(`/api/laosa/libtv/session/${sessionId}`)) {
        return jsonResponse(200, { data: { messages: [{ role: 'assistant', seq: 2, content: RESULT }] } });
      }
      if (url.endsWith('/api/laosa/agents/import')) {
        assert.equal(JSON.parse(String(init?.body)).url, RESULT);
        return jsonResponse(200, { src: '/media/uploads/cat.png', kind: 'image', name: 'cat.png' });
      }
      return jsonResponse(500, { error: 'unexpected' });
    },
  });
  assert.equal(result.mode, 'live');
  if (result.mode === 'live') {
    assert.equal(result.clips[0]?.src, '/media/uploads/cat.png');
    assert.equal(result.projectUrl, 'https://www.liblib.tv/canvas?projectId=abc');
  }
  assert.equal(calls.some((call) => call.startsWith('POST https://im.liblib.tv')), false, 'the browser never calls LibTV directly');
}

{
  const demo = createTapNowAgentClient(false);
  assert.ok(demo instanceof DemoTapNowAgentClient);
  assert.equal(demo.mode, 'demo');
  const http = createTapNowAgentClient(true, fetch);
  assert.ok(http instanceof HttpTapNowAgentClient);
  assert.equal(http.mode, 'http');
  const skipped = await runTapnow({
    prompt: 'a poster',
    fetchImpl: async () => jsonResponse(200, { libtv: false, tapnow: false, mcpInBrowser: false }),
  });
  assert.equal(skipped.mode, 'demo');
}

{
  let polls = 0;
  let clock = 0;
  const result = await runTapnow({
    prompt: '生一个视频',
    pollMs: 4,
    maxMs: 20,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/status')) return jsonResponse(200, { libtv: false, tapnow: true, mcpInBrowser: false });
      if (url.endsWith('/api/laosa/tapnow/jobs') && init?.method === 'POST') {
        assert.equal(JSON.parse(String(init.body)).kind, 'video');
        return jsonResponse(200, { jobId: 'tn_1', status: 'generating' });
      }
      polls += 1;
      if (polls === 1) return jsonResponse(200, { jobId: 'tn_1', status: 'generating' });
      return jsonResponse(200, {
        jobId: 'tn_1',
        status: 'done',
        clip: { src: '/media/uploads/shot.mp4', kind: 'video', name: 'shot.mp4' },
      });
    },
  });
  assert.equal(result.mode, 'live');
  if (result.mode === 'live') assert.equal(result.clips[0]?.kind, 'video');
  assert.equal(polls, 2);
}

const isProjectAction = (action: Parameters<ProjectDispatch>[0]): action is AnyAction => !isHistoryControlAction(action);

function harness(doc: ProjectDoc) {
  let current = doc;
  const dispatch: ProjectDispatch = (action) => {
    if (!isProjectAction(action)) return;
    current = projectReduce(current, action);
  };
  return { commands: buildCommands(dispatch, () => current), doc: () => current };
}

const doc = (): ProjectDoc => ({
  version: 3,
  assets: [],
  mediaFolders: [],
  timelines: [{
    id: 'tl1', name: '序列 1', fps: 30, width: 1920, height: 1080,
    selectedId: null, items: [],
    trackOrder: ['track_v1'],
    tracks: { track_v1: { kind: 'video' } },
  }],
  activeTimelineId: 'tl1',
} as unknown as ProjectDoc);

{
  const box = harness(doc());
  const first: MediaAsset = {
    id: 'desk_img', name: 'LibTV · 海报.png', kind: 'image',
    src: '/media/uploads/desk.png', durationInFrames: 90,
  };
  const timeline = () => box.doc().timelines[0] as unknown as TimelineState;
  const ids = placeGeneratedAssets(box.commands, timeline(), [first], 'LibTV');
  assert.equal(ids.length, 1);
  assert.equal(box.doc().assets.length, 1);
  assert.equal(timeline().items.length, 1);
  assert.equal(timeline().items[0]?.startFrame, 0);
  assert.equal(timeline().items[0]?.name, 'LibTV · 海报.png');
  const second: MediaAsset = { ...first, id: 'desk_img_2', name: 'LibTV · 第二张.png' };
  placeGeneratedAssets(box.commands, timeline(), [second], 'LibTV');
  assert.equal(timeline().items.length, 2);
  assert.equal(timeline().items[1]?.startFrame, 90);
  const named = Object.values(timeline().tracks ?? {}).filter((track) => track?.name === 'LibTV');
  assert.equal(named.length, 1, 'repeat generations reuse the LibTV track');
}

const timelineSource = readFileSync(new URL('../../components/timeline/Timeline.tsx', import.meta.url), 'utf8');
assert.match(timelineSource, /<DeskAgentDock/);
const dockSource = readFileSync(new URL('../DeskAgentDock.tsx', import.meta.url), 'utf8');
assert.match(dockSource, /data-desk-agent="libtv"/);
assert.match(dockSource, /data-desk-agent="tapnow"/);
assert.match(dockSource, /\/laosa\/libtv\.svg/);
assert.match(dockSource, /\/laosa\/tapnow\.svg/);
assert.doesNotMatch(dockSource, /mcpInBrowser:\s*true/);

console.log('laosa agents.verify: libtv extract, demo fallback, tapnow client, timeline placement');
