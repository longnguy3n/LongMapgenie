param([string]$ExtensionDirectory, [switch]$Uninstall, [switch]$DescribeOnly, [switch]$NoDialog)
. (Join-Path $PSScriptRoot 'Core.ps1')
. (Join-Path $PSScriptRoot 'NativeRegistration.ps1')
try {
    if (!$ExtensionDirectory) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = [Windows.Forms.FolderBrowserDialog]::new()
        $dialog.Description = 'Choose the LMG extension folder selected in Chrome > Load unpacked (contains manifest.json).'
        $dialog.ShowNewFolderButton = $false
        try {
            if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { exit 0 }
            $ExtensionDirectory = $dialog.SelectedPath
        } finally { $dialog.Dispose() }
    }
    $root = Get-LMGRoot $ExtensionDirectory
    $id = Get-LMGFolderId $root
    $taskName = 'LMG Auto Update ' + $id
    $state = Join-Path $env:LOCALAPPDATA ('LongMapgine\updater\' + $id)
    if ($DescribeOnly) {
        [pscustomobject]@{ Folder=$root; TaskName=$taskName; Helper=$state; Mode='Manual'; IntervalHours=0; RunLevel='Limited'; WindowStyle='Hidden' } | ConvertTo-Json
        exit 0
    }
    if ($Uninstall) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
        Unregister-LMGNative $state $id
        Write-LMGJson (Join-Path $root 'lmg-update-status.json') @{ state='not-installed'; message='Windows updater was uninstalled.' }
        Write-Host 'LMG updater removed. Extension files, OAuth and backups are unchanged.'
        exit 0
    }
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    Assert-LMGNoLinks $state
    foreach ($file in @('Core.ps1','Update-LMG.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $state $file) -Force }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $state 'Update-LMG.ps1') + '" -ExtensionDirectory "' + $root + '"'
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
    # Keep the task identity used by native messaging, but replace every old timer trigger.
    $settings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Settings $settings -Principal $principal -Description ('Manually update LMG in ' + $root + ' only when requested from LMG; no automatic schedule.') -Force | Out-Null
    $nativeHost = Register-LMGNative $state $root $id
    Write-LMGJson (Join-Path $root 'lmg-update-status.json') @{ state='installed'; mode='manual'; message='Manual updates only. No scheduled checks.'; task=$taskName; nativeHost=$nativeHost; time=[DateTime]::UtcNow.ToString('o') }
    Write-Host ('Installed: ' + $taskName)
    Write-Host ('Selected extension folder: ' + $root)
    Write-Host 'No scheduled checks. Use Check version or Update now in LMG settings. Keep Chrome Developer mode enabled.'
    if ([Environment]::UserInteractive -and !$NoDialog) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show('LMG manual updater installed. No scheduled checks. Use Update now in LMG settings. Folder: ' + $root, 'LMG', 'OK', 'Information') | Out-Null
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
