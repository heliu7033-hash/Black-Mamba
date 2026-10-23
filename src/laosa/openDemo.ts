// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenChatCut — open or create the 老黑剪辑台 sample project.

import { setLocale } from '../i18n/locale';
import { docFromTimeline, createProject, listProjects } from '../persist/projectStore';
import type { ProjectMeta } from '../persist/projectStoreCoordinators';
import { LAOHEI_DEMO_DESCRIPTION, LAOHEI_DEMO_NAME, laoheiDemoPrefs, laoheiDemoTimeline } from './demoFixture';
import { laosaPrefsKey, saveLaosaPrefs } from './prefs';

let inflight: Promise<ProjectMeta> | null = null;

async function createOrOpen(): Promise<ProjectMeta> {
  const projects = await listProjects();
  let meta = projects.find((project) => project.description === LAOHEI_DEMO_DESCRIPTION);
  if (!meta) {
    meta = await createProject(LAOHEI_DEMO_NAME, docFromTimeline(laoheiDemoTimeline(), '老黑剪辑台'), {
      description: LAOHEI_DEMO_DESCRIPTION,
    });
  }
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(laosaPrefsKey(meta.id))) {
      saveLaosaPrefs(meta.id, laoheiDemoPrefs());
    }
  } catch {
    saveLaosaPrefs(meta.id, laoheiDemoPrefs());
  }
  // This entry is the Chinese demo. It does not rewrite packaging prefs that already exist.
  setLocale('zh');
  return meta;
}

/** Idempotent. The sample timeline is written once; packaging prefs are filled only when missing. */
export function ensureLaoheiDemo(): Promise<ProjectMeta> {
  inflight ??= createOrOpen().finally(() => {
    inflight = null;
  });
  return inflight;
}
