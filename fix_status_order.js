const mongoose = require('mongoose');
const config = require('config');
const Status = require('./models/Status');

async function fixStatusOrder() {
    try {
        const dbUrl = config.get('dbUrl');
        await mongoose.connect(dbUrl);
        
        console.log('✓ Подключение к БД установлено\n');
        
        // Находим статусы
        const polucheno = await Status.findOne({statusText: 'Получено'});
        const gotov = await Status.findOne({statusText: 'Готов к выдаче'});
        
        if (!polucheno || !gotov) {
            console.log('❌ Не найдены статусы');
            console.log('Получено найден:', !!polucheno);
            console.log('Готов к выдаче найден:', !!gotov);
            return;
        }
        
        console.log('Текущие statusNumber:');
        console.log(`  Получено: ${polucheno.statusNumber}`);
        console.log(`  Готов к выдаче: ${gotov.statusNumber}\n`);
        
        // Обновляем - "Получено" должно быть после "Готов к выдаче"
        // Текущий porядок: 5 (Получено), 7 (Готов)
        // Нужно: Готов = 6, Получено = 7
        
        await Status.updateOne(
            {_id: gotov._id},
            {statusNumber: 6}
        );
        
        await Status.updateOne(
            {_id: polucheno._id},
            {statusNumber: 7}
        );
        
        console.log('✓ Порядок обновлен:');
        console.log('  Готов к выдаче: 6');
        console.log('  Получено: 7');
        
        // Показываем новый порядок
        const allStatuses = await Status.find({}).sort({statusNumber: 1});
        console.log('\n📊 Новый порядок статусов:\n');
        allStatuses.forEach(s => {
            console.log(`${s.statusNumber}. ${s.statusText}`);
        });
        
        await mongoose.connection.close();
        console.log('\n✓ Готово!');
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

fixStatusOrder();
