// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — Lao Sa packaging types. Content stays locked; these fields only change the wrap.

import type { CardSize } from '../../shared/laosa-card';

export type { CardSize };

export type DeskLanguage = 'zh' | 'en';

/** 3×3 crop / anchor. Row then column: top, middle, bottom × left, center, right. */
export type NineAnchor =
  | 'tl' | 'tc' | 'tr'
  | 'ml' | 'mc' | 'mr'
  | 'bl' | 'bc' | 'br';

export type RailKind = 'music' | 'motion' | 'broll';

export interface StyleTemplate {
  id: 'blackmamba' | 'studio' | 'cold' | 'fresh';
  /** Editor void. */
  bg: string;
  /** Primary / accent. */
  accent: string;
  /** Secondary foreground. */
  fg: string;
  accentDeep: string;
  accentRgb: string;
  onAccent: string;
  panel: string;
  panelAlt: string;
  inset: string;
  hover: string;
  border: string;
  textMuted: string;
  textDim: string;
  textStrong: string;
  colorScheme: 'dark' | 'light';
}

export interface ItemPackaging {
  size: CardSize;
  anchor: NineAnchor;
}

export interface RailClip {
  id: string;
  rail: RailKind;
  startFrame: number;
  durationInFrames: number;
  /** Display label, or a `laosa:*` placeholder key translated by the UI. */
  label: string;
}

export interface LaosaPrefs {
  styleId: StyleTemplate['id'];
  /** UI language and the caption / export language. Voice and timing stay put. */
  language: DeskLanguage;
  cardSize: CardSize;
  anchor: NineAnchor;
  byItem: Record<string, ItemPackaging>;
  rails: RailClip[];
}

export interface TimedLine {
  text: string;
  startMs: number;
  endMs: number;
}

export interface ChapterMark {
  id: string;
  startMs: number;
  endMs: number;
  title: string;
}
