// SPDX-License-Identifier: AGPL-3.0-or-later
// B-CUT — timeline rails. Drop auto-lands; smart fill uses captions / semantic size.

import { useT } from '../i18n/locale';
import { showAppToast } from '../ui/appToast';
import { useLaosaDesk } from './LaosaContext';
import { LAOSA_RAIL_ORDER } from './prefs';
import type { RailKind } from './types';

interface LaosaRailsProps {
  px: number;
  headerWidth: number;
  frameFromClientX: (clientX: number) => number;
  playheadFrame: () => number;
}

function railName(rail: RailKind, t: (text: string) => string): string {
  if (rail === 'music') return t('智能音乐');
  if (rail === 'motion') return t('动效');
  return t('B-roll');
}

function clipLabel(label: string, t: (text: string) => string): string {
  if (label === 'laosa:music') return t('智能音乐占位');
  if (label === 'laosa:motion') return t('动效占位');
  if (label === 'laosa:broll') return t('B-roll 占位');
  return label;
}

export function LaosaRails({ px, headerWidth, frameFromClientX, playheadFrame }: LaosaRailsProps) {
  const t = useT();
  const desk = useLaosaDesk();
  const land = (rail: RailKind, frame: number, label: string, src?: string) => desk.landRail(rail, frame, label, src);
  return (
    <div className="cc-laosa-rails" data-laosa-desk="rails">
      {LAOSA_RAIL_ORDER.map((rail) => (
        <div key={rail} className="cc-laosa-rail" data-laosa-rail={rail}>
          <div className="cc-laosa-rail-head" style={{ width: headerWidth }}>
            <span>{railName(rail, t)}</span>
            <button
              type="button"
              data-laosa-fill={rail}
              title={desk.keyPresence === 'ready'
                ? t('按当前字幕与语义结果落轨')
                : t('演示填充：按当前字幕落标注片段')}
              onClick={() => {
                desk.smartFillRail(rail, playheadFrame());
                showAppToast(
                  desk.keyPresence === 'ready'
                    ? t('已按字幕与语义结果落轨')
                    : t('演示填充：已按字幕落标注片段'),
                );
              }}
            >
              {t('智能填充')}
            </button>
          </div>
          <div
            className="cc-laosa-rail-lane"
            title={t('拖到此轨自动落点')}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const file = event.dataTransfer.files?.[0];
              const text = event.dataTransfer.getData('text/plain').trim();
              const label = file?.name || text.slice(0, 80) || t('未命名素材');
              const src = file ? URL.createObjectURL(file) : undefined;
              land(rail, frameFromClientX(event.clientX), label, src);
            }}
            onClick={() => desk.selectRail(null)}
          >
            {desk.prefs.rails.filter((clip) => clip.rail === rail).map((clip) => (
              <button
                key={clip.id}
                type="button"
                className={`cc-laosa-rail-clip is-${rail}${desk.selectedRailId === clip.id ? ' is-selected' : ''}`}
                style={{ left: clip.startFrame * px, width: Math.max(8, clip.durationInFrames * px) }}
                title={clipLabel(clip.label, t)}
                data-laosa-rail-clip={clip.id}
                data-laosa-card-size={clip.cardSize ?? ''}
                onClick={(event) => {
                  event.stopPropagation();
                  desk.selectRail(clip.id);
                  desk.seekFrame(clip.startFrame);
                }}
              >
                {clip.cardSize ? <em>{clip.cardSize}</em> : null}
                <span>{clipLabel(clip.label, t)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
