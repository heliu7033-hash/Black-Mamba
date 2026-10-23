// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — timeline rails. Drop auto-lands; smart fill is a labeled stub.

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
  const land = (rail: RailKind, frame: number, label: string) => desk.landRail(rail, frame, label);
  return (
    <div className="cc-laosa-rails" data-laosa-desk="rails">
      {LAOSA_RAIL_ORDER.map((rail) => (
        <div key={rail} className="cc-laosa-rail">
          <div className="cc-laosa-rail-head" style={{ width: headerWidth }}>
            <span>{railName(rail, t)}</span>
            <button
              type="button"
              title={t('智能填充尚未接入模型，已放一个占位片段。')}
              onClick={() => {
                desk.stubFill(rail, playheadFrame());
                showAppToast(t('智能填充尚未接入模型，已放一个占位片段。'));
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
              land(rail, frameFromClientX(event.clientX), label);
            }}
          >
            {desk.prefs.rails.filter((clip) => clip.rail === rail).map((clip) => (
              <span
                key={clip.id}
                className={`cc-laosa-rail-clip is-${rail}`}
                style={{ left: clip.startFrame * px, width: Math.max(8, clip.durationInFrames * px) }}
                title={clipLabel(clip.label, t)}
              >
                {clipLabel(clip.label, t)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
