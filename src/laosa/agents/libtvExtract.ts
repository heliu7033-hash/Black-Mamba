// SPDX-License-Identifier: AGPL-3.0-or-later
// LibTV result extraction. Mirrors libtv-skills download_results.py:
// assistant text and tool task_result payloads on https://libtv-res.liblib.art.

export interface LibtvMessage {
  id?: string;
  role?: string;
  content?: unknown;
  seq?: number;
}

const RESULT_URL = /https:\/\/libtv-res\.liblib\.art\/[^\s"'<>\\]+?\.(?:png|jpg|jpeg|webp|mp4|mov|webm)(?:\?[^\s"'<>\\]*)?/gi;
const VIDEO_PROMPT = /视频|动画|短片|镜头|运镜|影片|\bmv\b|video|clip|movie|motion|animate/i;

export type GeneratedKind = 'image' | 'video';

export function promptMediaKind(prompt: string): GeneratedKind {
  return VIDEO_PROMPT.test(prompt) ? 'video' : 'image';
}

export function kindFromMediaUrl(url: string): GeneratedKind {
  const path = url.split('?')[0]?.split('#')[0] ?? url;
  return /\.(mp4|mov|webm)$/i.test(path) ? 'video' : 'image';
}

export function isLibtvResultUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.hostname !== 'libtv-res.liblib.art') return false;
  return /\.(png|jpg|jpeg|webp|mp4|mov|webm)$/i.test(url.pathname);
}

function pushUrl(found: string[], raw: unknown): void {
  if (typeof raw !== 'string') return;
  const trimmed = raw.trim();
  if (!isLibtvResultUrl(trimmed)) return;
  found.push(trimmed);
}

function collectToolPreviews(content: string, found: string[]): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  const root = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  const task = root?.task_result && typeof root.task_result === 'object'
    ? root.task_result as Record<string, unknown>
    : root;
  if (!task) return;
  for (const key of ['images', 'videos'] as const) {
    const list = task[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      pushUrl(found, record.previewPath);
      pushUrl(found, record.url);
    }
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return '';
  }
}

/** URLs from tool and assistant messages only, so an uploaded reference in the user turn is not re-imported. */
export function extractLibtvMediaUrls(messages: readonly LibtvMessage[]): string[] {
  const found: string[] = [];
  for (const message of messages) {
    const role = (message.role ?? '').toLowerCase();
    if (role !== 'assistant' && role !== 'tool') continue;
    const content = contentText(message.content);
    if (role === 'tool') collectToolPreviews(content, found);
    for (const match of content.matchAll(RESULT_URL)) found.push(match[0]);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const url of found) {
    if (!isLibtvResultUrl(url) || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  return unique;
}

export function maxMessageSeq(messages: readonly LibtvMessage[]): number {
  return messages.reduce((max, message) => Math.max(max, Number(message.seq) || 0), 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function unwrapData(body: unknown): Record<string, unknown> {
  const root = asRecord(body);
  if (!root) return {};
  return asRecord(root.data) ?? root;
}

export function parseLibtvCreated(body: unknown): { sessionId: string; projectUuid: string; projectUrl: string } | null {
  const data = unwrapData(body);
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
  const projectUuid = typeof data.projectUuid === 'string' ? data.projectUuid.trim() : '';
  if (!sessionId) return null;
  const projectUrl = typeof data.projectUrl === 'string' && data.projectUrl
    ? data.projectUrl
    : projectUuid ? `https://www.liblib.tv/canvas?projectId=${projectUuid}` : '';
  return { sessionId, projectUuid, projectUrl };
}

export function parseLibtvMessages(body: unknown): LibtvMessage[] {
  const data = unwrapData(body);
  const messages = Array.isArray(data.messages) ? data.messages : Array.isArray(body) ? body : [];
  return messages.filter((item): item is LibtvMessage => !!item && typeof item === 'object');
}

export function parseLibtvUploadUrl(body: unknown): string | null {
  const data = unwrapData(body);
  const url = typeof data.url === 'string' ? data.url.trim() : '';
  return isLibtvResultUrl(url) ? url : null;
}

/** Append the OSS reference the way libtv-skill does. The user's wording is otherwise unchanged. */
export function messageWithReference(prompt: string, referenceUrl?: string): string {
  const text = prompt.trim();
  if (!referenceUrl) return text;
  return `${text}\n参考：${referenceUrl}`;
}
