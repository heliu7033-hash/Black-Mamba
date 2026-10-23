// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — 老黑剪辑台 desk state. One preference record drives the top bar, inspector, and rails.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { PlayerRef } from '@remotion/player';
import type { CardRecommendation } from '../../shared/laosa-card';
import { getLocale, setLocale } from '../i18n/locale';
import type { TimelineState } from '../editor/types';
import { detectChapters } from './chapters';
import { defaultLaosaPrefs, ensureLaosaPrefs, saveLaosaPrefs } from './prefs';
import { autoLandClip, stubSmartFill } from './rails';
import { readOpenAiCompatibleKey, requestSemanticCard, SemanticCardError, type SemanticErrorCode } from './semanticClient';
import { styleById } from './styles';
import { packagingLinesFromTimeline } from './timelineLines';
import type { CardSize, ChapterMark, DeskLanguage, LaosaPrefs, NineAnchor, RailKind, StyleTemplate, TimedLine } from './types';

export type KeyPresence = 'unknown' | 'ready' | 'missing' | 'unreachable';

export type RecommendationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; result: CardRecommendation }
  | { status: 'error'; code: SemanticErrorCode };

export interface LaosaDeskValue {
  prefs: LaosaPrefs;
  style: StyleTemplate;
  activeSize: CardSize;
  activeAnchor: NineAnchor;
  selectedName: string | null;
  lines: TimedLine[];
  chapters: ChapterMark[];
  durationMs: number;
  playheadFrame: number;
  playheadMs: number;
  keyPresence: KeyPresence;
  recommendation: RecommendationState;
  setStyle: (id: string) => void;
  setLanguage: (language: DeskLanguage) => void;
  setCardSize: (size: CardSize) => void;
  setAnchor: (anchor: NineAnchor) => void;
  landRail: (rail: RailKind, frame: number, label: string) => void;
  stubFill: (rail: RailKind, frame: number) => void;
  recommend: () => Promise<void>;
  applyRecommendation: () => void;
  openSettings: () => void;
  seekFrame: (frame: number) => void;
  seekMs: (ms: number) => void;
  refreshKeyPresence: () => void;
}

const LaosaContext = createContext<LaosaDeskValue | null>(null);

function languageHint(): DeskLanguage {
  return getLocale() === 'en' ? 'en' : 'zh';
}

function activePackaging(prefs: LaosaPrefs, selectedItemId: string | null): { size: CardSize; anchor: NineAnchor } {
  if (selectedItemId && prefs.byItem[selectedItemId]) return prefs.byItem[selectedItemId]!;
  return { size: prefs.cardSize, anchor: prefs.anchor };
}

const FALLBACK_PREFS = defaultLaosaPrefs('zh');

const FALLBACK_DESK: LaosaDeskValue = {
  prefs: FALLBACK_PREFS,
  style: styleById(FALLBACK_PREFS.styleId),
  activeSize: FALLBACK_PREFS.cardSize,
  activeAnchor: FALLBACK_PREFS.anchor,
  selectedName: null,
  lines: [],
  chapters: [],
  durationMs: 1,
  playheadFrame: 0,
  playheadMs: 0,
  keyPresence: 'unknown',
  recommendation: { status: 'idle' },
  setStyle: () => {},
  setLanguage: () => {},
  setCardSize: () => {},
  setAnchor: () => {},
  landRail: () => {},
  stubFill: () => {},
  recommend: async () => {},
  applyRecommendation: () => {},
  openSettings: () => {},
  seekFrame: () => {},
  seekMs: () => {},
  refreshKeyPresence: () => {},
};

export function useLaosaDesk(): LaosaDeskValue {
  return useContext(LaosaContext) ?? FALLBACK_DESK;
}

interface LaosaProviderProps {
  projectId: string;
  state: TimelineState;
  playerRef: RefObject<PlayerRef | null>;
  onOpenSettings?: (route?: string) => void;
  children: ReactNode;
}

export function LaosaProvider({ projectId, state, playerRef, onOpenSettings, children }: LaosaProviderProps) {
  const [prefs, setPrefs] = useState<LaosaPrefs>(() => ensureLaosaPrefs(projectId, languageHint()));
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [keyPresence, setKeyPresence] = useState<KeyPresence>('unknown');
  const [recommendation, setRecommendation] = useState<RecommendationState>({ status: 'idle' });

  const commit = (recipe: (current: LaosaPrefs) => LaosaPrefs) => {
    setPrefs((current) => {
      const next = recipe(current);
      saveLaosaPrefs(projectId, next);
      return next;
    });
  };

  const selectedItemId = state.selectedId ?? null;
  const selectedName = state.items.find((item) => item.id === selectedItemId)?.name ?? null;
  const packaging = activePackaging(prefs, selectedItemId);

  const updatePackaging = (patch: Partial<{ size: CardSize; anchor: NineAnchor }>) => {
    commit((current) => {
      const active = activePackaging(current, selectedItemId);
      const size = patch.size ?? active.size;
      const anchor = patch.anchor ?? active.anchor;
      const next: LaosaPrefs = { ...current, cardSize: size, anchor };
      if (selectedItemId) next.byItem = { ...current.byItem, [selectedItemId]: { size, anchor } };
      return next;
    });
  };

  const lines = useMemo(() => packagingLinesFromTimeline(state, prefs.language), [state, prefs.language]);
  const chapters = useMemo(() => detectChapters(lines), [lines]);
  const timelineMs = state.items.reduce((max, item) => Math.max(max, ((item.startFrame + item.durationInFrames) / state.fps) * 1000), 0);
  const durationMs = Math.max(1, timelineMs, chapters.at(-1)?.endMs ?? 0);

  const refreshKeyPresence = () => {
    void readOpenAiCompatibleKey()
      .then((ready) => setKeyPresence(ready ? 'ready' : 'missing'))
      .catch(() => setKeyPresence('unreachable'));
  };

  useEffect(() => {
    refreshKeyPresence();
    const onFocus = () => refreshKeyPresence();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [projectId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const apply = (frame: number) => setPlayheadFrame((current) => current === frame ? current : frame);
    const onFrame = (event: { detail: { frame: number } }) => apply(event.detail.frame);
    apply(player.getCurrentFrame());
    player.addEventListener('frameupdate', onFrame);
    return () => player.removeEventListener('frameupdate', onFrame);
  }, [playerRef, state.items.length]);

  const value: LaosaDeskValue = {
    prefs,
    style: styleById(prefs.styleId),
    activeSize: packaging.size,
    activeAnchor: packaging.anchor,
    selectedName,
    lines,
    chapters,
    durationMs,
    playheadFrame,
    playheadMs: (playheadFrame / Math.max(1, state.fps)) * 1000,
    keyPresence,
    recommendation,
    setStyle: (id) => commit((current) => ({ ...current, styleId: styleById(id).id })),
    setLanguage: (language) => {
      setLocale(language);
      commit((current) => ({ ...current, language }));
    },
    setCardSize: (size) => updatePackaging({ size }),
    setAnchor: (anchor) => updatePackaging({ anchor }),
    landRail: (rail, frame, label) => {
      commit((current) => ({ ...current, rails: autoLandClip(current.rails, rail, frame, label) }));
    },
    stubFill: (rail, frame) => {
      commit((current) => ({ ...current, rails: stubSmartFill(current.rails, rail, frame) }));
    },
    recommend: async () => {
      if (!lines.length) {
        setRecommendation({ status: 'empty' });
        return;
      }
      setRecommendation({ status: 'loading' });
      try {
        const result = await requestSemanticCard(lines);
        setRecommendation({ status: 'ready', result });
        setKeyPresence('ready');
      } catch (error) {
        const code = error instanceof SemanticCardError ? error.code : 'upstream';
        if (code === 'missing_key') setKeyPresence('missing');
        setRecommendation({ status: 'error', code });
      }
    },
    applyRecommendation: () => {
      if (recommendation.status === 'ready') updatePackaging({ size: recommendation.result.size });
    },
    openSettings: () => onOpenSettings?.('llm/openai'),
    seekFrame: (frame) => playerRef.current?.seekTo(Math.max(0, Math.round(frame))),
    seekMs: (ms) => playerRef.current?.seekTo(Math.max(0, Math.round((ms / 1000) * Math.max(1, state.fps)))),
    refreshKeyPresence,
  };

  return <LaosaContext.Provider value={value}>{children}</LaosaContext.Provider>;
}
