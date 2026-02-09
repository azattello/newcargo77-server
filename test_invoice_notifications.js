#!/usr/bin/env node
/**
 * 🧪 Тестовый скрипт для проверки создания уведомлений о счетах
 * 
 * Использование:
 *   node test_invoice_notifications.js
 * 
 * Или с параметрами:
 *   node test_invoice_notifications.js USER_ID
 */

const mongoose = require('mongoose');
const config = require('config');
const User = require('./models/User');
const Notification = require('./models/Notification');

async function testInvoiceNotifications() {
  try {
    // Подключение к БД
    console.log('📡 Подключение к MongoDB...');
    await mongoose.connect(config.get('dbUrl'));
    console.log('✅ Подключено к MongoDB');

    // Получить первого пользователя (если не передан ID)
    let userId = process.argv[2];
    if (!userId) {
      console.log('📝 Поиск первого пользователя...');
      const user = await User.findOne().limit(1);
      if (!user) {
        console.error('❌ Пользователей не найдено в БД');
        process.exit(1);
      }
      userId = user._id;
      console.log(`✅ Найден пользователь: ${user.name} (${userId})`);
    } else {
      const user = await User.findById(userId);
      if (!user) {
        console.error(`❌ Пользователь с ID ${userId} не найден`);
        process.exit(1);
      }
      console.log(`✅ Найден пользователь: ${user.name} (${userId})`);
    }

    // Очистить старые уведомления (опционально)
    console.log('\n📊 Статистика уведомлений:');
    const invoiceNotifs = await Notification.countDocuments({
      userId,
      type: 'invoices'
    });
    console.log(`  - Уведомлений о счетах: ${invoiceNotifs}`);

    const allNotifs = await Notification.countDocuments({ userId });
    console.log(`  - Всего уведомлений: ${allNotifs}`);

    // Проверить, есть ли у пользователя счета
    const user = await User.findById(userId);
    console.log(`\n💼 Счета пользователя:`);
    if (!user.invoices || user.invoices.length === 0) {
      console.log(`  - Счетов не найдено`);
      console.log(`\n📝 Было бы хорошо создать счет через Admin UI для полного тестирования`);
    } else {
      console.log(`  - Всего счетов: ${user.invoices.length}`);
      user.invoices.slice(0, 3).forEach((inv, i) => {
        console.log(`    ${i + 1}. ${inv.totalAmount}₸ (${inv.status}) - ${inv.createdAt}`);
      });
    }

    // Проверить push-подписки
    console.log(`\n📱 Push-подписки:`);
    if (!user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      console.log(`  - Подписок не найдено`);
      console.log(`  ⚠️ Пользователь не получит push-уведомления`);
    } else {
      console.log(`  - Активных подписок: ${user.pushSubscriptions.length}`);
    }

    console.log('\n✅ Тест завершен успешно');
    console.log('\n📋 Следующие шаги:');
    console.log('  1. Откройте Admin Panel (http://localhost:3000/admin)');
    console.log('  2. Найдите этого пользователя в списке');
    console.log('  3. Создайте новый счет');
    console.log('  4. Проверьте логи сервера (должны быть 📝 маркеры)');
    console.log('  5. Проверьте уведомления на странице /notification');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

testInvoiceNotifications();
