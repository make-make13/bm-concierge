$ErrorActionPreference = "Continue"

Write-Host "--- GIT STATUS ---"
git status --short
git diff --stat

Copy-Item ".env.example" ".env" -Force

Write-Host "`nStarting dev server..."
$serverProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -PassThru -NoNewWindow -RedirectStandardOutput "server_out.log" -RedirectStandardError "server_err.log"

Start-Sleep -Seconds 5

Write-Host "`n--- HEALTH CHECK ---"
curl.exe -s http://localhost:3010/health
Write-Host ""

Write-Host "`n--- DEV PAGE ---"
$devHtml = curl.exe -s http://localhost:3010/dev/
if ($devHtml -match "BM Concierge Dev UI") { Write-Host "Dev UI is accessible." } else { Write-Host "Dev UI failed." }

Write-Host "`n--- SAVE DEV CONFIG ---"
curl.exe -s -X POST http://localhost:3010/api/dev/config -H "Content-Type: application/json" -d "@config.json"
Write-Host ""

Write-Host "`n--- CHECK DEV CONFIG STATUS ---"
curl.exe -s http://localhost:3010/api/dev/config/status
Write-Host ""

Write-Host "`n--- SUPABASE TEST ---"
curl.exe -s -X POST http://localhost:3010/api/dev/supabase/test
Write-Host ""

Write-Host "`n--- KNOWLEDGE STATUS ---"
curl.exe -s http://localhost:3010/api/dev/knowledge/status
Write-Host ""

Write-Host "`n--- STOPPING SERVER ---"
Stop-Process -Id $serverProc.Id -Force
Write-Host ""

Write-Host "--- TEST PROD SERVER (WITH UI DISABLED) ---"
(Get-Content .env) -replace "DEV_UI_ENABLED=true", "DEV_UI_ENABLED=false" | Set-Content .env
$serverProc2 = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -PassThru -NoNewWindow -RedirectStandardOutput "server2_out.log" -RedirectStandardError "server2_err.log"
Start-Sleep -Seconds 5

Write-Host "`n--- CHECK DEV API (EXPECTED 404) ---"
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3010/api/dev/config/status
Write-Host ""

Write-Host "`n--- STOPPING SERVER 2 ---"
Stop-Process -Id $serverProc2.Id -Force
