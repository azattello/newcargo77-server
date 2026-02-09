const mongoose = require('mongoose');
const config = require('config');
const User = require('./models/User');

async function checkPhoneTypes() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        const users = await User.find({});
        
        // Соберем статистику по типам
        const typeStats = {};
        const examples = {};
        
        for (const user of users) {
            const phone = user.phone;
            const type = typeof phone;
            
            if (!typeStats[type]) {
                typeStats[type] = 0;
                examples[type] = [];
            }
            typeStats[type]++;
            
            // Сохраняем примеры (не более 3 для каждого типа)
            if (examples[type].length < 3) {
                examples[type].push({
                    userId: user._id,
                    phone: phone,
                    stringified: String(phone),
                    normalized: String(phone).replace(/\D/g, '')
                });
            }
        }
        
        console.log('📊 Типы данных для поля phone:\n');
        for (const [type, count] of Object.entries(typeStats)) {
            console.log(`${type}: ${count} пользователей (${((count / users.length) * 100).toFixed(1)}%)`);
            console.log('Примеры:');
            examples[type].forEach(ex => {
                console.log(`  - Исходное: ${ex.phone} → Строка: "${ex.stringified}" → Нормализовано: "${ex.normalized}"`);
            });
            console.log('');
        }
        
        console.log(`Всего пользователей: ${users.length}`);
        
        await mongoose.connection.close();
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

checkPhoneTypes();
