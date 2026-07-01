param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Client = Join-Path $Root 'exe\G7MTClient.exe'
$Launcher = Join-Path $Root 'G7Start.exe'
$StringFile = Join-Path $Root 'exe\String.txt'
$StringBackup = Join-Path $Root 'exe\String.txt.original'

if ((Test-Path -LiteralPath $StringFile) -and -not (Test-Path -LiteralPath $StringBackup)) {
  Copy-Item -LiteralPath $StringFile -Destination $StringBackup -Force
}

$GameName = (-join ([char[]](0x9280, 0x6CB3, 0x82F1, 0x96C4, 0x4F1D, 0x8AAC))) + 'VII'
$InstallKey = Join-Path 'HKCU:\Software\BOTHTEC' (Join-Path $GameName '1.0')
New-Item -Path $InstallKey -Force | Out-Null
New-ItemProperty -Path $InstallKey -Name 'Install' -Value $Root -PropertyType String -Force | Out-Null

$LayersKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
New-Item -Path $LayersKey -Force | Out-Null
$CompatFlags = '~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE'
New-ItemProperty -Path $LayersKey -Name $Client -Value $CompatFlags -PropertyType String -Force | Out-Null
New-ItemProperty -Path $LayersKey -Name $Launcher -Value $CompatFlags -PropertyType String -Force | Out-Null

Add-Type -Namespace Logh7Win -Name ProfileApi -MemberDefinition '[DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool WriteProfileString(string section, string key, string value);'
[Logh7Win.ProfileApi]::WriteProfileString('windows', 'hangeulmenu', 'hangeul') | Out-Null
[Logh7Win.ProfileApi]::WriteProfileString('windows', 'kanjimenu', 'roman') | Out-Null

if (-not $Quiet) {
  Write-Host 'LOGH VII local Windows settings are ready.'
  Write-Host 'Run .\LOGH7Launcher.exe --client-preflight to check Windows Application Control before starting the server.'
  Write-Host 'Run .\diagnose-appcontrol.ps1 to collect SHA/signature/CodeIntegrity evidence.'
  Write-Host 'Run .\launch-client.ps1 to start the game client from the correct working directory.'
  Write-Host 'If Japanese text is garbled, run under Japanese system locale or Locale Emulator.'
}
