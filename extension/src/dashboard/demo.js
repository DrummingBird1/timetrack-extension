// First-run demo data: the welcome-modal button and the "this is demo data" banner.
import { loadDemo, removeDemo, isDemoActive } from '../lib/demo.js';
import { t } from '../lib/i18n.js';
import { $, setAllCache, toast, closeModal, actions } from './core.js';

export async function updateDemoBanner() {
  $('#demoBanner').classList.toggle('hidden', !(await isDemoActive()));
}

export function wireDemo() {
  $('#welcomeDemo').addEventListener('click', async () => {
    try {
      await loadDemo();
      closeModal();
      setAllCache(null);
      await actions.refresh();
      toast(t('demo.loaded'), 'success');
    } catch (e) {
      toast(e.code === 'HAS_DATA' ? t('demo.hasData') : e.message, 'error');
    }
  });
  $('#demoRemove').addEventListener('click', async () => {
    await removeDemo();
    setAllCache(null);
    await actions.refresh();
    toast(t('demo.removed'), 'success');
  });
}
