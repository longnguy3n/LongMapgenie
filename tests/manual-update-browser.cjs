// Full browser -> native host -> Windows task roundtrip, with a harmless fixture updater.
// Installs only a uniquely named test task/host and removes both in finally.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-manual-test-'));
const root = path.join(temp, 'LMG selected folder');
fs.mkdirSync(root);
for (const item of ['manifest.json','background.js','page.js','popup.html','dataManager.html','offscreen.html','logo.svg','assets','chunks','content-scripts','icon','drive-sync','updates','updater','lmg-update-status.json']) {
  fs.cpSync(path.join(project, item), path.join(root, item), { recursive: true });
}
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
delete manifest.oauth2;
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
fs.writeFileSync(path.join(root, 'lmg-update-status.json'), JSON.stringify({ state: 'not-installed' }));
fs.writeFileSync(path.join(root, 'updater/Update-LMG.ps1'), `param([string]$ExtensionDirectory)
. (Join-Path $PSScriptRoot 'Core.ps1')
Start-Sleep -Seconds 2
$file = Join-Path $ExtensionDirectory 'lmg-update-status.json'
$marker = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
Write-LMGJson $file @{ state='installed'; version='${manifest.version}'; checkedAt=[DateTime]::UtcNow.ToString('o'); nativeHost=$marker.nativeHost; message='Fixture completed.' }
[IO.File]::WriteAllText((Join-Path $ExtensionDirectory 'manual-triggered.txt'), 'ok')
`);
const installer = path.join(root, 'updater/Install-LMGUpdater.ps1');
function install(uninstall = false) {
  return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',installer,'-ExtensionDirectory',root,'-NoDialog',...(uninstall ? ['-Uninstall'] : [])],
    { encoding: 'utf8', env: { ...process.env, LOCALAPPDATA: path.join(temp, 'localappdata') } });
}
(async () => {
  let context, attempted = false;
  try {
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
    });
    await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>LMG test</body>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = 'chrome-extension://' + new URL(worker.url()).host;
    let page = await context.newPage();
    await page.goto('chrome://extensions');
    await page.evaluate(() => new Promise(resolve => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve)));
    await page.goto(base + '/drive-sync/settings.html');
    await page.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    await page.locator('#update-now').click();
    await page.waitForFunction(() => document.getElementById('update-manual').textContent.includes('Install-LMG-Updater.cmd'));
    attempted = true;
    console.log(install().trim());
    // Simulate an existing periodic installation, then verify reinstall removes its timer.
    const marker = JSON.parse(fs.readFileSync(path.join(root, 'lmg-update-status.json')));
    const taskName = marker.task;
    const ps = command => execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command], { encoding: 'utf8' });
    const taskLiteral = "'" + taskName.replaceAll("'", "''") + "'";
    ps(`$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(6) -RepetitionInterval (New-TimeSpan -Hours 6); Set-ScheduledTask -TaskName ${taskLiteral} -Trigger $trigger | Out-Null`);
    install();
    const scheduled = JSON.parse(ps(`$task = Get-ScheduledTask -TaskName ${taskLiteral}; [pscustomobject]@{Count=@($task.Triggers | Where-Object { $null -ne $_ }).Count;StartWhenAvailable=$task.Settings.StartWhenAvailable;Enabled=$task.Settings.Enabled;Demand=$task.Settings.AllowDemandStart} | ConvertTo-Json`));
    assert.equal(scheduled.Count, 0);
    assert.equal(scheduled.StartWhenAvailable, false);
    assert.equal(scheduled.Enabled, true);
    assert.equal(scheduled.Demand, true);
    assert.equal(fs.existsSync(path.join(root, 'manual-triggered.txt')), false);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('update-helper').textContent.includes('đã cài'));
    await page.locator('#update-now').click();
    await page.waitForFunction(() => document.getElementById('update-manual').textContent.includes('Đã kiểm tra và cài'), null, { timeout: 45000 });
    assert.equal(fs.readFileSync(path.join(root, 'manual-triggered.txt'), 'utf8'), 'ok');
    console.log('PASS: periodic task migrated to zero triggers; no automatic run; settings button -> native host -> on-demand task -> completion.');
    assert.equal(await page.locator('#connect').isDisabled(), true);
    manifest.oauth2 = { client_id: 'test-only.apps.googleusercontent.com', scopes: ['https://www.googleapis.com/auth/drive.appdata'] };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await page.reload();
    await page.locator('#reload-extension').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#connect').isDisabled(), true);
    const closed = page.waitForEvent('close');
    await page.locator('#reload-extension').click();
    await closed;
    page = await context.newPage();
    let loaded = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await page.goto(base + '/drive-sync/settings.html'); loaded = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.equal(loaded, true, 'Extension should finish reloading');
    await page.waitForFunction(() => document.getElementById('oauth-status').textContent.includes('Chrome đã nhận'));
    assert.equal(await page.locator('#connect').isDisabled(), false);
    console.log('PASS: saved OAuth is detected before extension reload; reload button makes Chrome load it and enables Connect.');
  } finally {
    if (context) await context.close();
    if (attempted) console.log(install(true).trim());
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
