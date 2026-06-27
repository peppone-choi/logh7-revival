$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $Root 'LOGH7Launcher.exe'

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "LOGH7Launcher.exe is missing. Rebuild the installed tree or run python -m tools.logh7_build_player_launcher."
}

$Process = Start-Process -FilePath $Launcher -WorkingDirectory $Root -PassThru -Wait
exit $Process.ExitCode
