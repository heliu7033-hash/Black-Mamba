// SPDX-License-Identifier: AGPL-3.0-or-later
// LibTV proxy and TapNow HTTP adapter. No live provider calls.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createAgentRuntime,
  deskAgentSecretsFrom,
  parseTapnowUpstream,
  type SavedMedia,
} from './laosa-agents-core.ts';
import { saveRemoteMedia } from './laosa-agents.ts';

const KEY = 'test-libtv-key';
const TAP_KEY = 'test-tapnow-key';

assert.equal(deskAgentSecretsFrom({}).libtvKey, '');
assert.equal(deskAgentSecretsFrom({ LIBTV_ACCESS_KEY: '  abc  ' }).libtvKey, 'abc');
assert.equal(deskAgentSecretsFrom({ VITE_LIBTV_ACCESS_KEY: 'from-vite' }).libtvKey, 'from-vite');
assert.equal(deskAgentSecretsFrom({ OPENAPI_IM_BASE: 'http://evil.example' }).libtvBase, 'https://im.liblib.tv');
assert.equal(deskAgentSecretsFrom({ TAPNOW_API_BASE: 'https://tap.example', TAPNOW_API_KEY: 'k' }).tapnowBase, 'https://tap.example');
assert.equal(deskAgentSecretsFrom({ TAPNOW_API_BASE: 'http://10.0.0.8', TAPNOW_API_KEY: 'k' }).tapnowBase, '');
assert.deepEqual(parseTapnowUpstream({
  job_id: 'job_1',
  status: 'done',
  media_url: 'https://cdn.example/out.mp4',
  media_type: 'video',
}), {
  jobId: 'job_1',
  status: 'done',
  mediaUrl: 'https://cdn.example/out.mp4',
  mediaType: 'video',
});
assert.equal(parseTapnowUpstream({ data: { id: 'n1', status: 'generating' } })?.status, 'generating');

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const req = Readable.from(payload.length ? [payload] : []) as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { 'content-type': 'application/json' };
  return req;
}

function mockRes(): { res: ServerResponse; done: Promise<{ status: number; json: Record<string, unknown> }> } {
  let status = 200;
  let settled = false;
  let resolve: (value: { status: number; json: Record<string, unknown> }) => void = () => {};
  const done = new Promise<{ status: number; json: Record<string, unknown> }>((res) => { resolve = res; });
  const res = {
    get statusCode() { return status; },
    set statusCode(value: number) { status = value; },
    headersSent: false,
    setHeader() {},
    end(chunk?: string) {
      if (settled) return;
      settled = true;
      this.headersSent = true;
      resolve({ status, json: chunk ? JSON.parse(chunk) as Record<string, unknown> : {} });
    },
  };
  return { res: res as unknown as ServerResponse, done };
}

function runtime(fetchImpl: typeof fetch, secrets = deskAgentSecretsFrom({
  LIBTV_ACCESS_KEY: KEY,
  TAPNOW_API_BASE: 'https://tap.example',
  TAPNOW_API_KEY: TAP_KEY,
})) {
  const saved: string[] = [];
  const box = createAgentRuntime({
    secrets: () => secrets,
    fetchImpl,
    saveRemote: async (url): Promise<SavedMedia> => {
      saved.push(url);
      return { src: '/media/uploads/saved.png', kind: url.endsWith('.mp4') ? 'video' : 'image', name: 'saved.png' };
    },
  });
  return { box, saved };
}

async function call(
  box: ReturnType<typeof createAgentRuntime>,
  scope: 'agents' | 'libtv' | 'tapnow',
  method: string,
  url: string,
  body?: unknown,
) {
  const { res, done } = mockRes();
  await box.handle(scope, mockReq(method, url, body), res);
  return done;
}

{
  const upstream: { url: string; authorization: string; body: string }[] = [];
  const { box } = runtime(async (input, init) => {
    const headers = new Headers(init?.headers);
    upstream.push({
      url: String(input),
      authorization: headers.get('authorization') ?? '',
      body: typeof init?.body === 'string' ? init.body : '',
    });
    if (String(input).endsWith('/openapi/session') && init?.method === 'POST') {
      return new Response(JSON.stringify({ data: { sessionId: '90f05e0c-5d08-4148-be40-e30fc7c7bedf', projectUuid: 'p1' } }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: { messages: [{ role: 'assistant', content: 'https://libtv-res.liblib.art/claw/p/a.png' }] },
    }), { status: 200 });
  });
  const status = await call(box, 'agents', 'GET', '/api/laosa/agents/status');
  assert.equal(status.json.libtv, true);
  assert.equal(status.json.tapnow, true);
  assert.equal(status.json.mcpInBrowser, false);
  assert.equal(JSON.stringify(status.json).includes(KEY), false);
  assert.equal(JSON.stringify(status.json).includes(TAP_KEY), false);
  const created = await call(box, 'libtv', 'POST', '/api/laosa/libtv/session', { message: '画一只猫' });
  assert.equal(created.status, 200);
  assert.equal(upstream[0]?.url, 'https://im.liblib.tv/openapi/session');
  assert.equal(upstream[0]?.authorization, `Bearer ${KEY}`);
  assert.equal(JSON.parse(upstream[0]?.body ?? '{}').message, '画一只猫');
  assert.equal(JSON.stringify(created.json).includes(KEY), false);
  const polled = await call(box, 'libtv', 'GET', '/api/laosa/libtv/session/90f05e0c-5d08-4148-be40-e30fc7c7bedf?afterSeq=2');
  assert.equal(polled.status, 200);
  assert.match(upstream[1]?.url ?? '', /\/openapi\/session\/90f05e0c-5d08-4148-be40-e30fc7c7bedf\?afterSeq=2$/);
  const imported = await call(box, 'agents', 'POST', '/api/laosa/agents/import', {
    url: 'https://libtv-res.liblib.art/claw/p/a.png',
  });
  assert.equal(imported.json.src, '/media/uploads/saved.png');
  const rejected = await call(box, 'agents', 'POST', '/api/laosa/agents/import', { url: 'https://evil.example/a.png' });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.json.error, 'url_rejected');
}

{
  const { box } = runtime(async () => {
    throw new Error('should not fetch');
  }, deskAgentSecretsFrom({}));
  const status = await call(box, 'agents', 'GET', '/status');
  assert.equal(status.json.libtv, false);
  assert.equal(status.json.tapnow, false);
  assert.equal(status.json.mcpInBrowser, false);
  const missing = await call(box, 'libtv', 'POST', '/session', { message: '画一只猫' });
  assert.equal(missing.status, 409);
  assert.equal(missing.json.error, 'missing_key');
  const tap = await call(box, 'tapnow', 'POST', '/jobs', { prompt: 'poster', kind: 'image' });
  assert.equal(tap.status, 409);
}

{
  const upstream: string[] = [];
  const { box, saved } = runtime(async (input, init) => {
    upstream.push(`${init?.method ?? 'GET'} ${String(input)}`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${TAP_KEY}`);
    if (init?.method === 'POST') {
      assert.equal(headers.get('content-type'), 'application/json');
      assert.deepEqual(JSON.parse(String(init.body)), { prompt: 'a poster', kind: 'image' });
      return new Response(JSON.stringify({ job_id: 'up_1', status: 'generating' }), { status: 200 });
    }
    return new Response(JSON.stringify({
      job_id: 'up_1',
      status: 'done',
      media_url: 'https://cdn.example/poster.png',
      media_type: 'image',
    }), { status: 200 });
  });
  const submitted = await call(box, 'tapnow', 'POST', '/api/laosa/tapnow/jobs', { prompt: 'a poster', kind: 'image' });
  assert.equal(submitted.json.status, 'generating');
  assert.match(String(submitted.json.jobId), /^tn_/);
  assert.equal(upstream[0], 'POST https://tap.example/v1/generate');
  const done = await call(box, 'tapnow', 'GET', `/jobs/${submitted.json.jobId as string}`);
  assert.equal(done.json.status, 'done');
  const clip = done.json.clip as { src?: string; kind?: string };
  assert.equal(clip.src, '/media/uploads/saved.png');
  assert.equal(clip.kind, 'image');
  assert.deepEqual(saved, ['https://cdn.example/poster.png']);
  assert.equal(JSON.stringify(done.json).includes(TAP_KEY), false);
}

await assert.rejects(
  () => saveRemoteMedia('http://127.0.0.1/secret.png'),
  /unsafe_public_url|private|public/i,
);

console.log('laosa-agents.verify: libtv proxy, tapnow http adapter, no key leakage');
