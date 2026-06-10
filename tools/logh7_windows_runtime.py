from __future__ import annotations

from pathlib import Path
from typing import Final

WINDOWS_RUNTIME_FILES: Final[tuple[str, ...]] = (
    "setup-local.ps1",
    "launch-client.ps1",
    "WINDOWS-COMPATIBILITY.txt",
)


def write_windows_runtime_files(destination: Path) -> list[dict[str, str]]:
    files = {
        "setup-local.ps1": _setup_local_script(),
        "launch-client.ps1": _launch_client_script(),
        "WINDOWS-COMPATIBILITY.txt": _compatibility_note(),
    }
    written: list[dict[str, str]] = []
    for name, content in files.items():
        (destination / name).write_text(content, encoding="utf-8", newline="\r\n")
        written.append({"path": name, "reason": "current Windows compatibility bootstrap"})
    return written


def _setup_local_script() -> str:
    return _lines(
        [
            "param([switch]$Quiet)",
            "$ErrorActionPreference = 'Stop'",
            "$Root = Split-Path -Parent $MyInvocation.MyCommand.Path",
            "$Client = Join-Path $Root 'exe\\G7MTClient.exe'",
            "$Launcher = Join-Path $Root 'G7Start.exe'",
            "$StringFile = Join-Path $Root 'exe\\String.txt'",
            "$StringBackup = Join-Path $Root 'exe\\String.txt.original'",
            "",
            "if ((Test-Path -LiteralPath $StringFile) -and -not (Test-Path -LiteralPath $StringBackup)) {",
            "  Copy-Item -LiteralPath $StringFile -Destination $StringBackup -Force",
            "}",
            "",
            "$GameName = (-join ([char[]](0x9280, 0x6CB3, 0x82F1, 0x96C4, 0x4F1D, 0x8AAC))) + 'VII'",
            "$InstallKey = Join-Path 'HKCU:\\Software\\BOTHTEC' (Join-Path $GameName '1.0')",
            "New-Item -Path $InstallKey -Force | Out-Null",
            "New-ItemProperty -Path $InstallKey -Name 'Install' -Value $Root -PropertyType String -Force | Out-Null",
            "",
            "$LayersKey = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'",
            "New-Item -Path $LayersKey -Force | Out-Null",
            "$CompatFlags = '~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE'",
            "New-ItemProperty -Path $LayersKey -Name $Client -Value $CompatFlags -PropertyType String -Force | Out-Null",
            "New-ItemProperty -Path $LayersKey -Name $Launcher -Value $CompatFlags -PropertyType String -Force | Out-Null",
            "",
            "if (-not $Quiet) {",
            "  Write-Host 'LOGH VII local Windows settings are ready.'",
            "  Write-Host 'Run .\\launch-client.ps1 to start the game client from the correct working directory.'",
            "  Write-Host 'If Japanese text is garbled, run under Japanese system locale or Locale Emulator.'",
            "}",
        ]
    )


def _launch_client_script() -> str:
    return _lines(
        [
            "$ErrorActionPreference = 'Stop'",
            "$Root = Split-Path -Parent $MyInvocation.MyCommand.Path",
            "& (Join-Path $Root 'setup-local.ps1') -Quiet",
            "",
            "$ExeDir = Join-Path $Root 'exe'",
            "$Client = Join-Path $ExeDir 'G7MTClient.exe'",
            "$StringFile = Join-Path $ExeDir 'String.txt'",
            "$StringBackup = Join-Path $ExeDir 'String.txt.original'",
            "",
            "if (Test-Path -LiteralPath $StringBackup) {",
            "  Copy-Item -LiteralPath $StringBackup -Destination $StringFile -Force",
            "}",
            "",
            "$Process = Start-Process -FilePath $Client -WorkingDirectory $ExeDir -PassThru -Wait",
            "",
            "if (Test-Path -LiteralPath $StringBackup) {",
            "  Copy-Item -LiteralPath $StringBackup -Destination $StringFile -Force",
            "}",
            "",
            "exit $Process.ExitCode",
        ]
    )


def _compatibility_note() -> str:
    return _lines(
        [
            "LOGH VII current Windows compatibility bootstrap",
            "",
            "Use launch-client.ps1 instead of double-clicking exe/G7MTClient.exe.",
            "",
            "What the bootstrap does:",
            "- runs the client from the exe directory, which is required for the login UI surface;",
            "- preserves exe/String.txt by creating and restoring String.txt.original;",
            "- writes the per-user BOTHTEC Install registry key used by the legacy launcher path;",
            "- sets conservative per-user AppCompatFlags for G7Start.exe and exe/G7MTClient.exe;",
            "- keeps the generated 127.0.0.1 login-server redirect from build-installed.",
            "",
            "If PowerShell blocks scripts, run:",
            "  powershell -ExecutionPolicy Bypass -File .\\setup-local.ps1",
            "  powershell -ExecutionPolicy Bypass -File .\\launch-client.ps1",
            "",
            "If Japanese UI text is garbled, use Japanese system locale for non-Unicode programs",
            "or run the client through Locale Emulator with Japanese/CP932 settings.",
        ]
    )


def _lines(lines: list[str]) -> str:
    return "\n".join(lines) + "\n"
