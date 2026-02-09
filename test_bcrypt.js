const bcrypt = require('bcryptjs');

// Пароль из твоей попытки
const password = 'testtest';

// Хеш из БД (PHP bcrypt $2y$)
const phpHash = '$2y$08$2CheFV51byOchwmLzTtFzOVSNLAAqK3//tkUaL4d8LoRI2gUpOB1W';

// Конвертируем $2y$ → $2b$
const jsHash = '$2b$' + phpHash.slice(4);

console.log('Пароль:', password);
console.log('PHP hash ($2y$):', phpHash);
console.log('JS hash ($2b$):', jsHash);
console.log('---');

// Тест 1: сравнение с PHP хешем (конвертированным)
try {
    const result1 = bcrypt.compareSync(password, jsHash);
    console.log('✓ Сравнение с $2b$ хешем:', result1 ? '✅ СОВПАДАЕТ' : '❌ не совпадает');
} catch (e) {
    console.log('✗ Ошибка с $2b$ хешем:', e.message);
}

// Тест 2: сравнение с оригинальным $2y$ (может не работать)
try {
    const result2 = bcrypt.compareSync(password, phpHash);
    console.log('✓ Сравнение с $2y$ хешем (оригинал):', result2 ? '✅ СОВПАДАЕТ' : '❌ не совпадает');
} catch (e) {
    console.log('✗ Ошибка с $2y$ хешем (оригинал):', e.message);
}

// Тест 3: новый хеш (для справки)
console.log('---');
const newHash = bcrypt.hashSync(password, 10);
console.log('Новый хеш (создан только что):', newHash);

try {
    const result3 = bcrypt.compareSync(password, newHash);
    console.log('✓ Сравнение с новым хешем:', result3 ? '✅ СОВПАДАЕТ' : '❌ не совпадает');
} catch (e) {
    console.log('✗ Ошибка с новым хешем:', e.message);
}
