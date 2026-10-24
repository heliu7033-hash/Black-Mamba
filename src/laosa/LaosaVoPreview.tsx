// SPDX-License-Identifier: AGPL-3.0-or-later
// B-CUT — VO / talking-head slot under the packaging card. Demo or user import.

import { useT } from '../i18n/locale';
import { useLaosaDesk } from './LaosaContext';

function looksLikeImage(name: string, src: string): boolean {
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(name)) return true;
  if (src.startsWith('blob:')) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(src);
}

/**
 * Renders the optional VO media behind the packaging card frame.
 * Remotion timeline content stays locked; this is a packaging-layer preview only.
 */
export function LaosaVoPreview() {
  const t = useT();
  const desk = useLaosaDesk();
  const vo = desk.prefs.voMedia;
  if (!vo?.src) {
    return (
      <div className="cc-laosa-vo-stage" data-laosa-vo="preview-empty" aria-hidden>
        <span>{t('口播成片空位')}</span>
      </div>
    );
  }
  if (looksLikeImage(vo.name, vo.src)) {
    return (
      <div className="cc-laosa-vo-stage is-filled" data-laosa-vo="preview">
        <img src={vo.src} alt={vo.name} />
      </div>
    );
  }
  return (
    <div className="cc-laosa-vo-stage is-filled" data-laosa-vo="preview">
      <video src={vo.src} muted playsInline loop autoPlay aria-label={vo.name} />
    </div>
  );
}
