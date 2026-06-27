@echo off
rem ASCII-only on purpose: non-ASCII bytes here break cmd.exe batch parsing.
cd /d "%~dp0"
rem Default account db lives next to this file; override with --account-db on the command line.
where py >nul 2>nul && (py serve.py --account-db "%~dp0accounts.sqlite" & goto :eof)
where python >nul 2>nul && (python serve.py --account-db "%~dp0accounts.sqlite" & goto :eof)
echo.
echo Python 3 was not found on PATH.
echo Install Python 3 from https://www.python.org and run start.bat again.
echo During install, check "Add Python to PATH".
echo.
pause
