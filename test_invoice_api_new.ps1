# Test API
$serverUrl = "http://localhost:3001"
$userId = "662a2dabd4e71e4ab5b69352"

Write-Host "Testing invoice creation..." -ForegroundColor Cyan

# Create invoice
$invoiceData = @{
    itemCount = 5
    totalWeight = 2.5
    totalAmount = 1500
    date = (Get-Date -Format O)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$serverUrl/api/user/$userId/invoice" `
        -Method Post `
        -ContentType "application/json" `
        -Body $invoiceData
    
    $newInvoiceId = $response.invoice._id
    Write-Host "Invoice created! ID: $newInvoiceId" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Update status
Write-Host "Updating invoice status..." -ForegroundColor Yellow
$updateData = @{ status = "paid" } | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$serverUrl/api/user/$userId/invoice/$newInvoiceId" `
        -Method Put `
        -ContentType "application/json" `
        -Body $updateData
    
    Write-Host "Invoice updated to paid status" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "Test completed successfully!" -ForegroundColor Green
