const mongoose = require('mongoose');
const config = require('config');
const Status = require('./models/Status');

async function checkStatuses() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        const statuses = await Status.find({}).sort({statusNumber: 1});
        
        console.log('📊 Текущие статусы (отсортировано):\n');
        statuses.forEach(s => {
            console.log(`${s.statusNumber}. ${s.statusText} (ID: ${s._id})`);
        });
        
        console.log('\n💡 Рекомендуемый порядок:');
        console.log('1. Принято (Created)');
        console.log('2. В пути (In Transit)');
        console.log('3. Готов к выдаче (Ready for Delivery)');
        console.log('4. Получено (Received/Delivered)');
        
        await mongoose.connection.close();
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

checkStatuses();
