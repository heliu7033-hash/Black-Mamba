// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — packaging frame. The card window moves; the Remotion picture does not re-render.

import { useT } from '../i18n/locale';
import { useLaosaDesk } from './LaosaContext';
import type { CardSize, NineAnchor } from './types';

const FRAME: Record<CardSize, { w: number; h: number }> = {
  S: { w: 0.28, h: 0.22 },
  M: { w: 0.46, h: 0.36 },
  F: { w: 0.92, h: 0.78 },
};

const POS: Record<NineAnchor, { x: number; y: number }> = {
  tl: { x: 0, y: 0 }, tc: { x: 0.5, y: 0 }, tr: { x: 1, y: 0 },
  ml: { x: 0, y: 0.5 }, mc: { x: 0.5, y: 0.5 }, mr: { x: 1, y: 0.5 },
  bl: { x: 0, y: 1 }, bc: { x: 0.5, y: 1 }, br: { x: 1, y: 1 },
};

/** Locked content copy shown on the packaging card; language switch updates this, not the VO. */
function lockedCopy(language: 'zh' | 'en', t: (text: string) => string): string {
  if (language === 'en') return 'Same VO · Content locked';
  return t('内容锁定');
}

export function LaosaCardFrame() {
  const t = useT();
  const desk = useLaosaDesk();
  const box = FRAME[desk.activeSize];
  const pos = POS[desk.activeAnchor];
  const line = desk.lines.find((entry) => desk.playheadMs >= entry.startMs && desk.playheadMs < entry.endMs)
    ?? desk.lines[0];
  return (
    <div
      className="cc-laosa-card"
      data-laosa-card={desk.activeSize}
      data-laosa-anchor={desk.activeAnchor}
      data-laosa-style={desk.style.id}
      data-laosa-lang={desk.prefs.language}
      title={t('预览换包装，不重生成内容')}
      style={{
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: `translate(${-pos.x * 100}%, ${-pos.y * 100}%)`,
        borderColor: desk.style.accent,
        background: `color-mix(in srgb, ${desk.style.accent} 88%, ${desk.style.bg})`,
        color: desk.style.onAccent,
      }}
    >
      <span>
        {lockedCopy(desk.prefs.language, t)} · {desk.activeSize}
        {line ? ` · ${line.text}` : ''}
      </span>
    </div>
  );
}
