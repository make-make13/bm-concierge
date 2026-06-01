$ErrorActionPreference = "Stop"

$headers = @{
    "Content-Type" = "application/json"
}

$body1 = @{
    channel = "test"
    guest_name = "Тестер"
    guest_contact = "@tester"
} | ConvertTo-Json

$response1 = Invoke-RestMethod -Uri "http://localhost:3010/api/console/conversations" -Method Post -Headers $headers -Body $body1
Write-Host "Conversation Created: $($response1.id)"

$body2 = @{
    message = "Можно ли с собакой?"
} | ConvertTo-Json

$response2 = Invoke-RestMethod -Uri "http://localhost:3010/api/console/conversations/$($response1.id)/messages" -Method Post -Headers $headers -Body $body2
Write-Host "Message 1 (No Lead):"
$response2 | ConvertTo-Json

$body3 = @{
    message = "Хотим номер на двоих с видом на море с 15 по 18 июля"
} | ConvertTo-Json

$response3 = Invoke-RestMethod -Uri "http://localhost:3010/api/console/conversations/$($response1.id)/messages" -Method Post -Headers $headers -Body $body3
Write-Host "Message 2 (Lead):"
$response3 | ConvertTo-Json
