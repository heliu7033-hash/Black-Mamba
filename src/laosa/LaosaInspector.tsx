// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — right inspector for card size, nine-grid crop, and semantic pick.

import { useT } from '../i18n/locale';
import { chapterAt, formatClock } from './chapters';
import { useLaosaDesk } from './LaosaContext';
import type { SemanticErrorCode } from './semanticClient';
import type { CardSize, NineAnchor } from './types';

const SIZES: readonly CardSize[] = ['S', 'M', 'F'];
const ANCHORS: readonly NineAnchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

function sizeLabel(size: CardSize, t: (text: string) => string): string {
  if (size === 'S') return t('小卡');
  if (size === 'M') return t('中卡');
  return t('全卡');
}

function anchorLabel(anchor: NineAnchor, t: (text: string) => string): string {
  if (anchor === 'tl') return t('左上');
  if (anchor === 'tc') return t('上');
  if (anchor === 'tr') return t('右上');
  if (anchor === 'ml') return t('左');
  if (anchor === 'mc') return t('中');
  if (anchor === 'mr') return t('右');
  if (anchor === 'bl') return t('左下');
  if (anchor === 'bc') return t('下');
  return t('右下');
}

function errorText(code: SemanticErrorCode, t: (text: string) => string): string {
  if (code === 'empty_captions') return t('没有可用字幕');
  if (code === 'missing_key') return t('未配置 OpenAI 兼容 API Key');
  if (code === 'unreachable') return t('暂时无法确认 API Key，请稍后重试。');
  return t('推荐失败');
}

export function LaosaInspector() {
  const t = useT();
  const desk = useLaosaDesk();
  const activeChapter = chapterAt(desk.chapters, desk.playheadMs);
  const missingKey = desk.keyPresence === 'missing'
    || (desk.recommendation.status === 'error' && desk.recommendation.code === 'missing_key');
  return (
    <div className="cc-laosa-inspector" data-laosa-desk="inspector">
      <div className="cc-laosa-inspector-head">
        <strong>{t('老萨剪辑台')}</strong>
        <span>{desk.selectedName ?? t('工程默认')}</span>
      </div>
      <div className="cc-laosa-block">
        <div className="cc-laosa-label">{t('卡型')}</div>
        <div className="cc-laosa-size-row" role="group" aria-label={t('卡型')}>
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              data-laosa-card={size}
              aria-pressed={desk.activeSize === size}
              className={desk.activeSize === size ? 'is-on' : ''}
              onClick={() => desk.setCardSize(size)}
            >
              <b>{size}</b>
              <span>{sizeLabel(size, t)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="cc-laosa-block">
        <div className="cc-laosa-label">{t('九宫格定位')}</div>
        <div className="cc-laosa-grid" role="group" aria-label={t('九宫格定位')} data-laosa-anchor={desk.activeAnchor}>
          {ANCHORS.map((anchor) => (
            <button
              key={anchor}
              type="button"
              aria-label={anchorLabel(anchor, t)}
              aria-pressed={desk.activeAnchor === anchor}
              className={desk.activeAnchor === anchor ? 'is-on' : ''}
              onClick={() => desk.setAnchor(anchor)}
            />
          ))}
        </div>
        <p className="cc-laosa-note">{t('画面锚点同时决定裁切焦点')}</p>
      </div>
      <div className="cc-laosa-block">
        <div className="cc-laosa-label">{t('语义配卡')}</div>
        <p className="cc-laosa-note">{t('关键词对应小卡，步骤关系对应中卡，完整框架对应全卡。')}</p>
        {desk.keyPresence === 'unknown' && <p className="cc-laosa-note">{t('正在确认密钥…')}</p>}
        {desk.keyPresence === 'unreachable' && (
          <div className="cc-laosa-empty">
            <p>{t('暂时无法确认 API Key，请稍后重试。')}</p>
            <button type="button" onClick={desk.refreshKeyPresence}>{t('重新检查密钥')}</button>
          </div>
        )}
        {missingKey && (
          <div className="cc-laosa-empty" data-laosa-key="missing">
            <p>{t('未配置 OpenAI 兼容 API Key')}</p>
            <p>{t('在设置里填写 OpenAI 或兼容网关的密钥后再推荐。密钥只保存在本机设置，不会写入仓库。')}</p>
            <button type="button" onClick={desk.openSettings}>{t('打开 OpenAI 设置')}</button>
          </div>
        )}
        {desk.keyPresence === 'ready' && !missingKey && (
          <div className="cc-laosa-semantic">
            <button type="button" onClick={() => void desk.recommend()} disabled={desk.recommendation.status === 'loading' || desk.lines.length === 0}>
              {desk.recommendation.status === 'loading' ? t('正在阅读字幕…') : t('按语义推荐')}
            </button>
            {desk.lines.length === 0 && <p className="cc-laosa-note">{t('没有可用字幕')}</p>}
            {desk.recommendation.status === 'empty' && <p className="cc-laosa-note">{t('没有可用字幕')}</p>}
            {desk.recommendation.status === 'error' && <p className="cc-laosa-note">{errorText(desk.recommendation.code, t)}</p>}
            {desk.recommendation.status === 'ready' && (
              <div className="cc-laosa-reason">
                <b>{desk.recommendation.result.size}</b>
                <span>{desk.recommendation.result.reason}</span>
                <button type="button" onClick={desk.applyRecommendation}>{t('采用')}</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="cc-laosa-block">
        <div className="cc-laosa-label">{t('章节')}</div>
        <p className="cc-laosa-note">{t('按剪后字幕分章')}</p>
        {desk.chapters.length === 0 ? <p className="cc-laosa-note">{t('剪后字幕出现后，会在这里按语义分章。')}</p> : (
          <ol className="cc-laosa-chapters">
            {desk.chapters.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  className={activeChapter?.id === chapter.id ? 'is-on' : ''}
                  onClick={() => desk.seekMs(chapter.startMs)}
                >
                  <span>{formatClock(chapter.startMs)}</span>
                  <span>{chapter.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="cc-laosa-note">{t('字幕与导出语言')} · {desk.prefs.language === 'en' ? 'English' : t('中文')}</p>
      </div>
    </div>
  );
}
