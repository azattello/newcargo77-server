const User = require('../models/User');   // Подключаем модель User
const Status = require('../models/Status'); // Подключаем модель Status

const getUserArchive = async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;  // Получаем текущую страницу, по умолчанию 1
    const limit = 20;  // Количество элементов на страницу
    const skip = (page - 1) * limit;  // Пропуск для пагинации

    // Находим пользователя по ID и извлекаем его архив
    const user = await User.findById(userId).select('archive');

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Пагинация для архива
    const paginatedArchive = await Promise.all(user.archive.slice(skip, skip + limit).map(async (bookmark) => {
      let history = [];
      if (bookmark.history && bookmark.history.length > 0) {
        // Для каждой записи в истории пополняем статус
        history = await Promise.all(bookmark.history.map(async (historyItem) => {
          // Используем populate для получения статус текста
          const status = await Status.findById(historyItem.status).select('statusText'); 
          return { 
            ...historyItem.toObject ? historyItem.toObject() : historyItem,
            statusText: status ? status.statusText : 'Добавлен в базу' 
          };
        }));
      }
      return {
        ...bookmark.toObject ? bookmark.toObject() : bookmark,
        history: history
      };
    }));
    
    const totalPages = Math.ceil(user.archive.length / limit);  // Всего страниц

    res.status(200).json({
      archive: paginatedArchive,  // Отправляем архив с пагинацией
      totalPages,
      totalArchives: user.archive.length  // Общее количество архивов
    });
  } catch (error) {
    console.error('Ошибка при получении архива закладок пользователя:', error);
    res.status(500).json({ message: 'Произошла ошибка при получении архива закладок' });
  }
};

module.exports = { getUserArchive };
