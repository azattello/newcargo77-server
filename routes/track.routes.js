const express = require('express');
const router = express.Router();
const Track = require('../models/Track');
const { updateTrack, excelTrack } = require('../middleware/track.middleware');
const User = require('../models/User');

router.post('/addTrack', updateTrack );

router.post('/addExcelTrack', excelTrack );

// Роут для получения всех трек-кодов с пагинацией, поисковым запросом и сортировкой
router.get('/tracks', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const searchQuery = req.query.search || ''; // Получение поискового запроса из параметров запроса
  const sortByDate = req.query.sortByDate || 'latest'; // Получение типа сортировки из параметров запроса
  const statusFilter = req.query.status || ''; // Получение фильтра по статусу из параметров запроса
  const userFilter = req.query.userFilter || ''; // Получение фильтра по наличию пользователя из параметров запроса

  try {
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      let query = {}; // Пустой объект запроса, который будет использоваться для фильтрации

      // Если есть поисковый запрос, добавляем его в запрос
      if (searchQuery) {
          query.$or = [
            { track: { $regex: new RegExp(searchQuery, 'i') } },
            { user: { $regex: new RegExp(searchQuery, 'i') } }
        ];
      }

      // Если есть фильтр по статусу, добавляем его в запрос
      if (statusFilter) {
        query.status = statusFilter; // Фильтрация по статусу
      }
      
      // Если есть фильтр по наличию пользователя, добавляем его в запрос
      if (userFilter === 'exists') {
        query.user = { $exists: true }; // Фильтрация по наличию пользователя в треке
      } else if (userFilter === 'notExists') {
        query.user = { $exists: false }; // Фильтрация по отсутствию пользователя в треке
      }

      
      // Устанавливаем параметры сортировки в зависимости от выбранного типа
      let sortOptions = {};
      if (sortByDate === 'latest') {
          sortOptions = { 'history.date': 'desc' }; // Сортировка по последней дате в истории
      } else if (sortByDate === 'oldest') {
          sortOptions = { 'history.date': 'asc' }; // Сортировка по первой дате в истории
      }

      const tracks = await Track.find(query) // Используем query для фильтрации
          .sort(sortOptions) // Применяем параметры сортировки
          .limit(limit)
          .skip(startIndex);

      const totalCount = await Track.countDocuments(query); // Также учитываем query при подсчете общего количества документов

      const response = {
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          tracks
      };

      res.json(response);
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Роут для получения всех закладок пользователей, не имеющих статуса
router.get('/getBookmarksWithoutStatus', async (req, res) => {
  try {
    // Получаем всех пользователей
    const users = await User.find();

    // Собираем закладки, у которых отсутствует статус (currentStatus === null), и добавляем информацию о пользователе
    const bookmarksWithoutStatus = users.reduce((acc, user) => {
      if (user.bookmarks && user.bookmarks.length > 0) {
        const userBookmarks = user.bookmarks
          .filter(bookmark => !bookmark.currentStatus) // Проверка, что статус отсутствует
          .map(bookmark => ({
            ...bookmark.toObject(),
            user: {
              userId: user._id,
              name: user.name,
              surname: user.surname,
              phone: user.phone,
              email: user.email
            }
          }));
        return acc.concat(userBookmarks);
      }
      return acc;
    }, []);

    // Возвращаем закладки без статуса вместе с информацией о пользователе
    res.status(200).json(bookmarksWithoutStatus);
  } catch (error) {
    console.error('Ошибка при получении закладок без статуса:', error.message);
    res.status(500).json({ message: 'Произошла ошибка при получении закладок без статуса' });
  }
});

// Роут для получения полной истории трека по трек-номеру
router.get('/history/:trackNumber', async (req, res) => {
  const { trackNumber } = req.params;

  try {
    const formatted = String(trackNumber).replace(/\s+/g, '').toUpperCase();
    const track = await Track.findOne({ trackNormalized: formatted }).populate('status').populate('history.status');

    if (!track) {
      return res.status(404).json({ message: 'Track not found' });
    }

    return res.status(200).json({ trackNumber: track.track, history: track.history, status: track.status });
  } catch (error) {
    console.error('Ошибка при получении истории трека:', error.message);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Удалить трек (только админ)
const authMiddleware = require('../middleware/auth.middleware');
router.delete('/:trackNumber', authMiddleware, async (req, res) => {
  try {
    const requester = await User.findById(req.user.id);
    if (!requester || requester.role !== 'admin') return res.status(403).json({ message: 'Доступ запрещён' });

    const { trackNumber } = req.params;
    if (!trackNumber) return res.status(400).json({ message: 'Track number required' });

    const formatted = String(trackNumber).replace(/\s+/g, '').toLowerCase();
    const result = await Track.findOneAndDelete({ track: { $regex: new RegExp(formatted, 'i') } });
    if (!result) return res.status(404).json({ message: 'Track not found' });

    return res.json({ message: 'Track deleted' });
  } catch (err) {
    console.error('Ошибка при удалении трека:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
