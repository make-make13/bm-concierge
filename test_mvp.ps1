$ErrorActionPreference = "Continue"

Write-Host "Starting dev server..."
$serverProc = Start-Process -FilePath "npm" -ArgumentList "run dev" -PassThru -NoNewWindow -RedirectStandardOutput "server_out.log" -RedirectStandardError "server_err.log"

Write-Host "Waiting 5 seconds for server to boot..."
Start-Sleep -Seconds 5

Write-Host "--- HEALTH CHECK ---"
curl.exe -s http://localhost:3010/health
Write-Host ""

Write-Host "--- QUESTION TEST ---"
curl.exe -s -X POST http://localhost:3010/api/chat/test -H "Content-Type: application/json" -d "@q1.json"
Write-Host ""

Write-Host "--- BOOKING TEST ---"
curl.exe -s -X POST http://localhost:3010/api/chat/test -H "Content-Type: application/json" -d "@q2.json"
Write-Host ""

Write-Host "--- STOPPING SERVER ---"
Stop-Process -Id $serverProc.Id -Force
Write-Host ""

Write-Host "--- SERVER STDOUT ---"
Get-Content "server_out.log" -Raw
Write-Host "--- SERVER STDERR ---"
Get-Content "server_err.log" -Raw
Write-Host ""

Write-Host "--- GIT STATUS ---"
git status --short
git diff --stat
