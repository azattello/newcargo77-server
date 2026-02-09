const mongoose = require('mongoose');
const config = require('config');
const User = require('./models/User');

// Функция нормализации номера (убирает все спецсимволы, оставляет только цифры)
function normalizePhone(phone) {
    return String(phone).replace(/\D/g, '');
}

async function migratePhones() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено');
        
        // Находим всех пользователей
        const users = await User.find({});
        console.log(`Найдено пользователей: ${users.length}`);
        
        let updated = 0;
        let errors = 0;
        
        for (const user of users) {
            try {
                // Текущий номер
                const currentPhone = user.phone;
                // Нормализуем (убираем все спецсимволы)
                const normalizedPhone = normalizePhone(currentPhone);
                
                // Если отличается от текущего, обновляем
                if (normalizedPhone !== String(currentPhone).replace(/\D/g, '')) {
                    user.phone = normalizedPhone;
                    await user.save();
                    updated++;
                    console.log(`✓ ${user._id}: "${currentPhone}" → "${normalizedPhone}"`);
                } else if (String(currentPhone) !== normalizedPhone) {
                    // Если номер содержал спецсимволы, но мы его ещё не обновляли
                    user.phone = normalizedPhone;
                    await user.save();
                    updated++;
                    console.log(`✓ ${user._id}: "${currentPhone}" → "${normalizedPhone}"`);
                }
            } catch (err) {
                errors++;
                console.error(`✗ Ошибка для пользователя ${user._id}:`, err.message);
            }
        }
        
        console.log(`\n📊 Результаты миграции:`);
        console.log(`   Обновлено: ${updated}`);
        console.log(`   Ошибок: ${errors}`);
        console.log(`   Всего: ${users.length}`);
        
        await mongoose.connection.close();
        console.log('✓ Подключение закрыто');
        
    } catch (error) {
        console.error('Критическая ошибка:', error.message);
        process.exit(1);
    }
}

migratePhones();
