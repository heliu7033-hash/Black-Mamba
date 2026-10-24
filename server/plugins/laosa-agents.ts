// SPDX-License-Identifier: AGPL-3.0-or-later
// Local routes for the LibTV and TapNow desk agents. Keys are read from the
// process environment, Vite's loaded env, and .env.local. Nothing secret is
// written into the client bundle.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { kindFromMediaUrl } from '../../src/laosa/agents/libtvExtract.ts';
import { uploadDir } from '../media-dir.ts';
import { parseEnvText } from '../env-text.ts';
import { safePublicFetch } from '../safe-public-fetch.ts';
import {
  createAgentRuntime,
  deskAgentSecretsFrom,
  type SavedMedia,
} from './laosa-agents-core.ts';

const IMAGE_CAP = 32 * 1024 * 1024;
const VIDEO_CAP = 200 * 1024 * 1024;

function extensionOf(url: string, contentType: string): { ext: string; kind: 'image' | 'video' } {
  const path = new URL(url).pathname;
  const matched = path.match(/\.(png|jpg|jpeg|webp|mp4|mov|webm)$/i)?.[1]?.toLowerCase();
  if (matched === 'mp4' || matched === 'mov' || matched === 'webm') return { ext: `.${matched}`, kind: 'video' };
  if (matched === 'png' || matched === 'jpg' || matched === 'jpeg' || matched === 'webp') {
    return { ext: matched === 'jpeg' ? '.jpg' : `.${matched}`, kind: 'image' };
  }
  if (contentType.includes('video') || contentType.includes('mp4')) return { ext: '.mp4', kind: 'video' };
  if (contentType.includes('webm')) return { ext: '.webm', kind: 'video' };
  if (contentType.includes('quicktime')) return { ext: '.mov', kind: 'video' };
  if (contentType.includes('png')) return { ext: '.png', kind: 'image' };
  if (contentType.includes('webp')) return { ext: '.webp', kind: 'image' };
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return { ext: '.jpg', kind: 'image' };
  return { ext: kindFromMediaUrl(url) === 'video' ? '.mp4' : '.png', kind: kindFromMediaUrl(url) };
}

export async function saveRemoteMedia(url: string): Promise<SavedMedia> {
  const response = await safePublicFetch(url, { headersTimeoutMs: 20_000 });
  if (!response.ok || !response.body) throw new Error('download');
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const { ext, kind } = extensionOf(url, contentType);
  const cap = kind === 'video' ? VIDEO_CAP : IMAGE_CAP;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new Error('too_large');
    }
    chunks.push(next.value);
  }
  const name = `desk-${randomUUID()}${ext}`;
  const directory = uploadDir();
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), Buffer.concat(chunks));
  return { src: `/media/uploads/${name}`, kind, name };
}

function mergedEnv(viteEnv: Record<string, string> | undefined): Record<string, string | undefined> {
  const filePath = resolve(process.cwd(), '.env.local');
  const fromFile = existsSync(filePath) ? parseEnvText(readFileSync(filePath, 'utf8')) : {};
  return { ...fromFile, ...(viteEnv ?? {}), ...process.env };
}

export function laosaAgentsPlugin(): Plugin {
  return {
    name: 'openchatcut-laosa-agents',
    configureServer(server) {
      const viteEnv = (server.config as { env?: Record<string, string> }).env;
      const runtime = createAgentRuntime({
        secrets: () => deskAgentSecretsFrom(mergedEnv(viteEnv)),
        fetchImpl: globalThis.fetch.bind(globalThis),
        saveRemote: saveRemoteMedia,
      });
      const mount = (scope: 'agents' | 'libtv' | 'tapnow', prefix: string) => {
        server.middlewares.use(prefix, (req: IncomingMessage, res: ServerResponse) => {
          void runtime.handle(scope, req, res);
        });
      };
      mount('agents', '/api/laosa/agents');
      mount('libtv', '/api/laosa/libtv');
      mount('tapnow', '/api/laosa/tapnow');
    },
  };
}
