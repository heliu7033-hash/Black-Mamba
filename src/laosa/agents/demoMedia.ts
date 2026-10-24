// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline stand-ins used when LIBTV_ACCESS_KEY / TAPNOW_* are absent.
// Images are drawn in the page. Video reuses the desk's small demo mp4.

import { promptMediaKind, type GeneratedKind } from './libtvExtract';

const DEMO_VIDEO = '/demo/laohei-vo.mp4';

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

export async function renderDemoStill(provider: 'libtv' | 'tapnow', prompt: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#E18C21';
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, 1208, 648);
  ctx.fillStyle = '#E18C21';
  ctx.font = '700 28px Geist, sans-serif';
  ctx.fillText(provider === 'libtv' ? 'LibTV  DEMO' : 'TapNow  DEMO', 72, 110);
  ctx.fillStyle = '#FCFCFC';
  ctx.font = '500 40px Geist, sans-serif';
  const lines = wrapLines(ctx, prompt.trim() || '生成', 1100);
  lines.forEach((line, index) => ctx.fillText(line, 72, 200 + index * 56));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png');
  return blob;
}

export function demoFileName(provider: 'libtv' | 'tapnow', prompt: string, kind: GeneratedKind): string {
  const slug = prompt.replace(/\s+/g, ' ').trim().slice(0, 24) || '生成';
  const brand = provider === 'libtv' ? 'LibTV' : 'TapNow';
  return `${brand} · ${slug}.${kind === 'video' ? 'mp4' : 'png'}`;
}

export async function buildDemoFile(provider: 'libtv' | 'tapnow', prompt: string): Promise<File> {
  const kind = promptMediaKind(prompt);
  const name = demoFileName(provider, prompt, kind);
  if (kind === 'video') {
    const response = await fetch(DEMO_VIDEO);
    if (!response.ok) throw new Error('demo-video-missing');
    const blob = await response.blob();
    return new File([blob], name, { type: 'video/mp4' });
  }
  const still = await renderDemoStill(provider, prompt);
  return new File([still], name, { type: 'image/png' });
}
