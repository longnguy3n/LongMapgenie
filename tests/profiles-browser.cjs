// Offline profiles through the real legacy backend, with isolated IndexedDB and popup UI.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-profiles-')), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  context.setDefaultTimeout(15000);
  try {
    await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>LMG offline profile test</body>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = 'chrome-extension://' + new URL(worker.url()).host;
    const settings = await context.newPage();
    await settings.goto(base + '/drive-sync/settings.html');
    await settings.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    const call = (action, extra = {}) => settings.evaluate(({ action, extra }) => chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra }), { action, extra });
    const snapshot = async () => { const result = await call('export'); assert.equal(result.error, undefined); return result.data.data; };
    const empty = await snapshot();
    for (const embedded of [false, true]) {
      await call('restore', { data: empty });
      const page = await context.newPage();
      page.on('pageerror', error => console.log('Popup page error:', error.message));
      page.on('console', message => { if (message.type() === 'error') console.log('Popup console:', message.text()); });
      if (embedded) {
        await page.goto('https://mapgenie.io/test');
        await page.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; frame.style = 'width:440px;height:700px'; document.body.append(frame); }, base + '/popup.html');
      } else await page.goto(base + '/popup.html');
      const target = embedded ? page.frameLocator('iframe[src="' + base + '/popup.html"]') : page;
      const profile = name => target.locator('button').filter({ hasText: new RegExp('^' + name + '$') });
      const create = target.locator('#_add-profile-button_czosh_1');
      const remove = target.locator('#_delete-profile-button_czosh_1');
      const backend = (method, args = []) => target.locator('body').evaluate(async (_, { method, args }) => {
        const module = await import('/chunks/react-redux-toastr.min-Z6pgLarm.js');
        return await module.n.use()[method](...args);
      }, { method, args });
      await target.locator('[title="profiles"]').click();
      await create.click();
      await profile('Guest 1').waitFor();
      assert.equal(await profile('Guest 1').getAttribute('aria-pressed'), 'true');
      assert.equal(await target.locator('body').innerText().then(text => text.includes('V1P3R')), false);
      await target.getByRole('button', { name: 'Đổi tên Guest 1', exact: true }).click();
      await target.getByRole('textbox', { name: 'Tên profile' }).fill('   ');
      await target.getByRole('button', { name: 'Lưu', exact: true }).click();
      await target.getByRole('alert').filter({ hasText: '1 đến 80' }).waitFor();
      await target.getByRole('textbox', { name: 'Tên profile' }).fill('Nháp');
      await target.getByRole('button', { name: 'Hủy', exact: true }).click();
      assert.equal((await snapshot()).tables.profiles[0].name, 'Guest 1');
      await target.getByRole('button', { name: 'Đổi tên Guest 1', exact: true }).click();
      await target.getByRole('textbox', { name: 'Tên profile' }).fill('  Kiếm sĩ Việt Nam  ');
      await target.getByRole('button', { name: 'Lưu', exact: true }).click();
      await profile('Kiếm sĩ Việt Nam').waitFor();
      assert.equal(await profile('Kiếm sĩ Việt Nam').getAttribute('aria-pressed'), 'true');
      assert.equal((await snapshot()).tables.profiles[0].id, -1);
      assert.equal((await snapshot()).tables.profiles[0].name, 'Kiếm sĩ Việt Nam');
      await assert.rejects(backend('renameProfile', [-1, '']), /1–80/);
      await assert.rejects(backend('renameProfile', [-1, 'x'.repeat(81)]), /1–80/);
      await assert.rejects(backend('renameProfile', [999999, 'Missing']), /không còn tồn tại/);
      await assert.rejects(backend('renameProfile', [-1, 'Stale', 'Guest 1']), /vừa thay đổi/);
      assert.equal((await snapshot()).tables.profiles[0].name, 'Kiếm sĩ Việt Nam');
      for (const n of [2, 3]) { await create.click(); await profile('Guest ' + n).waitFor(); }
      let data = await snapshot();
      assert.deepEqual(data.tables.profiles.map(p => p.id).sort(), [-1, -2, -3].sort());
      assert.deepEqual(data.tables.profiles.filter(p => p.active).map(p => p.id), [-1]);
      await assert.rejects(backend('setActiveProfile', [999999]), /Profile no longer exists/);
      assert.deepEqual((await snapshot()).tables.profiles.filter(p => p.active).map(p => p.id), [-1]);
      const added = await target.locator('body').evaluate(async () => {
        const { n } = await import('/chunks/react-redux-toastr.min-Z6pgLarm.js');
        const service = n.use();
        return await Promise.all([service.addGuestProfile(), service.addGuestProfile()]);
      });
      assert.deepEqual(added.map(p => p.id).sort(), [-4, -5].sort());
      data = await snapshot();
      data.tables.locations_v2.push({ user_id: -5, game_id: 1, id: 123 });
      data.tables.presets.push({ id: 9, user_id: -5, game_id: 1, name: 'Filter', categories: [12] });
      await call('restore', { data });
      await backend('renameProfile', [-5, 'Profile phụ', 'Guest 5']);
      assert.equal((await snapshot()).tables.locations_v2[0].user_id, -5);
      assert.equal((await snapshot()).tables.presets[0].user_id, -5);
      await backend('setActiveProfile', [-5]);
      await target.locator('[title="data"]').click();
      await target.locator('[title="profiles"]').click();
      await profile('Profile phụ').waitFor();
      page.once('dialog', dialog => dialog.dismiss());
      await remove.click();
      assert.equal((await snapshot()).tables.profiles.length, 5);
      page.once('dialog', dialog => dialog.accept());
      await remove.click();
      await profile('Profile phụ').waitFor({ state: 'hidden' });
      data = await snapshot();
      assert.deepEqual(data.tables.profiles.filter(p => p.active).map(p => p.id), [-1]);
      assert.equal(data.tables.locations_v2[0].user_id, -5);
      await create.click();
      await profile('Guest 6').waitFor();
      assert.equal((await snapshot()).tables.profiles.some(p => p.id === -5), false);
      await target.locator('[title="data"]').click();
      const exportButton = target.locator('button').filter({ hasText: /^Export all games$/ });
      await exportButton.waitFor();
      for (let i = 0; i < 50 && await exportButton.isDisabled(); i++) await page.waitForTimeout(100);
      assert.equal(await exportButton.isDisabled(), false);
      await target.locator('[title="profiles"]').click();
      if (!embedded) {
        await page.bringToFront();
        await profile('Guest 2').click();
        for (let i = 0; i < 50; i++) {
          if ((await snapshot()).tables.profiles.find(p => p.id === -2)?.active) break;
          await page.waitForTimeout(100);
        }
        assert.deepEqual((await snapshot()).tables.profiles.filter(p => p.active).map(p => p.id), [-2]);
        await page.reload();
        await target.locator('[title="profiles"]').click();
        await profile('Guest 2').waitFor();
        assert.equal(await profile('Guest 2').getAttribute('aria-pressed'), 'true');
        await page.screenshot({ path: path.join(__dirname, 'profiles-tab.png'), fullPage: true });
      }
      await page.close();
      console.log('PASS: profile rename/save/cancel/validation, stable IDs and ownership, first/third/concurrent creation, activation, delete fallback and Data availability (' + (embedded ? 'embedded' : 'standalone') + ').');
    }
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
