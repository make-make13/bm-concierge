$ErrorActionPreference = "Continue"

Write-Host "`n--- HEALTH CHECK ---"
curl.exe -s http://localhost:3010/health

Write-Host "`n--- QUESTION TEST ---"
curl.exe -s -X POST http://localhost:3010/api/chat/test -H "Content-Type: application/json" -d "@q1.json"

Write-Host "`n--- BOOKING TEST ---"
curl.exe -s -X POST http://localhost:3010/api/chat/test -H "Content-Type: application/json" -d "@q2.json"
