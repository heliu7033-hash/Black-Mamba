// SPDX-License-Identifier: AGPL-3.0-or-later
// Bcot — right inspector for card size, nine-grid crop, semantic pick, rails, and VO.

import { useRef } from 'react';
import { useT } from '../i18n/locale';
import { chapterAt, formatClock } from './chapters';
import { useLaosaDesk } from './LaosaContext';
import type { SemanticErrorCode } from './semanticClient';
import { LAOHEI_DEMO_VO_SRC } from './demoFixture';
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
  if (code === 'missing_key') return t('未配置 Claude/SSXZ（~/.claude/settings.json）');
  if (code === 'unreachable') return t('暂时无法确认 API Key，请稍后重试。');
  return t('推荐失败');
}

function railKindLabel(rail: string, t: (text: string) => string): string {
  if (rail === 'music') return t('智能音乐');
  if (rail === 'motion') return t('动效');
  if (rail === 'broll') return t('B-roll');
  return rail;
}

function DemoSuggestBlock() {
  const t = useT();
  const desk = useLaosaDesk();
  return (
    <div className="cc-laosa-demo-fallback" data-laosa-demo="block">
      <button
        type="button"
        data-laosa-demo="suggest"
        onClick={desk.suggestDemo}
        disabled={desk.lines.length === 0}
      >
        {t('演示模式')}
      </button>
      <p>{t('不联网，按当前字幕给一个演示建议。')}</p>
      {desk.recommendation.status === 'empty' && <p>{t('没有可用字幕')}</p>}
      {desk.recommendation.status === 'ready' && desk.recommendation.demo && (
        <div className="cc-laosa-reason" data-laosa-demo="result">
          <b>{desk.recommendation.result.size}</b>
          <span>{t(desk.recommendation.result.reason)}</span>
          <em data-laosa-demo="badge">{t('演示')}</em>
          <button type="button" onClick={desk.applyRecommendation}>{t('采用')}</button>
        </div>
      )}
    </div>
  );
}

export function LaosaInspector() {
  const t = useT();
  const desk = useLaosaDesk();
  const fileRef = useRef<HTMLInputElement>(null);
  const activeChapter = chapterAt(desk.chapters, desk.playheadMs);
  const missingKey = desk.keyPresence === 'missing'
    || (desk.recommendation.status === 'error' && desk.recommendation.code === 'missing_key');
  const selectedRail = desk.prefs.rails.find((clip) => clip.id === desk.selectedRailId) ?? null;
  const vo = desk.prefs.voMedia ?? null;

  const onPickVo = (file: File | null) => {
    if (!file) return;
    const src = URL.createObjectURL(file);
    desk.setVoMedia({ name: file.name.slice(0, 160), src });
  };

  return (
    <div className="cc-laosa-inspector" data-laosa-desk="inspector">
      <div className="cc-laosa-inspector-head">
        <strong>{t('老黑剪辑台')}</strong>
        <span>{desk.selectedName ?? t('工程默认')}</span>
      </div>

      <div className="cc-laosa-block" data-laosa-vo="slot">
        <div className="cc-laosa-label">{t('口播成片')}</div>
        {vo ? (
          <div className="cc-laosa-vo-filled">
            <p className="cc-laosa-note">{vo.name}</p>
            <div className="cc-laosa-vo-actions">
              <button type="button" onClick={() => fileRef.current?.click()}>{t('替换口播')}</button>
              <button type="button" onClick={() => desk.setVoMedia(null)}>{t('清除口播')}</button>
            </div>
          </div>
        ) : (
          <div className="cc-laosa-empty" data-laosa-vo="empty">
            <p>{t('还没有口播成片。导入真人出镜或口播视频，包装会叠在画面上。')}</p>
            <button type="button" onClick={() => fileRef.current?.click()}>{t('导入口播素材')}</button>
            <button
              type="button"
              data-laosa-vo="demo"
              onClick={() => desk.setVoMedia({ name: t('演示口播占位'), src: LAOHEI_DEMO_VO_SRC, durationInFrames: 24 * 30 })}
            >
              {t('使用演示口播占位')}
            </button>
            <p className="cc-laosa-note">{t('也可替换 public/demo/laohei-vo.mp4 作为默认演示素材。')}</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/*,image/*"
          hidden
          onChange={(event) => {
            onPickVo(event.target.files?.[0] ?? null);
            event.currentTarget.value = '';
          }}
        />
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

      {selectedRail && (
        <div className="cc-laosa-block" data-laosa-rail-inspector={selectedRail.rail}>
          <div className="cc-laosa-label">{t('选中轨片段')} · {railKindLabel(selectedRail.rail, t)}</div>
          <p className="cc-laosa-note">{formatClock((selectedRail.startFrame / desk.fps) * 1000)} · {selectedRail.durationInFrames}f</p>
          <label className="cc-laosa-field cc-laosa-rail-label">
            <span className="cc-laosa-kicker">{t('标签')}</span>
            <input
              className="cc-laosa-select"
              value={selectedRail.label}
              onChange={(event) => desk.updateSelectedRailLabel(event.target.value)}
            />
          </label>
          {selectedRail.rail === 'motion' && (
            <div className="cc-laosa-size-row" role="group" aria-label={t('卡型')}>
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={(selectedRail.cardSize ?? desk.activeSize) === size ? 'is-on' : ''}
                  onClick={() => desk.applySizeToSelectedRail(size)}
                >
                  <b>{size}</b>
                  <span>{sizeLabel(size, t)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="cc-laosa-vo-actions">
            <button type="button" onClick={() => desk.seekFrame(selectedRail.startFrame)}>{t('跳到片段')}</button>
            <button type="button" onClick={desk.removeSelectedRail}>{t('删除片段')}</button>
          </div>
        </div>
      )}

      <div className="cc-laosa-block">
        <div className="cc-laosa-label">{t('语义配卡')}</div>
        <p className="cc-laosa-note">{t('关键词对应小卡，步骤关系对应中卡，完整框架对应全卡。')}</p>
        {desk.keyPresence === 'unknown' && <p className="cc-laosa-note">{t('正在确认密钥…')}</p>}
        {desk.keyPresence === 'unreachable' && (
          <div className="cc-laosa-empty">
            <p>{t('暂时无法确认 API Key，请稍后重试。')}</p>
            <button type="button" onClick={desk.refreshKeyPresence}>{t('重新检查密钥')}</button>
            <DemoSuggestBlock />
          </div>
        )}
        {missingKey && (
          <div className="cc-laosa-empty" data-laosa-key="missing">
            <p>{t('未配置 Claude/SSXZ（~/.claude/settings.json）')}</p>
            <p>{t('本机 ~/.claude/settings.json 需有 ANTHROPIC_BASE_URL 与 ANTHROPIC_AUTH_TOKEN。密钥不会写入仓库。')}</p>
            <button type="button" onClick={desk.openSettings}>{t('打开设置')}</button>
            <DemoSuggestBlock />
          </div>
        )}
        {desk.keyPresence === 'ready' && !missingKey && (
          <div className="cc-laosa-semantic">
            <button type="button" onClick={() => void desk.recommend()} disabled={desk.recommendation.status === 'loading' || desk.lines.length === 0}>
              {desk.recommendation.status === 'loading' ? t('正在阅读字幕…') : t('按语义推荐')}
            </button>
            <button type="button" onClick={desk.openSettings}>{t('打开设置')}</button>
            {desk.lines.length === 0 && <p className="cc-laosa-note">{t('没有可用字幕')}</p>}
            {desk.recommendation.status === 'empty' && <p className="cc-laosa-note">{t('没有可用字幕')}</p>}
            {desk.recommendation.status === 'error' && <p className="cc-laosa-note">{errorText(desk.recommendation.code, t)}</p>}
            {desk.recommendation.status === 'ready' && !desk.recommendation.demo && (
              <div className="cc-laosa-reason" data-laosa-semantic="result">
                <b>{desk.recommendation.result.size}</b>
                <span>{desk.recommendation.result.reason}</span>
                <button type="button" onClick={desk.applyRecommendation}>{t('采用')}</button>
              </div>
            )}
            <DemoSuggestBlock />
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
