const mongoose = require('mongoose');
const config = require('config');

async function checkRawPhoneData() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        // Коннектимся прямо к MongoDB (минуя Mongoose)
        const db = mongoose.connection.db;
        const users = db.collection('users');
        
        console.log('🔍 Первые 5 документов из БД (raw):\n');
        const docs = await users.find({}).limit(5).toArray();
        
        docs.forEach((doc, i) => {
            console.log(`${i+1}. ID: ${doc._id}`);
            console.log(`   Name: ${doc.name} ${doc.surname}`);
            console.log(`   Phone: "${doc.phone}"`);
            console.log(`   Phone тип: ${typeof doc.phone}`);
            if (typeof doc.phone === 'string') {
                console.log(`   Phone JSON: ${JSON.stringify(doc.phone)}`);
            }
            console.log('');
        });
        
        // Поиск по  конкретному номеру в raw
        console.log('Поиск "87478649337" в raw БД:\n');
        const found = await users.findOne({phone: '87478649337'});
        if (found) {
            console.log('✓ Найден!');
            console.log(`  Name: ${found.name}`);
        } else {
            console.log('✗ Не найден');
        }
        
        // Все документы с номером как string начиная с 874
        console.log('\nПоиск всех документов где phone начинается с 874:\n');
        const regex_found = await users.find({phone: {$regex: '^874'}}).toArray();
        console.log(`Найдено: ${regex_found.length}`);
        regex_found.slice(0,3).forEach(doc => {
            console.log(`  - ${doc.phone}: ${doc.name}`);
        });
        
        await mongoose.connection.close();
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

checkRawPhoneData();
