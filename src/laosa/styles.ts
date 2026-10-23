// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — Lao Sa style templates. The default is 黑曼巴炭黑琥珀.

import type { StyleTemplate } from './types';

const SHARED = {
  textStrong: '#FFFFFF',
} as const;

export const LAOSA_STYLES: readonly StyleTemplate[] = [
  {
    id: 'blackmamba',
    bg: '#080808',
    accent: '#E18C21',
    fg: '#FCFCFC',
    accentDeep: '#C47612',
    accentRgb: '225,140,33',
    onAccent: '#1A1208',
    panel: '#121212',
    panelAlt: '#1C1C1C',
    inset: '#0C0C0C',
    hover: '#2A2A2A',
    border: '#333333',
    textMuted: '#D4D4D4',
    textDim: '#A3A3A3',
    textStrong: SHARED.textStrong,
    colorScheme: 'dark',
  },
  {
    id: 'studio',
    bg: '#100C08',
    accent: '#F0A04B',
    fg: '#FFF6EA',
    accentDeep: '#D4842E',
    accentRgb: '240,160,75',
    onAccent: '#1A1006',
    panel: '#1A140E',
    panelAlt: '#261C14',
    inset: '#120E0A',
    hover: '#342418',
    border: '#4A3828',
    textMuted: '#F0D7B8',
    textDim: '#C4A98A',
    textStrong: '#FFF6EA',
    colorScheme: 'dark',
  },
  {
    id: 'cold',
    bg: '#070B12',
    accent: '#3EC6E0',
    fg: '#F4F7FB',
    accentDeep: '#1E9BB5',
    accentRgb: '62,198,224',
    onAccent: '#062028',
    panel: '#101820',
    panelAlt: '#17222C',
    inset: '#0A1016',
    hover: '#223140',
    border: '#2C3E4E',
    textMuted: '#C9D6E2',
    textDim: '#8AA0B3',
    textStrong: '#F4F7FB',
    colorScheme: 'dark',
  },
  {
    id: 'fresh',
    bg: '#F4F1EA',
    accent: '#E18C21',
    fg: '#1A1A1A',
    accentDeep: '#C47612',
    accentRgb: '225,140,33',
    onAccent: '#1A1208',
    panel: '#FFFCF7',
    panelAlt: '#F7F1E6',
    inset: '#EFE8DC',
    hover: '#EADFCB',
    border: '#E4D9C8',
    textMuted: '#3F3A34',
    textDim: '#5C5348',
    textStrong: '#141414',
    colorScheme: 'light',
  },
];

export const DEFAULT_LAOSA_STYLE: StyleTemplate['id'] = 'blackmamba';

export function styleById(id: string | null | undefined): StyleTemplate {
  return LAOSA_STYLES.find((style) => style.id === id) ?? LAOSA_STYLES[0]!;
}

/** CSS variables for the editor shell. Packaging switches repaint tokens; they do not re-render content. */
export function laosaStyleVars(style: StyleTemplate): Record<string, string> {
  return {
    '--cc-bg': style.bg,
    '--cc-inset': style.inset,
    '--cc-panel': style.panel,
    '--cc-panel-alt': style.panelAlt,
    '--cc-hover': style.hover,
    '--cc-border': style.border,
    '--cc-text': style.fg,
    '--cc-text-muted': style.textMuted,
    '--cc-text-dim': style.textDim,
    '--cc-text-strong': style.textStrong,
    '--cc-accent': style.accent,
    '--cc-accent-deep': style.accentDeep,
    '--cc-accent-rgb': style.accentRgb,
    '--cc-on-accent': style.onAccent,
    '--cc-gold': style.accent,
    '--cc-color-scheme': style.colorScheme,
    '--ls-bg': style.bg,
    '--ls-accent': style.accent,
    '--ls-fg': style.fg,
  };
}
