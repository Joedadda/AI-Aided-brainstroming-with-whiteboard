@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\.bin\concurrently.cmd" (
    call npm ci
    if errorlevel 1 goto failed
)

set "DATABASE_PATH=./data/funnel-user-test.db"
set "WEB_PORT=5197"
set "API_PORT=8897"
set "COLLAB_PORT=8898"
set "PATH=%~dp0node_modules\.bin;%PATH%"
set "MOCK_AI=0"
if /i "%~1"=="mock" set "MOCK_AI=1"
if not "%~2"=="" set "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=%~2"

echo Open http://127.0.0.1:5197 after Vite starts.
echo Test boards are saved in data\funnel-user-test.db.
if "%MOCK_AI%"=="1" echo AI mode: free sample replies.
if "%MOCK_AI%"=="0" echo AI mode: live Sarvam if a key is configured.
if /i "%~1"=="share" goto share
call "node_modules\.bin\concurrently.cmd" -k -n web,api "vite --host 127.0.0.1" "tsx watch --ignore ./data/** server/index.ts"
if errorlevel 1 goto failed
exit /b 0

:share
set "PATH=%ProgramFiles%\Tailscale;%PATH%"
where tailscale.exe >nul 2>&1
if errorlevel 1 (
    echo Install Tailscale for Windows and sign in before sharing.
    goto failed
)

for /f "delims=" %%H in ('powershell -NoProfile -Command "$status = ConvertFrom-Json -InputObject ((tailscale.exe status --json) -join [Environment]::NewLine); if ($status.BackendState -eq 'Running' -and $status.Self.DNSName) { $status.Self.DNSName.TrimEnd('.') }"') do set "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=%%H"
if not defined __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS (
    echo Open Tailscale and connect before sharing.
    goto failed
)

echo Open the HTTPS link after the Vite ready and API on messages appear.
echo Keep this window open while testing. Press Ctrl+C to stop sharing.
call "node_modules\.bin\concurrently.cmd" -k -n web,api,funnel "vite --host 127.0.0.1" "tsx watch --ignore ./data/** server/index.ts" "tailscale.exe funnel 5197"
if errorlevel 1 goto failed
exit /b 0

:failed
echo The test server stopped. Check the messages above.
pause
exit /b 1
