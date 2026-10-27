param([Parameter(Mandatory=$true)][string]$ExtensionDirectory)
. (Join-Path $PSScriptRoot 'Core.ps1')
$lock = $null
$root = $null
try {
    $root = Get-LMGRoot $ExtensionDirectory
    $state = Join-Path $env:LOCALAPPDATA ('LongMapgine\updater\' + (Get-LMGFolderId $root))
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    Assert-LMGNoLinks $state
    try { $lock = [IO.File]::Open((Join-Path $state 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { exit 0 }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ 'User-Agent' = 'LMG-Windows-Updater'; Accept = 'application/vnd.github+json' }
    $remote = Invoke-RestMethod -Uri 'https://api.github.com/repos/longnguy3n/LongMapgine/releases/latest' -Headers $headers -TimeoutSec 60
    $release = Get-LMGRelease $remote
    $manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
    if ((Get-LMGVersion $release.Version) -le (Get-LMGVersion $manifest.version)) {
        $existing = Get-Content -LiteralPath (Join-Path $root 'lmg-update-status.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
        # Do not erase a ready marker before a running browser has reloaded the new files.
        if ((Get-LMGProperty $existing 'state') -ne 'ready') {
            Write-LMGJson (Join-Path $root 'lmg-update-status.json') @{ state='installed'; version=$manifest.version; checkedAt=[DateTime]::UtcNow.ToString('o'); message='Latest version is installed.' }
        }
        exit 0
    }
    $download = Join-Path $state ([guid]::NewGuid().ToString('N') + '.zip')
    $checksumText = (Invoke-WebRequest -UseBasicParsing -Uri $release.ChecksumUrl -Headers $headers -TimeoutSec 60).Content
    $checksum = Read-LMGChecksum $checksumText $release.Name
    if ($release.Digest -and $release.Digest -ine ('sha256:' + $checksum)) { throw 'GitHub asset digest differs from checksum file.' }
    Invoke-WebRequest -UseBasicParsing -Uri $release.Url -Headers $headers -TimeoutSec 180 -OutFile $download
    $result = Install-LMGPackage $root $download $checksum $release.Version
    Write-LMGJson (Join-Path $state 'last-result.json') @{ state='ready'; version=$result.Version; backup=$result.Backup; time=[DateTime]::UtcNow.ToString('o') }
    # Future helper improvements are taken from the already verified package.
    if ((Resolve-Path -LiteralPath $PSScriptRoot).Path -eq $state) {
        foreach ($file in @('Core.ps1','Update-LMG.ps1')) {
            $source = Join-Path $root ('updater\' + $file)
            if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $state $file) -Force }
        }
    }
} catch {
    $message = $_.Exception.Message
    if ($root -and (Test-Path -LiteralPath $root)) {
        try { Write-LMGJson (Join-Path $root 'lmg-update-status.json') @{ state='error'; message=$message; time=[DateTime]::UtcNow.ToString('o') } } catch {}
    }
    Write-Error $message
    exit 1
} finally { if ($lock) { $lock.Dispose() } }
