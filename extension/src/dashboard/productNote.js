// One-time note for people upgrading to schema v4: Gmail, Docs & co. are now separate sites,
// and the time recorded before the upgrade stays under the bare domain (e.g. google.com).
import { getIndex, getMeta, saveMeta } from '../lib/storage.js';
import { t } from '../lib/i18n.js';
import { $ } from './core.js';

export async function updateProductNote() {
  const el = $('#productNote');
  const meta = await getMeta();
  let show = false;
  if (meta.productSplitFrom && !meta.productSplitDismissed) {
    // New installs have no history from before the split, so there is nothing to explain.
    show = (await getIndex()).some((day) => day < meta.productSplitFrom);
  }
  el.classList.toggle('hidden', !show);
  if (show) $('#productNoteText').textContent = t('productNote.text', { d: meta.productSplitFrom });
}

export function wireProductNote() {
  $('#productNoteDismiss').addEventListener('click', async () => {
    await saveMeta({ productSplitDismissed: true });
    await updateProductNote();
  });
}
