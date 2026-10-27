(() => {
  'use strict';
  if (['fmgBackend', 'fmgStorage'].some(key => new URLSearchParams(location.search).has(key))) return;
  const selector = '#blobby-left,#blobby-overlay,[data-pogo],#nitro-floating-wrapper,.ad-container,.ad-wrapper,.ad-slot,.ad-banner,ins.adsbygoogle,[data-ad-slot],[data-ad-unit],[id^="google_ads_iframe_"],iframe[name^="google_ads_iframe_"],iframe[name^="aswift_"]';
  const adHosts = ['googlesyndication.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com', 'nitropay.com', 'getadmiral.com', 'bidpapers.com'];
  const hidden = new Map(), pending = new Set(), roots = new Set();
  let enabled = true, scheduled = false;
  function hide(node) {
    if (!hidden.has(node)) hidden.set(node, [node.style.getPropertyValue('display'), node.style.getPropertyPriority('display')]);
    if (!node.hasAttribute('data-lmg-ad-hidden')) node.setAttribute('data-lmg-ad-hidden', '');
    if (node.style.getPropertyValue('display') !== 'none' || node.style.getPropertyPriority('display') !== 'important') node.style.setProperty('display', 'none', 'important');
  }
  function adFrame(node) {
    if (node.tagName !== 'IFRAME') return false;
    try { const host = new URL(node.src, location.href).hostname; return adHosts.some(domain => host === domain || host.endsWith('.' + domain)); }
    catch { return false; }
  }
  function admiralOverlay(branding) {
    let candidate = null;
    for (let node = branding; node && node !== document.body && node !== document.documentElement; node = node.parentElement || node.getRootNode().host) {
      if (node.querySelector('#map,.maplibregl-map,.leaflet-container')) break;
      if (node.matches('[role="dialog"],[aria-modal="true"]') || getComputedStyle(node).position === 'fixed') candidate = node;
    }
    if (candidate) hide(candidate);
  }
  function inspect(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(selector) || adFrame(node) || hidden.has(node)) hide(node);
    if (node.shadowRoot) observe(node.shadowRoot);
    if (node.tagName === 'A') {
      try { const host = new URL(node.href, location.href).hostname; if (host === 'getadmiral.com' || host.endsWith('.getadmiral.com')) admiralOverlay(node); } catch {}
    }
    if (node.childElementCount === 0 && /^\s*powered\s+by\s+admiral\s*$/i.test(node.textContent)) admiralOverlay(node);
  }
  function scan(root) {
    inspect(root);
    if (!root.querySelectorAll) return;
    // Include descendants so late-arriving branding and open shadow roots are recognized.
    for (const node of root.querySelectorAll('*')) inspect(node);
  }
  function flush() {
    scheduled = false;
    if (!enabled) { pending.clear(); return; }
    const batch = pending.size > 100 ? [document] : [...pending]; pending.clear();
    for (const node of batch) if (node.isConnected && !batch.some(parent => parent !== node && parent.contains(node))) scan(node);
    for (const node of hidden.keys()) if (!node.isConnected) hidden.delete(node);
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') { for (const node of record.addedNodes) pending.add(node.nodeType === Node.ELEMENT_NODE ? node : record.target); }
      else {
        const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        // Map markers move continuously. Ignore unrelated style updates rather than rescanning their subtrees.
        if (record.attributeName === 'style' && node && !hidden.has(node) && !node.matches(selector) && node.tagName !== 'IFRAME' && !/admiral/i.test(node.textContent)) continue;
        pending.add(node);
      }
    }
    pending.delete(null);
    if (!scheduled && pending.size) { scheduled = true; queueMicrotask(flush); }
  });
  function observe(root) {
    if (roots.has(root)) return;
    roots.add(root);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['id', 'class', 'src', 'href', 'style', 'data-pogo', 'data-ad-slot', 'data-ad-unit', 'role', 'aria-modal'] });
    scan(root);
  }
  function setEnabled(value) {
    enabled = value !== false;
    document.documentElement?.setAttribute('data-lmg-adblock', enabled ? 'on' : 'off');
    observer.disconnect(); roots.clear(); pending.clear();
    if (enabled) observe(document);
    else {
      for (const [node, [value, priority]] of hidden) {
        if (value) node.style.setProperty('display', value, priority); else node.style.removeProperty('display');
        node.removeAttribute('data-lmg-ad-hidden');
      }
      hidden.clear();
    }
  }
  observe(document);
  document.addEventListener('readystatechange', () => document.documentElement?.setAttribute('data-lmg-adblock', enabled ? 'on' : 'off'));
  chrome.storage.local.get('enabled').then(value => setEnabled(value.enabled)).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.enabled) setEnabled(changes.enabled.newValue); });
})();
