@echo off
REM ============================================================
REM  LOGH VII 인증 서버 — 운영자/호스트 전용 (유저용 아님)
REM  유저는 서버를 켜지 않는다. 호스트가 이 .bat 를 실행해
REM  Node 인증 서버만(클라 없이) 47900 에 띄워 계속 살려둔다.
REM  단일 표준 = tools\logh7_launch_config.py (포트/표준 ENV).
REM  종료: 이 창에서 Ctrl+C.
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

%PY% start_server.py
echo.
echo 서버가 종료되었습니다.
pause
endlocal
