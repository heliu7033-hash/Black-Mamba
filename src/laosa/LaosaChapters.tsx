// SPDX-License-Identifier: AGPL-3.0-or-later
// Bcot — Astra chapter scrub. The bar follows the edited caption timeline.

import { useT } from '../i18n/locale';
import { chapterAt } from './chapters';
import { useLaosaDesk } from './LaosaContext';

interface LaosaChapterBarProps {
  fps: number;
  durationFrames: number;
}

export function LaosaChapterBar({ fps, durationFrames }: LaosaChapterBarProps) {
  const t = useT();
  const desk = useLaosaDesk();
  const durationMs = Math.max(desk.durationMs, (durationFrames / Math.max(1, fps)) * 1000, 1);
  const active = chapterAt(desk.chapters, desk.playheadMs);
  const progress = Math.min(100, Math.max(0, (desk.playheadMs / durationMs) * 100));
  return (
    <div className="cc-laosa-scrub" data-laosa-desk="chapters" aria-label={t('章节进度')}>
      <div
        className="cc-laosa-scrub-track"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width) return;
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          desk.seekMs(ratio * durationMs);
        }}
      >
        {desk.chapters.map((chapter) => {
          const left = (chapter.startMs / durationMs) * 100;
          const width = Math.max(1.5, ((chapter.endMs - chapter.startMs) / durationMs) * 100);
          return (
            <button
              key={chapter.id}
              type="button"
              className={active?.id === chapter.id ? 'is-on' : ''}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={chapter.title}
              onClick={(event) => {
                event.stopPropagation();
                desk.seekMs(chapter.startMs);
              }}
            >
              {chapter.title}
            </button>
          );
        })}
        <span className="cc-laosa-scrub-playhead" style={{ left: `${progress}%` }} />
      </div>
      <span className="cc-laosa-scrub-now">{active ? active.title : t('讲到这儿')}</span>
    </div>
  );
}
