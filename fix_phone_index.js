const mongoose = require('mongoose');
const config = require('config');
const User = require('./models/User');

async function fixPhoneIndex() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        // Удаляем старый индекс
        console.log('🔧 Удаляем старый индекс на phone...');
        try {
            await User.collection.dropIndex('phone_1');
            console.log('✓ Индекс удален');
        } catch (e) {
            console.log('ℹ Индекс не найден или уже удален');
        }
        
        // Пересоздаем индекс
        console.log('\n🔧 Пересоздаем индекс...');
        await User.collection.createIndex({phone: 1}, {unique: true, sparse: true});
        console.log('✓ Новый индекс создан');
        
        // Тестируем поиск
        console.log('\n🔍 Тестируем поиск...');
        const user = await User.findOne({phone: '87478649337'});
        if (user) {
            console.log(`✓ Найден: ${user.name} ${user.surname}`);
        } else {
            console.log('✗ Не найден');
        }
        
        await mongoose.connection.close();
        console.log('\n✓ Готово');
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

fixPhoneIndex();
