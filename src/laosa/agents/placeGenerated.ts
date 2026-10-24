// SPDX-License-Identifier: AGPL-3.0-or-later
// Drop generated media onto one named video track of the active timeline.

import type { EditorCommands } from '../../editor/storeCommands';
import type { MediaAsset, TimelineState, TrackId } from '../../editor/types';

type PlaceCommands = Pick<EditorCommands, 'addAsset' | 'addMediaItem' | 'createTrack'>;

export function trackIdByName(state: TimelineState, name: string): TrackId | null {
  const tracks = state.tracks ?? {};
  for (const [id, track] of Object.entries(tracks)) {
    if (track?.kind === 'video' && track.name === name) return id;
  }
  return null;
}

export function trackEndFrame(state: TimelineState, trackId: TrackId): number {
  return state.items.reduce((max, item) => (
    item.track === trackId ? Math.max(max, item.startFrame + item.durationInFrames) : max
  ), 0);
}

export function placeGeneratedAssets(
  commands: PlaceCommands,
  state: TimelineState,
  assets: readonly MediaAsset[],
  trackName: string,
): string[] {
  if (!assets.length) return [];
  const existing = trackIdByName(state, trackName);
  const track = existing ?? commands.createTrack('video', { name: trackName });
  let frame = existing ? trackEndFrame(state, existing) : 0;
  const ids: string[] = [];
  for (const asset of assets) {
    commands.addAsset(asset);
    ids.push(commands.addMediaItem(asset, { track, startFrame: frame }));
    frame += Math.max(1, asset.durationInFrames);
  }
  return ids;
}
