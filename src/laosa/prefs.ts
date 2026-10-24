// SPDX-License-Identifier: AGPL-3.0-or-later
// B-CUT — 老黑剪辑台 preferences. Browser-local, same class of data as session chrome.

import { DEFAULT_LAOSA_STYLE, styleById } from './styles';
import type { CardSize, DeskLanguage, ItemPackaging, LaosaPrefs, NineAnchor, RailClip, RailKind, VoMedia } from './types';

const ANCHORS: readonly NineAnchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const RAILS: readonly RailKind[] = ['music', 'motion', 'broll'];
const MAX_RAILS = 200;

export function laosaPrefsKey(projectId: string): string {
  return `cc.laosa.desk.v1.${projectId}`;
}

export function defaultLaosaPrefs(language: DeskLanguage = 'zh'): LaosaPrefs {
  return {
    styleId: DEFAULT_LAOSA_STYLE,
    language,
    cardSize: 'M',
    anchor: 'mc',
    byItem: {},
    rails: [],
    voMedia: null,
  };
}

function readRaw(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function removeRaw(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isSize(value: unknown): value is CardSize {
  return value === 'S' || value === 'M' || value === 'F';
}

function isAnchor(value: unknown): value is NineAnchor {
  return typeof value === 'string' && (ANCHORS as readonly string[]).includes(value);
}

function isRail(value: unknown): value is RailKind {
  return value === 'music' || value === 'motion' || value === 'broll';
}

function sanitizePackaging(value: unknown): ItemPackaging | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isSize(record.size) || !isAnchor(record.anchor)) return null;
  return { size: record.size, anchor: record.anchor };
}

function sanitizeRails(value: unknown): RailClip[] {
  if (!Array.isArray(value)) return [];
  const clips: RailClip[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !isRail(record.rail)) continue;
    const startFrame = Math.max(0, Math.floor(Number(record.startFrame)));
    const durationInFrames = Math.max(1, Math.floor(Number(record.durationInFrames)));
    if (!Number.isFinite(startFrame) || !Number.isFinite(durationInFrames)) continue;
    const label = typeof record.label === 'string' ? record.label.slice(0, 120) : '';
    if (!label) continue;
    const clip: RailClip = { id: record.id.slice(0, 80), rail: record.rail, startFrame, durationInFrames, label };
    if (typeof record.src === 'string' && record.src.length > 0 && record.src.length < 2000) {
      clip.src = record.src;
    }
    if (isSize(record.cardSize)) clip.cardSize = record.cardSize;
    clips.push(clip);
    if (clips.length >= MAX_RAILS) break;
  }
  return clips;
}

function sanitizeVoMedia(value: unknown): VoMedia | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string' || typeof record.src !== 'string') return null;
  const name = record.name.trim().slice(0, 160);
  const src = record.src.trim().slice(0, 2000);
  if (!name || !src) return null;
  const durationInFrames = Math.max(1, Math.floor(Number(record.durationInFrames)));
  return {
    name,
    src,
    ...(Number.isFinite(durationInFrames) ? { durationInFrames } : {}),
  };
}

export function parseLaosaPrefs(raw: string | null, fallbackLanguage: DeskLanguage = 'zh'): LaosaPrefs {
  const fallback = defaultLaosaPrefs(fallbackLanguage);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const record = parsed as Record<string, unknown>;
    const byItem: Record<string, ItemPackaging> = {};
    if (record.byItem && typeof record.byItem === 'object') {
      for (const [id, value] of Object.entries(record.byItem as Record<string, unknown>)) {
        const packaging = sanitizePackaging(value);
        if (packaging && id.length > 0 && id.length < 120) byItem[id] = packaging;
      }
    }
    return {
      styleId: styleById(typeof record.styleId === 'string' ? record.styleId : '').id,
      language: record.language === 'en' ? 'en' : 'zh',
      cardSize: isSize(record.cardSize) ? record.cardSize : fallback.cardSize,
      anchor: isAnchor(record.anchor) ? record.anchor : fallback.anchor,
      byItem,
      rails: sanitizeRails(record.rails),
      voMedia: sanitizeVoMedia(record.voMedia),
    };
  } catch {
    return fallback;
  }
}

export function loadLaosaPrefs(projectId: string, fallbackLanguage: DeskLanguage = 'zh'): LaosaPrefs {
  return parseLaosaPrefs(readRaw(laosaPrefsKey(projectId)), fallbackLanguage);
}

/** Create the project record on first open so caption/export language matches the desk. */
export function ensureLaosaPrefs(projectId: string, fallbackLanguage: DeskLanguage = 'zh'): LaosaPrefs {
  const key = laosaPrefsKey(projectId);
  const raw = readRaw(key);
  if (raw) return parseLaosaPrefs(raw, fallbackLanguage);
  const created = defaultLaosaPrefs(fallbackLanguage);
  saveLaosaPrefs(projectId, created);
  return created;
}

export function saveLaosaPrefs(projectId: string, prefs: LaosaPrefs): void {
  writeRaw(laosaPrefsKey(projectId), JSON.stringify(prefs));
}

export function clearLaosaPrefs(projectId: string): void {
  removeRaw(laosaPrefsKey(projectId));
}

/** Caption / export language for one project. Voice and duration are not part of this preference. */
export function loadCaptionExportLanguage(projectId: string): DeskLanguage {
  return loadLaosaPrefs(projectId).language;
}

export const LAOSA_RAIL_ORDER: readonly RailKind[] = RAILS;
