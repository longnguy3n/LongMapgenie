param([string]$Project, [string]$Root, [string]$Stage, [string]$Zip, [ValidateSet('pack','install')][string]$Mode)
$ErrorActionPreference = 'Stop'
if ($Mode -eq 'pack') { Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip; exit 0 }
. (Join-Path $Project 'updater\Core.ps1')
$checksum = Get-LMGFileHash $Zip
Install-LMGPackage $Root $Zip $checksum '1.1.1' | ConvertTo-Json
