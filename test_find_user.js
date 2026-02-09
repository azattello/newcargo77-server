const mongoose = require('mongoose');
const config = require('config');
const User = require('./models/User');

async function findPhoneVariants() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        const normalizedPhone = '87478649337';
        const phoneAsNumber = parseInt(normalizedPhone);
        const phoneAsFloat = parseFloat(normalizedPhone);
        
        console.log('Ищем номер:', normalizedPhone);
        console.log('Варианты поиска:');
        console.log(`  - String: "${normalizedPhone}"`);
        console.log(`  - Number: ${phoneAsNumber}`);
        console.log(`  - Float: ${phoneAsFloat}\n`);
        
        // Попробуем все варианты
        const results = {
            string: await User.findOne({phone: normalizedPhone}),
            number: await User.findOne({phone: phoneAsNumber}),
            float: await User.findOne({phone: phoneAsFloat}),
            or: await User.findOne({$or: [{phone: normalizedPhone}, {phone: phoneAsNumber}, {phone: phoneAsFloat}]}),
        };
        
        console.log('📊 Результаты поиска:');
        for (const [key, user] of Object.entries(results)) {
            if (user) {
                console.log(`✓ ${key}: найден - ${user.name} ${user.surname} (тип: ${typeof user.phone})`);
            } else {
                console.log(`✗ ${key}: не найден`);
            }
        }
        
        // Покажем первого пользователя с похожим номером
        console.log('\n📋 Первые 5 пользователей в БД:');
        const users = await User.find({}).limit(5);
        users.forEach(u => {
            console.log(`  - ID: ${u._id}, Phone: ${u.phone} (тип: ${typeof u.phone}), Name: ${u.name}`);
        });
        
        // Поиск всех пользователей с номером начинающимся на 874
        console.log('\n🔍 Поиск пользователей с номером начиная на 874:');
        const likePhone = await User.find({phone: {$regex: '874'}});
        console.log(`Найдено: ${likePhone.length}`);
        likePhone.slice(0, 3).forEach(u => {
            console.log(`  - Phone: ${u.phone}, Name: ${u.name}`);
        });
        
        await mongoose.connection.close();
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

findPhoneVariants();
