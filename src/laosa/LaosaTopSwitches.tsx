// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — Lao Sa top bar. Style, 中文/English, and S/M/F switch packaging only.

import type { CSSProperties } from 'react';
import { useT } from '../i18n/locale';
import { LAOSA_STYLES } from './styles';
import { useLaosaDesk } from './LaosaContext';
import type { CardSize, DeskLanguage, StyleTemplate } from './types';

function styleName(id: StyleTemplate['id'], t: (text: string) => string): string {
  if (id === 'blackmamba') return t('黑曼巴炭黑琥珀');
  if (id === 'studio') return t('影棚琥珀');
  if (id === 'cold') return t('冷科技');
  return t('清爽白');
}

const CARD_LABEL: Record<CardSize, string> = {
  S: '小卡 S',
  M: '中卡 M',
  F: '全卡 F',
};

const seg = (active: boolean): CSSProperties => ({
  height: 22,
  border: '0.5px solid var(--ls-accent, var(--cc-accent))',
  background: active ? 'var(--ls-accent, var(--cc-accent))' : 'transparent',
  color: active ? 'var(--cc-on-accent)' : 'var(--ls-fg, var(--cc-text))',
  borderRadius: 3,
  padding: '0 7px',
  fontSize: 11,
  fontWeight: 650,
  cursor: 'pointer',
  lineHeight: '20px',
});

export function LaosaTopSwitches() {
  const t = useT();
  const desk = useLaosaDesk();
  const setLanguage = (language: DeskLanguage) => desk.setLanguage(language);
  return (
    <div className="cc-laosa-switches" data-laosa-desk="top">
      <label className="cc-laosa-field">
        <span className="cc-laosa-kicker">{t('包装风格')}</span>
        <select
          aria-label={t('包装风格')}
          data-laosa-style={desk.style.id}
          value={desk.style.id}
          onChange={(event) => desk.setStyle(event.target.value)}
          className="cc-laosa-select"
        >
          {LAOSA_STYLES.map((style) => (
            <option key={style.id} value={style.id}>{styleName(style.id, t)}</option>
          ))}
        </select>
      </label>
      <div className="cc-laosa-seg" role="group" aria-label={t('界面与字幕语言')} title={t('只换文字，不改声音和时间')}>
        <button type="button" data-laosa-lang="zh" aria-pressed={desk.prefs.language === 'zh'} style={seg(desk.prefs.language === 'zh')} onClick={() => setLanguage('zh')}>{t('中文')}</button>
        <button type="button" data-laosa-lang="en" aria-pressed={desk.prefs.language === 'en'} style={seg(desk.prefs.language === 'en')} onClick={() => setLanguage('en')}>English</button>
      </div>
      <div className="cc-laosa-seg" role="group" aria-label={t('卡型')}>
        {(Object.keys(CARD_LABEL) as CardSize[]).map((size) => (
          <button
            key={size}
            type="button"
            data-laosa-card={size}
            aria-pressed={desk.activeSize === size}
            style={seg(desk.activeSize === size)}
            onClick={() => desk.setCardSize(size)}
          >
            {t(CARD_LABEL[size])}
          </button>
        ))}
      </div>
      <span className="cc-laosa-lock" title={t('同一内容，只换包装')}>{t('内容锁定')}</span>
    </div>
  );
}
