$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
if ($manifest.oauth2) { throw 'Release packages must not include a locally configured OAuth client. Remove oauth2 before packaging.' }
$dist = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$staging = Join-Path $dist ('stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
$items = @('manifest.json','background.js','page.js','popup.html','dataManager.html','offscreen.html','logo.svg','assets','chunks','content-scripts','icon','drive-sync','configure-drive.cjs','HUONG-DAN.txt','README.md','THIRD-PARTY-NOTICES.md')
foreach ($item in $items) { Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination $staging -Recurse }
$archive = Join-Path $dist ('LMG-' + $manifest.version + '-chrome.zip')
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -Force
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($archive + '.sha256', $digest + '  ' + [IO.Path]::GetFileName($archive) + "`n")
Write-Output $archive
Write-Output ('SHA256 ' + $digest)
