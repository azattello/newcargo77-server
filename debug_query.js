const mongoose = require('mongoose');
const config = require('config');
const User = require('./models/User');

async function debugQuery() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        // Достаем первого пользователя
        const user = await User.findOne({});
        console.log('Первый пользователь:');
        console.log(`  ID: ${user._id}`);
        console.log(`  Phone: "${user.phone}"`);
        console.log(`  Phone JSON: ${JSON.stringify(user.phone)}`);
        console.log(`  Phone тип: ${typeof user.phone}`);
        console.log(`  Phone длина: ${user.phone.length}`);
        console.log(`  Phone charCodes: ${[...user.phone].map(c => c.charCodeAt(0)).join(',')}`);
        console.log(`  Name: ${user.name}`);
        console.log(`  Password первые 20 символов: ${user.password.substring(0, 20)}`);
        
        // Попробуем найти по phone напрямую
        console.log('\nПопытка поиска:');
        const found = await User.findOne({phone: user.phone});
        if (found) {
            console.log('✓ Найден по phone=' + user.phone);
        } else {
            console.log('✗ Не найден по phone=' + user.phone);
        }
        
        // Проверяем collection
        console.log('\nИнформация о collection:');
        const count = await User.countDocuments({});
        console.log(`  Всего документов: ${count}`);
        
        // Проверяем с использованием raw query
        console.log('\nRaw MongoDB запрос:');
        const rawResult = await User.collection.findOne({phone: user.phone});
        if (rawResult) {
            console.log('✓ Raw query вернул результат');
            console.log(`  Phone в raw: "${rawResult.phone}"`);
        } else {
            console.log('✗ Raw query вернул null');
        }
        
        await mongoose.connection.close();
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

debugQuery();
