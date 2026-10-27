function Get-LMGNativeName([string]$Id) { return 'com.longmapgine.updater.f' + $Id }
function Register-LMGNative([string]$State, [string]$Root, [string]$Id) {
    $name = Get-LMGNativeName $Id
    foreach ($file in @('NativeHost.cmd','NativeHost.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $State $file) -Force }
    Write-LMGJson (Join-Path $State 'native-config.json') @{ root=$Root }
    $manifestPath = Join-Path $State 'native-host.json'
    Write-LMGJson $manifestPath @{ name=$name; description='LMG Windows updater'; path=(Join-Path $State 'NativeHost.cmd'); type='stdio'; allowed_origins=@('chrome-extension://okoelmnpaigkpbnooodiafamdbikbian/') }
    foreach ($browser in @('Google\Chrome','Chromium')) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\' + $browser + '\NativeMessagingHosts\' + $name)
        try { $key.SetValue('', $manifestPath, [Microsoft.Win32.RegistryValueKind]::String) } finally { $key.Dispose() }
    }
    return $name
}
function Unregister-LMGNative([string]$State, [string]$Id) {
    $name = Get-LMGNativeName $Id
    foreach ($browser in @('Google\Chrome','Chromium')) {
        $parent = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\' + $browser + '\NativeMessagingHosts', $true)
        if (!$parent) { continue }
        try {
            $key = $parent.OpenSubKey($name)
            if (!$key) { continue }
            try { $ours = $key.GetValue('') -eq (Join-Path $State 'native-host.json') } finally { $key.Dispose() }
            if ($ours) { $parent.DeleteSubKey($name, $false) }
        } finally { $parent.Dispose() }
    }
}
