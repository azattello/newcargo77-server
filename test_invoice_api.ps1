#!/usr/bin/env powershell
<#
  🧪 Тестовый скрипт для создания счета через API
  
  Использование:
    .\test_invoice_api.ps1
#>

# Параметры
$serverUrl = "http://localhost:3001"
$userId = "662a2dabd4e71e4ab5b69352"  # Azat из БД

Write-Host "🧪 Тест API создания счета с уведомлениями`n" -ForegroundColor Cyan

# 1. Создание счета
Write-Host "📝 Шаг 1: Создание счета..." -ForegroundColor Yellow
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
    Write-Host "✅ Счет создан!" -ForegroundColor Green
    Write-Host "   ID: $newInvoiceId`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка при создании счета:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# 2. Проверка логов сервера
Write-Host "📊 Шаг 2: Проверка логов сервера..." -ForegroundColor Yellow
Write-Host "   Вы должны увидеть в логах сервера:" -ForegroundColor Gray
Write-Host "   📝 Создание уведомления о новом счете для пользователя..." -ForegroundColor Gray
Write-Host "   ✅ Уведомление сохранено: [ID]" -ForegroundColor Gray
Write-Host "   📤 Отправка push пользователю..." -ForegroundColor Gray
Write-Host ""

# 3. Обновление статуса счета
Write-Host "📝 Шаг 3: Обновление статуса счета на 'paid'..." -ForegroundColor Yellow
$updateData = @{
    status = "paid"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$serverUrl/api/user/$userId/invoice/$newInvoiceId" `
        -Method Put `
        -ContentType "application/json" `
        -Body $updateData
    
    Write-Host "✅ Счет обновлен!" -ForegroundColor Green
    Write-Host "   Новый статус: paid`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка при обновлении счета:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "✅ Тест завершен!`n" -ForegroundColor Green
Write-Host "Проверьте:" -ForegroundColor Cyan
Write-Host "  1. Логи сервера на наличие уведомлений" -ForegroundColor Gray
Write-Host "  2. Страницу http://localhost:3000/notification (таб 'Счета')" -ForegroundColor Gray
Write-Host ("  3. MongoDB: db.notifications.find({ userId: '" + $userId + "', type: 'invoices' })") -ForegroundColor Gray
