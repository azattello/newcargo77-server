const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Track = require('../models/Track');
const { getUserBookmarks } = require('../middleware/bookmarks.middleware');
const { getUserArchive } = require('../middleware/archive.middleware');

// Маршрут для получения закладок по userId
router.get('/bookmarks/:userId', getUserBookmarks);

// Маршрут для получения архива по userId
router.get('/archives/:userId', getUserArchive);

// Роут для прикрепления трек-номера к аккаунту пользователя
router.post('/:userId/bookmarks', async (req, res) => {
    const { userId } = req.params;
    const { description, trackNumber } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Нормализуем трек-номер
        const normalize = (s = '') => String(s).replace(/\s+/g, '').toUpperCase();
        const normalized = normalize(trackNumber);

        // Проверяем, не существует ли уже закладка с таким нормализованным трек-номером
        if (user.bookmarks.some(b => (b.trackNormalized || normalize(b.trackNumber)) === normalized)) {
            return res.status(400).json({ message: 'Закладка с таким трек-номером уже существует' });
        }

        const newBookmark = { description, trackNumber, trackNormalized: normalized };
        user.bookmarks.push(newBookmark);
        await user.save();

        return res.status(201).json({ message: 'Трек-номер успешно прикреплен к пользователю', bookmark: newBookmark });
    } catch (error) {
        console.error('Ошибка при прикреплении трек-номера к пользователю:', error.message);
        return res.status(500).json({ message: 'Произошла ошибка при прикреплении трек-номера к пользователю' });
    }
});


router.post('/confirm-receipt', async (req, res) => {
    const { phone, trackNumber } = req.body; // Получаем phone и trackNumber из тела запроса

    try {
        // Находим пользователя по номеру телефона и номеру трека в закладках
        const user = await User.findOne({ phone});

        if (!user) {
            return res.status(404).json({ message: 'User not found or track is not bookmarked' });
        }

        // Находим закладку по trackNumber
        const trackBookmark = user.bookmarks.find(bookmark => bookmark.trackNumber === trackNumber);

        // Находим трек по trackId
        const track = await Track.findById(trackBookmark.trackId).populate('history.status');

        // Добавляем историю трека в архив
        const archiveData = {
            description: trackBookmark.description,
            trackNumber: trackBookmark.trackNumber,
            history: track.history.map(entry => ({
                status: entry.status,
                date: entry.date
            })),
            receivedAt: new Date() // Сохраняем дату получения в архиве
        };

        // Добавляем информацию о получении в архив
        user.archive.push(archiveData);

        // Удаляем закладку
        user.bookmarks = user.bookmarks.filter(bookmark => bookmark.trackNumber !== trackNumber);

        // Сохраняем изменения
        await user.save();

        res.status(200).json({ message: 'Track received and archived successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});




// Роут для получения закладок клиента с пагинацией и ограничением истории
router.get('/:userId/getBookmarks', async (req, res) => {
    const { userId } = req.params;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 25, 1);
    const historyLimit = Math.max(parseInt(req.query.historyLimit) || 5, 1);

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const bookmarks = user.bookmarks || [];
        const allBookmarks = [];

        await Promise.all(bookmarks.map(async (bookmark) => {
            const formattedTrackNumber = String(bookmark.trackNumber || '').replace(/\s+/g, '').toLowerCase();
            // Подгружаем статус и историю статусов, чтобы вернуть statusText/statusNumber
            const track = await Track.findOne({ track: { $regex: new RegExp(formattedTrackNumber, 'i') } }).populate('status').populate('history.status');

            if (!track) {
                allBookmarks.push({
                    type: 'notFound',
                    _id: bookmark._id,
                    trackNumber: bookmark.trackNumber,
                    currentStatus: null,
                    createdAt: bookmark.createdAt,
                    description: bookmark.description
                });
            } else {
                // Для хранения в пользователе — сохраняем только ObjectId статуса
                bookmark.trackId = track._id;
                bookmark.currentStatus = track.status && track.status._id ? track.status._id : track.status;

                // Ограничиваем историю до последних historyLimit записей
                const fullHistory = Array.isArray(track.history) ? track.history : [];
                const hasMoreHistory = fullHistory.length > historyLimit;
                const history = fullHistory.slice(-historyLimit);

                // В ответ отправляем populated status и ограниченную историю (history.status — тоже populated)
                allBookmarks.push({
                    type: 'found',
                    _id: bookmark._id,
                    trackNumber: bookmark.trackNumber,
                    currentStatus: track.status,
                    description: bookmark.description,
                    history,
                    hasMoreHistory,
                    createdAt: bookmark.createdAt
                });
            }
        }));

        // Сохраняем пользователя с обновленными данными закладок (trackId/currentStatus)
        await user.save();

        // ✅ Подсчитываем статусы для ВСЕХ закладок (не только текущей страницы)
        const Status = require('../models/Status');
        const statusCounts = {};
        let notFoundCount = 0;

        await Promise.all(
          bookmarks.map(async (bookmark) => {
            const formattedTrackNumber = String(bookmark.trackNumber || '').replace(/\s+/g, '').toLowerCase();
            const track = await Track.findOne({ track: { $regex: new RegExp(formattedTrackNumber, 'i') } }).populate('status', 'statusText').lean();

            if (!track) {
              notFoundCount++;
            } else if (track.status && track.status.statusText) {
              const statusText = track.status.statusText;
              statusCounts[statusText] = (statusCounts[statusText] || 0) + 1;
            }
          })
        );

        statusCounts['Добавлен в базу'] = notFoundCount;

        // Пагинация по всем закладкам (found + notFound)
        const total = allBookmarks.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const startIndex = (page - 1) * limit;
        const paginated = allBookmarks.slice(startIndex, startIndex + limit);

        const notFoundBookmarks = paginated.filter(b => b.type === 'notFound').map(({ type, ...rest }) => rest);
        const updatedBookmarks = paginated.filter(b => b.type === 'found').map(({ type, ...rest }) => rest);

        return res.status(200).json({ 
          notFoundBookmarks, 
          updatedBookmarks, 
          totalPages,
          totalBookmarks: total,
          statusCounts,  // ✅ Возвращаем подсчет по ВСЕМ статусам
        });
    } catch (error) {
        console.error('Ошибка при получении закладок пользователя:', error.message);
        return res.status(500).json({ message: 'Произошла ошибка при получении закладок пользователя' });
    }
});

// Роут для удаления закладки
router.delete('/:userId/delete/:trackNumber', async (req, res) => {
    const { userId, trackNumber } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const index = user.bookmarks.findIndex(b => b.trackNumber.toLowerCase() === trackNumber.toLowerCase());
        if (index === -1) {
            return res.status(404).json({ message: 'Закладка не найдена' });
        }

        user.bookmarks.splice(index, 1);
        await user.save();

        return res.status(200).json({ message: 'Закладка успешно удалена' });
    } catch (error) {
        console.error('Ошибка при удалении закладки:', error.message);
        return res.status(500).json({ message: 'Произошла ошибка при удалении закладки' });
    }
});

// Роут для обновления закладки (редактирование)
router.patch('/:userId/bookmarks/:trackNumber', async (req, res) => {
    const { userId, trackNumber } = req.params;
    const { newTrackNumber, description } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        const index = user.bookmarks.findIndex(b => b.trackNumber.toLowerCase() === trackNumber.toLowerCase());
        if (index === -1) return res.status(404).json({ message: 'Закладка не найдена' });

        const bookmark = user.bookmarks[index];
        // Если трек уже связан с сущей системой (trackId установлен) — нельзя менять номер трека
        if (newTrackNumber && bookmark.trackId) {
            return res.status(400).json({ message: 'Невозможно изменить номер трека — он уже в системе' });
        }

        if (newTrackNumber) {
            bookmark.trackNumber = newTrackNumber;
            bookmark.trackNormalized = String(newTrackNumber).replace(/\s+/g, '').toUpperCase();
        }
        if (typeof description !== 'undefined') bookmark.description = description;

        user.bookmarks[index] = bookmark;
        await user.save();

        return res.status(200).json({ message: 'Закладка обновлена', bookmark });
    } catch (error) {
        console.error('Ошибка при обновлении закладки:', error.message);
        return res.status(500).json({ message: 'Произошла ошибка при обновлении закладки' });
    }
});

// Новый роут: получить закладки пользователя по currentStatus (быстро, без поиска в глобальной базе треков)
router.get('/:userId/bookmarksByStatus', async (req, res) => {
    try {
        const { userId } = req.params;
        const { statusId } = req.query;
        if (!statusId) return res.status(400).json({ message: 'statusId обязателен' });

        const user = await User.findById(userId).lean();
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        const bookmarks = (user.bookmarks || []).filter(b => String(b.currentStatus) === String(statusId));
        return res.status(200).json({ bookmarks });
    } catch (error) {
        console.error('Ошибка при получении закладок по статусу:', error.message);
        return res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Новый роут: установить currentStatus для закладки (только авторизованный админ)
const authMiddleware = require('../middleware/auth.middleware');
router.patch('/:userId/bookmarks/:trackNumber/status', authMiddleware, async (req, res) => {
    try {
        const requester = await User.findById(req.user.id || req.userId);
        if (!requester || requester.role !== 'admin') return res.status(403).json({ message: 'Доступ запрещён' });

        const { userId, trackNumber } = req.params;
        const { statusId, date } = req.body;
        if (!statusId) return res.status(400).json({ message: 'statusId обязателен' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        const index = user.bookmarks.findIndex(b => b.trackNumber.toLowerCase() === trackNumber.toLowerCase());
        if (index === -1) return res.status(404).json({ message: 'Закладка не найдена' });

        user.bookmarks[index].currentStatus = statusId;
        // опциональная дата применения статуса (если передана)
        if (date) {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                user.bookmarks[index].statusDate = parsed;
            }
        }
        await user.save();

        return res.status(200).json({ message: 'Статус закладки обновлён', bookmark: user.bookmarks[index] });
    } catch (error) {
        console.error('Ошибка при обновлении статуса закладки:', error.message);
        return res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Маршрут для архивирования трека (переноса из bookmarks в archive)
router.post('/:userId/archive/:bookmarkId', async (req, res) => {
    const { userId, bookmarkId } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Находим закладку по ID
        const bookmarkIndex = user.bookmarks.findIndex(b => b._id.toString() === bookmarkId);
        if (bookmarkIndex === -1) {
            return res.status(404).json({ message: 'Закладка не найдена' });
        }

        const bookmark = user.bookmarks[bookmarkIndex];

        // Создаем запись в архиве с историей статусов
        const archiveEntry = {
            description: bookmark.description,
            trackNumber: bookmark.trackNumber,
            trackNormalized: bookmark.trackNormalized,
            history: bookmark.history || [{
                status: bookmark.currentStatus,
                date: bookmark.statusDate || new Date()
            }],
            receivedAt: new Date()
        };

        // Добавляем в архив
        user.archive.push(archiveEntry);

        // Удаляем из закладок
        user.bookmarks.splice(bookmarkIndex, 1);

        await user.save();

        return res.status(200).json({ 
            message: 'Трек успешно архивирован',
            archivedTrack: archiveEntry 
        });
    } catch (error) {
        console.error('Ошибка при архивировании трека:', error.message);
        return res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Маршрут для восстановления трека из архива
router.post('/:userId/restore/:archiveId', async (req, res) => {
    const { userId, archiveId } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Находим запись в архиве по ID
        const archiveIndex = user.archive.findIndex(a => a._id.toString() === archiveId);
        if (archiveIndex === -1) {
            return res.status(404).json({ message: 'Запись в архиве не найдена' });
        }

        const archiveEntry = user.archive[archiveIndex];

        // Восстанавливаем в закладки
        const restoredBookmark = {
            description: archiveEntry.description,
            trackNumber: archiveEntry.trackNumber,
            trackNormalized: archiveEntry.trackNormalized,
            history: archiveEntry.history || []
        };

        user.bookmarks.push(restoredBookmark);

        // Удаляем из архива
        user.archive.splice(archiveIndex, 1);

        await user.save();

        return res.status(200).json({ 
            message: 'Трек успешно восстановлен',
            restoredBookmark 
        });
    } catch (error) {
        console.error('Ошибка при восстановлении трека:', error.message);
        return res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Маршрут для удаления записи из архива
router.delete('/:userId/archive/:archiveId', async (req, res) => {
    const { userId, archiveId } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Находим и удаляем запись в архиве
        const archiveIndex = user.archive.findIndex(a => a._id.toString() === archiveId);
        if (archiveIndex === -1) {
            return res.status(404).json({ message: 'Запись в архиве не найдена' });
        }

        user.archive.splice(archiveIndex, 1);
        await user.save();

        return res.status(200).json({ message: 'Запись удалена из архива' });
    } catch (error) {
        console.error('Ошибка при удалении записи:', error.message);
        return res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;