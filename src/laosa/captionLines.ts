// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — packaging text from captions. English mode prefers translated cues
// and leaves the spoken timeline untouched.

import type { DeskLanguage, TimedLine } from './types';

export interface CaptionPack {
  words: TimedLine[];
  translation?: TimedLine[];
}

function usable(lines: readonly TimedLine[] | undefined): TimedLine[] {
  return (lines ?? []).filter((line) => line.text.trim() && line.endMs > line.startMs);
}

/** English packaging reads the translation when one exists. Otherwise the source words stay. */
export function packagingLines(packs: readonly CaptionPack[], language: DeskLanguage): TimedLine[] {
  return packs.flatMap((pack) => {
    const translated = usable(pack.translation);
    if (language === 'en' && translated.length) return translated;
    return usable(pack.words);
  });
}
