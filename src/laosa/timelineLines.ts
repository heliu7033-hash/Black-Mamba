// SPDX-License-Identifier: AGPL-3.0-or-later
// B-CUT — post-edit caption lines for chapters and semantic card pick.

import { resolveCaptionWords } from '../captions/resolve';
import { captionTrackEntries, type TimelineState } from '../editor/types';
import { hasOperationalTranscript } from '../transcript/types';
import { packagingLines, type CaptionPack } from './captionLines';
import type { DeskLanguage, TimedLine } from './types';

function wordLines(words: readonly { text: string; start: number; end: number }[]): TimedLine[] {
  return words.map((word) => ({ text: word.text, startMs: word.start, endMs: word.end }));
}

function packsFromCaptions(state: TimelineState): CaptionPack[] {
  return captionTrackEntries(state).flatMap(({ captions }) => {
    if (!captions || captions.enabled === false) return [];
    let words: TimedLine[] = [];
    try {
      words = wordLines(resolveCaptionWords(captions, state.items, state.fps));
    } catch {
      words = [];
    }
    const translation = wordLines(captions.translation ?? []);
    if (!words.length && !translation.length) return [];
    return [{ words, translation }];
  });
}

function packsFromTranscripts(state: TimelineState): CaptionPack[] {
  const words = state.items.flatMap((item) => {
    if (!hasOperationalTranscript(item)) return [];
    const deleted = new Set(item.deletedWordIdx ?? []);
    const shift = (item.startFrame / state.fps) * 1000;
    return item.transcript.flatMap((word, index) => (
      deleted.has(index)
        ? []
        : [{ text: word.text, startMs: word.start + shift, endMs: word.end + shift }]
    ));
  });
  return words.length ? [{ words }] : [];
}

/** Captions already projected onto the edited timeline, then item transcripts with deleted words removed. */
export function packagingLinesFromTimeline(state: TimelineState, language: DeskLanguage): TimedLine[] {
  if (!state?.items || !state.fps) return [];
  const fromCaptions = packsFromCaptions(state);
  const packs = fromCaptions.length ? fromCaptions : packsFromTranscripts(state);
  return packagingLines(packs, language);
}
