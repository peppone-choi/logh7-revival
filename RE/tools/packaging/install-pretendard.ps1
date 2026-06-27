# LOGH VII 배포물용 Pretendard 폰트 설치 (per-user, 관리자 불필요).
#
# 왜 필요한가: 클라(G7MTClient)는 모든 텍스트를 단일 전역 GDI face로 그리고(face명 패치 @0x77402c =
# "Pretendard", tools/client_patches/font-face.json), CreateFontA + HANGEUL_CHARSET로 그 face를
# 시스템에서 조회한다. 클라는 AddFontResourceEx로 앱-로컬 폰트를 등록하지 않으므로, Pretendard가
# 시스템(또는 사용자) 폰트로 설치돼 있어야 한다. 미설치 시 GDI가 시스템 기본 한글폰트로 폴백한다.
#
# 이 스크립트는 Win10 1809+ 의 per-user 폰트 설치(관리자 권한 불필요)를 한다:
#   - TTF를 %LOCALAPPDATA%\Microsoft\Windows\Fonts 로 복사
#   - HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts 에 등록
# 멱등: 이미 설치돼 있으면 덮어쓰지 않고 레지스트리 등록과 현재 GDI 세션 로딩만 보강한다.
#
# 사용: 배포물 루트에서  powershell -ExecutionPolicy Bypass -File tools\packaging\install-pretendard.ps1
# 폰트 파일 위치: 배포물의 fonts\ 디렉터리(빌드시 OFL 릴리스에서 취득해 동봉). 자세한 건 docs/logh7-font-localization.md.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# 배포물 루트 기준 fonts\ 후보 경로(스크립트가 tools\packaging\ 또는 루트 어디에 있든 동작).
$candidates = @(
    (Join-Path $scriptDir '..\..\fonts'),
    (Join-Path $scriptDir '..\fonts'),
    (Join-Path $scriptDir 'fonts'),
    (Join-Path (Get-Location) 'fonts')
)
$fontsDir = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $fontsDir) {
    Write-Error "fonts\ 디렉터리를 찾을 수 없습니다. Pretendard TTF를 배포물 fonts\에 넣으세요(docs/logh7-font-localization.md 참조)."
    exit 1
}

$userFontDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
$regKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
if (-not (Test-Path $userFontDir)) { New-Item -ItemType Directory -Path $userFontDir -Force | Out-Null }
if (-not (Test-Path $regKey)) { New-Item -Path $regKey -Force | Out-Null }

$fonts = Get-ChildItem -Path $fontsDir -Include '*.ttf','*.otf' -File -Recurse -ErrorAction SilentlyContinue
if (-not $fonts) {
    Write-Error "fonts\ 에 .ttf/.otf가 없습니다($fontsDir). Pretendard, Pretendard JP, Pretendard Std를 동봉하세요."
    exit 1
}

$fontApiSource = @"
using System;
using System.Runtime.InteropServices;

public static class Logh7FontApi {
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int AddFontResourceEx(string lpszFilename, uint fl, IntPtr pdv);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
"@
if (-not ("Logh7FontApi" -as [type])) {
    Add-Type -TypeDefinition $fontApiSource
}

function Get-FontRegistryName([string]$baseName) {
    $name = ($baseName -replace '-', ' ')
    $name = ($name -replace 'PretendardJP', 'Pretendard JP')
    $name = ($name -replace 'PretendardStd', 'Pretendard Std')
    $name = ($name -replace 'Variable$', ' Variable')
    return $name
}

$copied = 0
$registered = 0
$loaded = 0
foreach ($font in $fonts) {
    $dest = Join-Path $userFontDir $font.Name
    $kind = if ($font.Extension -ieq '.otf') { 'OpenType' } else { 'TrueType' }
    $familyName = Get-FontRegistryName $font.BaseName
    $displayName = "$familyName ($kind)"
    if (Test-Path $dest) {
        Write-Host "이미 설치됨: $($font.Name)"
    } else {
        Copy-Item -Path $font.FullName -Destination $dest -Force
        Write-Host "복사: $($font.Name)"
        $copied++
    }
    New-ItemProperty -Path $regKey -Name $displayName -Value $dest -PropertyType String -Force | Out-Null
    Write-Host "등록: $displayName"
    $registered++
    $added = [Logh7FontApi]::AddFontResourceEx($dest, 0, [IntPtr]::Zero)
    if ($added -gt 0) {
        Write-Host "세션 로드: $($font.Name)"
        $loaded += $added
    }
}

$fontChangeResult = [UIntPtr]::Zero
[void][Logh7FontApi]::SendMessageTimeout([IntPtr]65535, 0x001D, [UIntPtr]::Zero, "", 0x0002, 5000, [ref]$fontChangeResult)

Write-Host "완료. 신규 복사 ${copied}개, 레지스트리 등록/갱신 ${registered}개, 현재 세션 로드 ${loaded}개."
Write-Host "폰트 변경 알림을 보냈습니다. 실행기가 곧바로 게임을 시작해도 Pretendard를 조회할 수 있어야 합니다."
