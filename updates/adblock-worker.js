(() => {
  'use strict';
  let queue = Promise.resolve();
  const synchronize = () => {
    queue = queue.catch(() => {}).then(async () => {
      const enabled = (await chrome.storage.local.get('enabled')).enabled !== false;
      await chrome.declarativeNetRequest.updateEnabledRulesets(enabled
        ? { enableRulesetIds: ['lmg_ads'], disableRulesetIds: [] }
        : { enableRulesetIds: [], disableRulesetIds: ['lmg_ads'] });
    }).catch(error => console.warn('LMG ad rules:', error.message));
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.enabled) synchronize(); });
  chrome.runtime.onInstalled.addListener(synchronize);
  chrome.runtime.onStartup.addListener(synchronize);
  synchronize();
})();
