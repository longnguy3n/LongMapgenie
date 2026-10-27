const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-ads-')), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  try {
    await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="map">Map</div><div id="blobby-left"><div data-pogo="sidebar">Ad</div></div><div id="blobby-overlay" data-pogo="sticky">Ad</div><div id="login" role="dialog">Sign in</div><div id="note">Note editor</div></body></html>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const match = (url, initiator = 'https://mapgenie.io', type = 'script') => worker.evaluate(async ({url, initiator, type}) => {
      const result = await chrome.declarativeNetRequest.testMatchOutcome({ url, initiator, type });
      return result.matchedRules.some(rule => rule.rulesetId === 'lmg_ads');
    }, { url, initiator, type });
    for (const url of ['https://bidpapers.com/bundles/k52jhne_qw44a.js', 'https://cdn.ziffstatic.com/pg/mapgenie.js', 'https://cdn.ziffstatic.com/pg/mapgenie.prebid.js', 'https://securepubads.g.doubleclick.net/tag/js/gpt.js']) assert.equal(await match(url), true, url);
    for (const url of ['https://cdn.ziffstatic.com/jst/zdconsent.js', 'https://mapgenie.io/js/maplibre.js', 'https://accounts.google.com/o/oauth2/auth', 'https://www.googleapis.com/drive/v3/files']) assert.equal(await match(url), false, url);
    assert.equal(await match('https://bidpapers.com/test.js', 'https://example.com'), false);
    assert.equal(await match('https://bidpapers.com/', 'https://mapgenie.io', 'main_frame'), false);
    const page = await context.newPage();
    await page.goto('https://mapgenie.io/lmg-ads-test');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('blobby-overlay')).display === 'none');
    await page.waitForTimeout(11000); // Old blocker stopped after ten seconds.
    await page.evaluate(() => {
      const overlay = document.createElement('section'); overlay.id = 'admiral-fixture';
      overlay.style.cssText = 'position:fixed;inset:0;background:white';
      overlay.innerHTML = '<div role="dialog"><h2>Support this site</h2><a href="https://getadmiral.com">Powered by Admiral</a></div>';
      document.body.append(overlay);
      const textOnly = document.createElement('div'); textOnly.id = 'admiral-text'; textOnly.style.position = 'fixed';
      textOnly.innerHTML = '<span>Powered by Admiral</span>'; document.body.append(textOnly);
      const late = document.createElement('div'); late.id = 'late-ad'; late.dataset.pogo = 'sticky'; document.body.append(late);
    });
    await page.waitForFunction(() => ['admiral-fixture', 'admiral-text', 'late-ad'].every(id => getComputedStyle(document.getElementById(id)).display === 'none'));
    await page.evaluate(() => document.getElementById('admiral-fixture').style.setProperty('display', 'block', 'important'));
    await page.waitForFunction(() => getComputedStyle(document.getElementById('admiral-fixture')).display === 'none');
    await page.evaluate(() => { const e = document.createElement('div'); e.id = 'late-branding'; e.style.position = 'fixed'; e.innerHTML = '<span></span>'; document.body.append(e); });
    await page.waitForTimeout(50);
    await page.evaluate(() => document.querySelector('#late-branding span').textContent = 'Powered by Admiral');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('late-branding')).display === 'none');
    for (const selector of ['#map', '#login', '#note']) assert.equal(await page.locator(selector).isVisible(), true);
    await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
    await page.waitForFunction(() => document.documentElement.getAttribute('data-lmg-adblock') === 'off');
    assert.equal(await page.locator('#admiral-fixture').isVisible(), true);
    assert.equal(await match('https://bidpapers.com/bundles/k52jhne_qw44a.js'), false);
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true }));
    await page.waitForFunction(() => document.documentElement.getAttribute('data-lmg-adblock') === 'on');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('admiral-fixture')).display === 'none');
    console.log('PASS: Chrome DNR ad/Admiral matching, consent/map/OAuth exclusions, late ads, branded overlay reinsertion, ordinary modals and power toggle.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
