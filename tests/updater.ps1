$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\updater\Core.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('lmg-updater-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$template = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\manifest.json') -Raw
$script:passed = 0
function Assert([bool]$Value, [string]$Message) { if (!$Value) { throw $Message } }
function ExpectFailure([scriptblock]$Action, [string]$Pattern) {
    $failed = $false
    try { & $Action } catch { $failed = $true; Assert ($_.Exception.Message -match $Pattern) ('Unexpected error: ' + $_.Exception.Message) }
    Assert $failed 'Expected operation to fail.'
}
function RunTest([string]$Name, [scriptblock]$Action) { & $Action; $script:passed++; Write-Output ('PASS ' + $Name) }
function Fixture {
    $base = Join-Path $testRoot ([guid]::NewGuid().ToString('N'))
    $installed = Join-Path $base 'LMG chosen folder'
    $source = Join-Path $base 'release'
    New-Item -ItemType Directory -Path $installed,$source | Out-Null
    $old = $template | ConvertFrom-Json; $old.version = '1.0.0'
    $old | Add-Member -NotePropertyName oauth2 -NotePropertyValue @{ client_id='keep-me.apps.googleusercontent.com'; scopes=@('https://www.googleapis.com/auth/drive.appdata') } -Force
    Write-LMGJson (Join-Path $installed 'manifest.json') $old
    $new = $template | ConvertFrom-Json; $new.version = '1.1.0'
    Write-LMGJson (Join-Path $source 'manifest.json') $new
    foreach ($file in @('background.js','page.js','popup.html','drive-sync\entry.js','drive-sync\worker.js')) {
        $target = Join-Path $source $file
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        [IO.File]::WriteAllText($target, '// test fixture')
    }
    return @{ Base=$base; Root=$installed; Source=$source; Zip=(Join-Path $base 'release.zip') }
}
function Pack($F) { [IO.Compression.ZipFile]::CreateFromDirectory($F.Source,$F.Zip); return (Get-FileHash -LiteralPath $F.Zip).Hash }
RunTest 'verified package swaps directory, preserves OAuth, retains backup and writes ready marker' {
    $f = Fixture; $hash = Pack $f
    Write-LMGJson (Join-Path $f.Root 'lmg-update-status.json') @{ nativeHost='com.longmapgine.updater.f0123456789abcdef'; state='installed' }
    $result = Install-LMGPackage $f.Root $f.Zip $hash '1.1.0'
    $m = Get-Content -LiteralPath (Join-Path $f.Root 'manifest.json') -Raw | ConvertFrom-Json
    Assert ($m.version -eq '1.1.0') 'Version not updated.'
    Assert ($m.oauth2.client_id -eq 'keep-me.apps.googleusercontent.com') 'OAuth was lost.'
    Assert (Test-Path -LiteralPath (Join-Path $result.Backup 'manifest.json')) 'Backup missing.'
    $marker = Get-Content -LiteralPath (Join-Path $f.Root 'lmg-update-status.json') -Raw | ConvertFrom-Json
    Assert ($marker.state -eq 'ready') 'No ready marker.'
    Assert ($marker.nativeHost -eq 'com.longmapgine.updater.f0123456789abcdef') 'Manual updater host was lost.'
}
RunTest 'bad SHA-256 leaves installed manifest untouched' {
    $f = Fixture; $null = Pack $f
    ExpectFailure { Install-LMGPackage $f.Root $f.Zip ('0' * 64) '1.1.0' } 'SHA-256 mismatch'
    Assert ((Get-Content -LiteralPath (Join-Path $f.Root 'manifest.json') -Raw | ConvertFrom-Json).version -eq '1.0.0') 'Original changed.'
}
RunTest 'wrong extension key is rejected before swapping files' {
    $f = Fixture; $m = $template | ConvertFrom-Json; $m.version='1.1.0'; $m.key='wrong'
    Write-LMGJson (Join-Path $f.Source 'manifest.json') $m; $hash = Pack $f
    ExpectFailure { Install-LMGPackage $f.Root $f.Zip $hash '1.1.0' } 'identity/version'
}
RunTest 'ZIP traversal is rejected before extracting outside staging' {
    $f = Fixture; $null = Pack $f
    $archive = [IO.Compression.ZipFile]::Open($f.Zip, [IO.Compression.ZipArchiveMode]::Update)
    try { $entry = $archive.CreateEntry('../escaped.txt'); $writer=[IO.StreamWriter]::new($entry.Open()); $writer.Write('bad'); $writer.Dispose() } finally {$archive.Dispose()}
    $hash=(Get-FileHash -LiteralPath $f.Zip).Hash
    ExpectFailure { Install-LMGPackage $f.Root $f.Zip $hash '1.1.0' } 'Unsafe ZIP path'
}
RunTest 'incomplete release and downgrade are rejected' {
    $f = Fixture; $hash = Pack $f
    ExpectFailure { Install-LMGPackage $f.Root $f.Zip $hash '1.0.0' } 'newer'
    $archive=[IO.Compression.ZipFile]::Open($f.Zip,[IO.Compression.ZipArchiveMode]::Update)
    try { $archive.GetEntry('page.js').Delete() } finally {$archive.Dispose()}
    $hash=(Get-FileHash -LiteralPath $f.Zip).Hash
    ExpectFailure { Install-LMGPackage $f.Root $f.Zip $hash '1.1.0' } 'Incomplete package'
}
RunTest 'Git source folder is not modified by the automatic updater' {
    $f = Fixture; New-Item -ItemType Directory -Path (Join-Path $f.Root '.git') | Out-Null
    ExpectFailure { Get-LMGRoot $f.Root } 'Git source checkout'
}
RunTest 'directory swap failure rolls back the original folder' {
    $f = Fixture; $hash = Pack $f
    function Move-Item {
        param($LiteralPath,$Destination)
        if ((Split-Path -Leaf $LiteralPath) -like 'stage-*') { throw 'Simulated stage move failure' }
        Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination
    }
    try {
        ExpectFailure { Install-LMGPackage $f.Root $f.Zip $hash '1.1.0' } 'Simulated stage move failure'
        Assert ((Get-Content -LiteralPath (Join-Path $f.Root 'manifest.json') -Raw | ConvertFrom-Json).version -eq '1.0.0') 'Rollback failed.'
    } finally { Remove-Item Function:\Move-Item }
}
RunTest 'release metadata rejects other repositories and prereleases' {
    $r = @{ tag_name='v1.1.0'; draft=$false; prerelease=$false; assets=@(
        @{name='LMG-1.1.0-chrome.zip';size=100;browser_download_url='https://github.com/other/repo/release.zip'},
        @{name='LMG-1.1.0-chrome.zip.sha256';size=100;browser_download_url='https://github.com/other/repo/release.sha256'}
    ) }
    # JSON conversion matches Invoke-RestMethod objects.
    $r = $r | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    ExpectFailure { Get-LMGRelease $r } 'origin'
    $r.prerelease = $true
    ExpectFailure { Get-LMGRelease $r } 'stable'
}
RunTest 'GitHub checksum downloads accept binary or text bodies and reject wrong filenames' {
    $hash = 'a' * 64
    $text = $hash + '  LMG-1.1.1-chrome.zip' + "`n"
    Assert ((Read-LMGChecksum $text 'LMG-1.1.1-chrome.zip') -eq $hash) 'Text checksum failed.'
    Assert ((Read-LMGChecksum ([Text.Encoding]::UTF8.GetBytes($text)) 'LMG-1.1.1-chrome.zip') -eq $hash) 'Binary checksum failed.'
    ExpectFailure { Read-LMGChecksum $text 'other.zip' } 'Invalid release checksum'
}
RunTest 'installer can describe the selected folder without registering a task' {
    $f = Fixture
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot '..\updater\Install-LMGUpdater.ps1') -ExtensionDirectory $f.Root -DescribeOnly
    Assert ($LASTEXITCODE -eq 0) 'DescribeOnly failed.'
    $info = $output | ConvertFrom-Json
    Assert ($info.Folder -eq $f.Root -and $info.IntervalHours -eq 6 -and $info.RunLevel -eq 'Limited' -and $info.WindowStyle -eq 'Hidden') 'Installer configuration mismatch.'
}
Write-Output ("Passed $script:passed Windows updater tests. Fixtures: $testRoot")
