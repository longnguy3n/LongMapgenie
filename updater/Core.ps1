Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:LMGRepo = 'https://github.com/longnguy3n/LongMapgine'
$script:LMGKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxEYYLZpsqYtLR55634okNz1Jib3QnwlY39am954jObqmFmyLOC8o6rwRUw0/AjZsNXzucuOAk3bDO+CjZW9DVqTbBrBcy0LCoLF0oOvW5PLBT1A7SxWRso2Ky03dgXCDCdNx2F/+rqfTuQMRRRoSn7XBFIrONoJv5C3QeDptJ2QCXnujQ1KcLz9N0TcExHkXMdhJWhE8shC+h7sKW6Xfjld3MPGul29VdL4mQvXgevqol4qQnsyHx6Y7XOm3dwfVgzADlT2NRG3CsJzAHM+Dv2Q7Q6LxMwyM8QzJhZnPVlPyI27PdV8TUbKbQPnnHGs7vhdYST6y1FQwbkx7lqIIrQIDAQAB'

function Get-LMGProperty($Object, [string]$Name, $Default = $null) {
    if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $Default
}
function Get-LMGVersion([string]$Value) {
    if ($Value -notmatch '^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(\.(0|[1-9]\d*))?$') { throw 'Invalid LMG version.' }
    $v = [version]($Value -replace '^v', '')
    foreach ($part in @($v.Major, $v.Minor, $v.Build, $v.Revision)) { if ($part -gt 65535) { throw 'Version exceeds Chrome limits.' } }
    return $v
}
function Assert-LMGNoLinks([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    while ($null -ne $item) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Updater does not follow junctions or symbolic links.' }
        $item = $item.Parent
    }
}
function Get-LMGRoot([string]$Path) {
    $root = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\', '/')
    if ($root -eq [IO.Path]::GetPathRoot($root).TrimEnd('\', '/')) { throw 'Cannot update a drive root.' }
    Assert-LMGNoLinks $root
    if (Test-Path -LiteralPath (Join-Path $root '.git')) { throw 'Choose an extracted extension folder, not the Git source checkout.' }
    $manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.name -ne 'LMG' -or $manifest.key -ne $script:LMGKey) { throw 'The selected folder is not this LMG extension.' }
    $null = Get-LMGVersion $manifest.version
    return $root
}
function Get-LMGFolderId([string]$Root) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())))).Replace('-', '').Substring(0, 16).ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Get-LMGFileHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
    finally { $sha.Dispose(); $stream.Dispose() }
}
function Write-LMGJson([string]$Path, $Value) {
    $tmp = $Path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($tmp, ($Value | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($tmp, $Path, [NullString]::Value) } else { [IO.File]::Move($tmp, $Path) }
}
function Get-LMGRelease($Release) {
    if ((Get-LMGProperty $Release 'draft' $false) -or (Get-LMGProperty $Release 'prerelease' $false)) { throw 'Only stable releases are accepted.' }
    $version = (Get-LMGVersion $Release.tag_name).ToString()
    if ($Release.tag_name -ne ('v' + $version)) { throw 'Unexpected release tag.' }
    $name = 'LMG-' + $version + '-chrome.zip'
    $zip = @($Release.assets | Where-Object { $_.name -eq $name })
    $checksum = @($Release.assets | Where-Object { $_.name -eq ($name + '.sha256') })
    $base = $script:LMGRepo + '/releases/download/v' + $version + '/'
    if ($zip.Count -ne 1 -or $checksum.Count -ne 1) { throw 'Release is missing its ZIP or checksum.' }
    if ($zip[0].browser_download_url -cne ($base + $name) -or $checksum[0].browser_download_url -cne ($base + $name + '.sha256')) { throw 'Unexpected release asset origin.' }
    if ($zip[0].size -gt 52428800) { throw 'Release package exceeds the 50 MiB limit.' }
    return [pscustomobject]@{ Version = $version; Name = $name; Url = $zip[0].browser_download_url; ChecksumUrl = $checksum[0].browser_download_url; Digest = (Get-LMGProperty $zip[0] 'digest' '') }
}
function Expand-LMGPackage([string]$ZipPath, [string]$Stage) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $prefix = [IO.Path]::GetFullPath($Stage).TrimEnd('\') + '\'
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        if ($archive.Entries.Count -gt 2000) { throw 'Too many files in update.' }
        $total = 0L
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $allowed = @('manifest.json','background.js','page.js','popup.html','dataManager.html','offscreen.html','logo.svg','assets','chunks','content-scripts','icon','drive-sync','updates','updater','lmg-update-status.json','Install-LMG-Updater.cmd','Uninstall-LMG-Updater.cmd','configure-drive.cjs','HUONG-DAN.txt','README.md','THIRD-PARTY-NOTICES.md')
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('/', '\')
            if ($name.Contains(':') -or $name.StartsWith('\') -or ($name.Split('\') -contains '..')) { throw 'Unsafe ZIP path.' }
            $target = [IO.Path]::GetFullPath((Join-Path $Stage $name))
            if (!$target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP path escapes staging folder.' }
            if (!$seen.Add($target)) { throw 'Duplicate ZIP path.' }
            if ($allowed -notcontains $name.Split('\')[0]) { throw 'Unexpected file in release package.' }
            if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'ZIP symbolic links are not allowed.' }
            $total += $entry.Length
            if ($total -gt 268435456) { throw 'Expanded release exceeds 256 MiB.' }
            if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
        }
    } finally { $archive.Dispose() }
}
function Install-LMGPackage([string]$Root, [string]$ZipPath, [string]$Checksum, [string]$Version) {
    $root = Get-LMGRoot $Root
    if ((Get-Item -LiteralPath $ZipPath).Length -gt 52428800) { throw 'Release package exceeds 50 MiB.' }
    if ($Checksum -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA-256 checksum.' }
    $actual = Get-LMGFileHash $ZipPath
    if ($actual -ine $Checksum) { throw 'SHA-256 mismatch; installed extension was not changed.' }
    $oldManifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
    $originalManifestHash = Get-LMGFileHash (Join-Path $root 'manifest.json')
    if ((Get-LMGVersion $Version) -le (Get-LMGVersion $oldManifest.version)) { throw 'Update must be newer than the installed version.' }
    $parent = [IO.Path]::GetDirectoryName($root)
    $work = Join-Path $parent ('.lmg-updates-' + (Get-LMGFolderId $root))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    Assert-LMGNoLinks $work
    $nonce = [guid]::NewGuid().ToString('N')
    $stage = Join-Path $work ('stage-' + $nonce)
    $backup = Join-Path $work ('backup-' + $oldManifest.version + '-' + $nonce)
    New-Item -ItemType Directory -Path $stage | Out-Null
    Expand-LMGPackage $ZipPath $stage
    $nextPath = Join-Path $stage 'manifest.json'
    $next = Get-Content -LiteralPath $nextPath -Raw | ConvertFrom-Json
    if ($next.name -ne 'LMG' -or $next.key -ne $script:LMGKey -or $next.version -ne $Version -or $next.manifest_version -ne 3) { throw 'Release identity/version does not match the installed extension.' }
    foreach ($required in @('background.js','page.js','popup.html','drive-sync\entry.js','drive-sync\worker.js')) {
        if (!(Test-Path -LiteralPath (Join-Path $stage $required) -PathType Leaf)) { throw ('Incomplete package: ' + $required) }
    }
    $oauth = Get-LMGProperty $oldManifest 'oauth2'
    if ($oauth) { $next | Add-Member -NotePropertyName oauth2 -NotePropertyValue $oauth -Force }
    elseif ($next.PSObject.Properties['oauth2']) { $next.PSObject.Properties.Remove('oauth2') }
    Write-LMGJson $nextPath $next
    if ((Get-LMGFileHash (Join-Path $root 'manifest.json')) -ne $originalManifestHash) { throw 'Installed manifest changed during update. Try again later.' }
    # All recursive moves are between checked absolute paths in the selected extension's parent.
    foreach ($path in @($stage, $backup)) {
        if (![IO.Path]::GetFullPath($path).StartsWith($work + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid move target.' }
    }
    $marker = @{ state = 'installing'; id = $nonce; version = $Version; time = [DateTime]::UtcNow.ToString('o') }
    Write-LMGJson (Join-Path $root 'lmg-update-status.json') $marker
    $moved = $false
    try {
        Move-Item -LiteralPath $root -Destination $backup
        $moved = $true
        Move-Item -LiteralPath $stage -Destination $root
    } catch {
        if ($moved -and !(Test-Path -LiteralPath $root)) { Move-Item -LiteralPath $backup -Destination $root }
        throw
    }
    $marker.state = 'ready'
    $marker.backup = $backup
    Write-LMGJson (Join-Path $root 'lmg-update-status.json') $marker
    return [pscustomobject]@{ Version = $Version; Backup = $backup; Root = $root }
}
