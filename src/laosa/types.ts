// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — 老黑剪辑台 packaging types. Content stays locked; these fields only change the wrap.

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
  /** Optional media src when the user dropped a file onto the rail. */
  src?: string;
  /** Motion cards may carry the S/M/F size from semantic recommend. */
  cardSize?: CardSize;
}

/** Talking-head / VO media slotted under the packaging preview. */
export interface VoMedia {
  /** Display name (file name). */
  name: string;
  /**
   * Playable URL. Demo sample uses `/demo/laohei-vo.mp4`.
   * User imports may be blob: URLs kept in this browser only.
   */
  src: string;
  durationInFrames?: number;
}

export interface LaosaPrefs {
  styleId: StyleTemplate['id'];
  /** UI language and the caption / export language. Voice and timing stay put. */
  language: DeskLanguage;
  cardSize: CardSize;
  anchor: NineAnchor;
  byItem: Record<string, ItemPackaging>;
  rails: RailClip[];
  /** Optional VO / talking-head under the packaging frame. */
  voMedia?: VoMedia | null;
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
