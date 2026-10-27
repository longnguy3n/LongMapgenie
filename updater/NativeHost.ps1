param([string]$Origin)
. (Join-Path $PSScriptRoot 'Core.ps1')
# Chrome native messaging: one length-prefixed JSON request and response. Never log to stdout.
function Read-Exact($Stream, [int]$Length) {
    $buffer = New-Object byte[] $Length
    $offset = 0
    while ($offset -lt $Length) {
        $count = $Stream.Read($buffer, $offset, $Length - $offset)
        if ($count -eq 0) { throw 'Incomplete native message.' }
        $offset += $count
    }
    return ,$buffer
}
try {
    if ($Origin -cne 'chrome-extension://okoelmnpaigkpbnooodiafamdbikbian/') { throw 'Origin is not allowed.' }
    $inputStream = [Console]::OpenStandardInput()
    $length = [BitConverter]::ToUInt32((Read-Exact $inputStream 4), 0)
    if ($length -lt 2 -or $length -gt 4096) { throw 'Invalid native message size.' }
    $request = [Text.Encoding]::UTF8.GetString((Read-Exact $inputStream $length)) | ConvertFrom-Json
    if ($request.action -notin @('update','status')) { throw 'Unknown updater action.' }
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'native-config.json') -Raw | ConvertFrom-Json
    $root = Get-LMGRoot $config.root
    $taskName = 'LMG Auto Update ' + (Get-LMGFolderId $root)
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ($request.action -eq 'update') {
        $startedAt = [DateTime]::UtcNow.ToString('o')
        if ([string]$task.State -eq 'Running') { $startedAt = (Get-ScheduledTaskInfo -TaskName $taskName).LastRunTime.ToUniversalTime().ToString('o') }
        if ([string]$task.State -ne 'Running') { Start-ScheduledTask -TaskName $taskName -ErrorAction Stop }
        $result = @{ started=$true; startedAt=$startedAt }
    } else {
        $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
        $result = @{ running=([string]$task.State -in @('Running','Queued')); lastRunAt=$info.LastRunTime.ToUniversalTime().ToString('o'); exitCode=$info.LastTaskResult }
    }
} catch { $result = @{ error=$_.Exception.Message } }
$bytes = [Text.Encoding]::UTF8.GetBytes(($result | ConvertTo-Json -Depth 10 -Compress))
$outputStream = [Console]::OpenStandardOutput()
$outputStream.Write([BitConverter]::GetBytes([uint32]$bytes.Length), 0, 4)
$outputStream.Write($bytes, 0, $bytes.Length)
$outputStream.Flush()
