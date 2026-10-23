// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — packaging language for the open editor tab.
// Preview passes it on the player. Browser export reads the same value so a
// caption burn follows the desk without re-timing the picture.

import type { DeskLanguage } from './types';

let current: DeskLanguage = 'zh';

export function setActivePackagingLanguage(language: DeskLanguage): void {
  current = language;
}

export function activePackagingLanguage(): DeskLanguage {
  return current;
}
