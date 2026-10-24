// SPDX-License-Identifier: AGPL-3.0-or-later
// Bcot — open or create the 老黑剪辑台 sample project.

import { setLocale } from '../i18n/locale';
import { docFromTimeline, createProject, listProjects, saveProject, updateProjectMeta } from '../persist/projectStore';
import type { ProjectMeta } from '../persist/projectStoreCoordinators';
import {
  LAOHEI_DEMO_DESCRIPTION,
  LAOHEI_DEMO_DESCRIPTION_PREFIX,
  LAOHEI_DEMO_NAME,
  laoheiDemoPrefs,
  laoheiDemoTimeline,
} from './demoFixture';
import { laosaPrefsKey, saveLaosaPrefs } from './prefs';

let inflight: Promise<ProjectMeta> | null = null;

function seedPrefsIfMissing(projectId: string): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(laosaPrefsKey(projectId))) return;
  } catch {
    /* private mode: still try to write */
  }
  saveLaosaPrefs(projectId, laoheiDemoPrefs());
}

async function createOrOpen(): Promise<ProjectMeta> {
  const projects = await listProjects();
  let meta = projects.find((project) => project.description === LAOHEI_DEMO_DESCRIPTION);
  if (!meta) {
    const doc = docFromTimeline(laoheiDemoTimeline(), '老黑剪辑台');
    const older = projects.find((project) => project.description?.startsWith(LAOHEI_DEMO_DESCRIPTION_PREFIX));
    if (older) {
      await saveProject(older.id, doc);
      meta = (await updateProjectMeta(older.id, {
        name: LAOHEI_DEMO_NAME,
        description: LAOHEI_DEMO_DESCRIPTION,
      })) ?? older;
      // One-time upgrade from the short stub rails. Later visits keep user edits.
      saveLaosaPrefs(meta.id, laoheiDemoPrefs());
    } else {
      meta = await createProject(LAOHEI_DEMO_NAME, doc, { description: LAOHEI_DEMO_DESCRIPTION });
      seedPrefsIfMissing(meta.id);
    }
  } else {
    seedPrefsIfMissing(meta.id);
  }
  // This entry is the Chinese demo. It does not rewrite packaging prefs that already exist.
  setLocale('zh');
  return meta;
}

/** Idempotent. A version bump refreshes the sample once; later visits keep packaging edits. */
export function ensureLaoheiDemo(): Promise<ProjectMeta> {
  inflight ??= createOrOpen().finally(() => {
    inflight = null;
  });
  return inflight;
}
