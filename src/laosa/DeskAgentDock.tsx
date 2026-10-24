// SPDX-License-Identifier: AGPL-3.0-or-later
// LibTV and TapNow prompt docks pinned to the bottom of the timeline.

import { useEffect, useState } from 'react';
import type { EditorCommands } from '../editor/storeCommands';
import type { MediaAsset, TimelineState } from '../editor/types';
import { useT } from '../i18n/locale';
import { buildDemoFile } from './agents/demoMedia';
import { promptMediaKind } from './agents/libtvExtract';
import { readAgentStatus, runLibtv, type AgentStatus } from './agents/libtvClient';
import { placeGeneratedAssets, trackEndFrame, trackIdByName } from './agents/placeGenerated';
import { runTapnow } from './agents/runTapnow';
import { stageGeneratedFile, stageUploadedSrc } from './agents/stageMedia';
import type { TapNowClip } from './agents/tapnowClient';

type Provider = 'libtv' | 'tapnow';

interface Line {
  id: string;
  role: 'user' | 'agent' | 'error';
  text: string;
}

interface DeskAgentDockProps {
  state: TimelineState;
  commands: EditorCommands;
  seekTo: (frame: number) => void;
}

const EMPTY_STATUS: AgentStatus = { libtv: false, tapnow: false, mcpInBrowser: false };

function Logo({ provider }: { provider: Provider }) {
  const src = provider === 'libtv' ? '/laosa/libtv.svg' : '/laosa/tapnow.svg';
  return <img src={src} alt="" width={18} height={18} draggable={false} />;
}

export function DeskAgentDock({ state, commands, seekTo }: DeskAgentDockProps) {
  const t = useT();
  const [open, setOpen] = useState<Provider | null>(null);
  const [status, setStatus] = useState<AgentStatus>(EMPTY_STATUS);
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ libtv: '', tapnow: '' });
  const [logs, setLogs] = useState<Record<Provider, Line[]>>({ libtv: [], tapnow: [] });
  const [reference, setReference] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');

  useEffect(() => {
    let cancelled = false;
    void readAgentStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => { cancelled = true; };
  }, [open]);

  const push = (provider: Provider, role: Line['role'], text: string) => {
    setLogs((current) => ({
      ...current,
      [provider]: [...current[provider], { id: `${role}_${Date.now()}_${current[provider].length}`, role, text }],
    }));
  };

  const toggle = (provider: Provider) => {
    setOpen((current) => current === provider ? null : provider);
  };

  const submit = async (provider: Provider) => {
    const prompt = drafts[provider].trim();
    if (!prompt || busy) return;
    setBusy(true);
    setPhase(t('正在提交…'));
    push(provider, 'user', prompt);
    const latest = await readAgentStatus();
    setStatus(latest);
    const live = provider === 'libtv' ? latest.libtv : latest.tapnow;
    if (!live && reference && provider === 'libtv') push(provider, 'agent', t('演示模式不会上传参考文件。'));
    try {
      let clips: TapNowClip[] = [];
      let mode: 'demo' | 'live' = 'demo';
      if (provider === 'libtv') {
        const result = await runLibtv({
          prompt,
          reference: live ? reference : null,
          onPhase: (next) => setPhase(next === 'upload' ? t('正在上传参考…') : next === 'import' ? t('正在导入时间线…') : t('正在生成…')),
        });
        mode = result.mode;
        if (result.mode === 'live') clips = result.clips;
      } else {
        const result = await runTapnow({
          prompt,
          onPhase: (next) => setPhase(next === 'poll' ? t('正在生成…') : t('正在提交…')),
        });
        mode = result.mode;
        if (result.mode === 'live') clips = result.clips;
      }
      if (mode === 'demo') {
        setPhase(t('正在生成…'));
        await new Promise((resolve) => setTimeout(resolve, 450));
        const file = await buildDemoFile(provider, prompt);
        setPhase(t('正在导入时间线…'));
        const asset = await stageGeneratedFile(file, state.fps || 30, promptMediaKind(prompt));
        land(provider, [asset]);
        push(provider, 'agent', t('演示模式已把素材放到时间线'));
      } else {
        setPhase(t('正在导入时间线…'));
        const assets: MediaAsset[] = [];
        for (const clip of clips) assets.push(await stageUploadedSrc(clip.src, clip.name, clip.kind, state.fps || 30));
        land(provider, assets);
        push(provider, 'agent', t('已放到时间线'));
      }
      setDrafts((current) => ({ ...current, [provider]: '' }));
      setReference(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const text = code === 'timeout'
        ? t('生成超时，可稍后在 LibTV 画布查看。')
        : code === 'reference_too_large'
          ? t('参考文件过大')
          : t('生成失败');
      push(provider, 'error', text);
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const land = (provider: Provider, assets: MediaAsset[]) => {
    const trackName = provider === 'libtv' ? 'LibTV' : 'TapNow';
    const existing = trackIdByName(state, trackName);
    const frame = existing ? trackEndFrame(state, existing) : 0;
    const ids = placeGeneratedAssets(commands, state, assets, trackName);
    if (ids.length) seekTo(frame);
  };

  const provider = open;
  const connected = provider === 'libtv' ? status.libtv : provider === 'tapnow' ? status.tapnow : false;
  return (
    <div className="cc-desk-agents" data-desk-agents="dock">
      {provider && (
        <form
          className="cc-desk-agent-panel"
          data-desk-agent-panel={provider}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(provider);
          }}
        >
          <header>
            <img src={provider === 'libtv' ? '/laosa/libtv.svg' : '/laosa/tapnow.svg'} alt="" width={16} height={16} />
            <strong>{provider === 'libtv' ? 'LibTV' : 'TapNow'}</strong>
            <span data-desk-agent-mode={connected ? 'live' : 'demo'}>
              {connected ? (provider === 'libtv' ? t('已连接 LibTV') : t('已连接 TapNow HTTP')) : t('演示模式')}
            </span>
            <button type="button" onClick={() => setOpen(null)} aria-label={t('关闭')}>{t('关闭')}</button>
          </header>
          <p className="cc-desk-agent-note">
            {provider === 'tapnow' && !connected
              ? t('TapNow 未配置 HTTP，使用演示。浏览器不能调用 TapNow MCP。')
              : provider === 'libtv' && !connected
                ? t('LibTV 未配置密钥，使用演示素材。')
                : provider === 'tapnow'
                  ? t('通过本机 HTTP 适配器生成，结果进入时间线。')
                  : t('把描述交给 LibTV，生成的图片或视频会进时间线。')}
          </p>
          <div className="cc-desk-agent-log" data-desk-agent-log={provider}>
            {logs[provider].map((line) => (
              <p key={line.id} data-role={line.role}>{line.text}</p>
            ))}
            {phase && <p data-role="agent">{phase}</p>}
          </div>
          {provider === 'libtv' && (
            <label className="cc-desk-agent-file">
              {t('参考文件')}
              <input
                type="file"
                accept="image/*,video/*"
                data-desk-agent-reference="libtv"
                onChange={(event) => setReference(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <div className="cc-desk-agent-compose">
            <textarea
              data-desk-agent-input={provider}
              value={drafts[provider]}
              placeholder={t('描述要生成的画面或镜头')}
              rows={2}
              disabled={busy}
              onChange={(event) => setDrafts((current) => ({ ...current, [provider]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit(provider);
                }
              }}
            />
            <button type="submit" data-desk-agent-send={provider} disabled={busy || !drafts[provider].trim()}>
              {busy ? t('正在生成…') : t('生成')}
            </button>
          </div>
        </form>
      )}
      <div className="cc-desk-agents-bar">
        <button type="button" data-desk-agent="libtv" aria-pressed={open === 'libtv'} onClick={() => toggle('libtv')}>
          <Logo provider="libtv" />
          <span>LibTV</span>
        </button>
        <button type="button" data-desk-agent="tapnow" aria-pressed={open === 'tapnow'} onClick={() => toggle('tapnow')}>
          <Logo provider="tapnow" />
          <span>TapNow</span>
        </button>
      </div>
    </div>
  );
}
