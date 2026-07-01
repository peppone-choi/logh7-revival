param([int]$LastMinutes = 15)
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Client = Join-Path $Root 'exe\G7MTClient.exe'
$Launcher = Join-Path $Root 'LOGH7Launcher.exe'
$Log = Join-Path $Root 'logh7-runtime\logs\launcher.log'

Write-Host 'LOGH VII Windows Application Control diagnostic'
Write-Host ('Root: ' + $Root)

if (Test-Path -LiteralPath $Client) {
  $Hash = Get-FileHash -Algorithm SHA256 -LiteralPath $Client
  Write-Host ('Client SHA256: ' + $Hash.Hash)
  $Sig = Get-AuthenticodeSignature -LiteralPath $Client
  Write-Host ('Client signature status: ' + $Sig.Status)
  $Zone = Get-Item -LiteralPath $Client -Stream Zone.Identifier -ErrorAction SilentlyContinue
  if ($Zone) { Write-Host 'Client Zone.Identifier stream: present' } else { Write-Host 'Client Zone.Identifier stream: absent' }
} else {
  Write-Host ('Client missing: ' + $Client)
}

if (Test-Path -LiteralPath $Launcher) {
  $LauncherHash = Get-FileHash -Algorithm SHA256 -LiteralPath $Launcher
  Write-Host ('Launcher SHA256: ' + $LauncherHash.Hash)
  Write-Host 'Running LOGH7Launcher.exe --client-preflight ...'
  $Process = Start-Process -FilePath $Launcher -ArgumentList @('--client-preflight') -WorkingDirectory $Root -Wait -PassThru -WindowStyle Hidden
  Write-Host ('Preflight exit code: ' + $Process.ExitCode)
} else {
  Write-Host ('Launcher missing: ' + $Launcher)
}

Write-Host ''
Write-Host ('Recent CodeIntegrity events from the last ' + $LastMinutes + ' minute(s):')
try {
  $Events = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-CodeIntegrity/Operational'; StartTime=(Get-Date).AddMinutes(-$LastMinutes)} -ErrorAction Stop
  $Filtered = $Events | Where-Object { $_.Message -like '*G7MTClient.exe*' -or $_.Message -like '*LOGH7Launcher.exe*' } | Select-Object -First 12
  if ($Filtered) {
    $Filtered | Select-Object TimeCreated, Id, Message | Format-List
  } else {
    Write-Host 'No matching G7MTClient.exe/LOGH7Launcher.exe CodeIntegrity events found in the time window.'
  }
} catch {
  Write-Host ('Could not read CodeIntegrity Operational log: ' + $_.Exception.Message)
}

if (Test-Path -LiteralPath $Log) {
  Write-Host ''
  Write-Host ('Launcher log tail: ' + $Log)
  Get-Content -LiteralPath $Log -Tail 20
}
