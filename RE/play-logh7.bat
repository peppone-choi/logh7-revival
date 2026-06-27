@echo off
REM ============================================================
REM  LOGH VII 유저 런처 (더블클릭 가능) — 클라이언트 전용
REM  서버는 켜지 않는다. 운영자가 start-server.bat 으로 먼저 서버를
REM  띄워야 한다. 이 런처는 47900 접속 확인 후 canonical playable
REM  클라만 실행(자동 47900 리다이렉트).
REM  단일 표준 = tools\logh7_launch_config.py (test == 정식 플레이).
REM ============================================================
setlocal
REM .bat 위치 기준으로 저장소 루트 이동(경로 견고성).
cd /d "%~dp0"

REM python 우선, 없으면 py 런처 사용.
where python >nul 2>nul
if %errorlevel%==0 (
  set "PY=python"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PY=py -3"
  ) else (
    echo [오류] python 을 찾을 수 없습니다. Python 3 를 설치하거나 PATH 에 추가하세요.
    pause
    exit /b 1
  )
)

%PY% play_logh7.py
if %errorlevel% neq 0 (
  echo.
  echo [오류] 런처 실행 실패. 위 메시지를 확인하세요.
  pause
  exit /b %errorlevel%
)

echo.
echo 클라 창에서 직접 로그인하세요. 이 창은 닫아도 됩니다.
pause
endlocal
