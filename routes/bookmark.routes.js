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

        const normalize = (s = '') => String(s).replace(/\s+/g, '').toUpperCase();
        const normalized = normalize(trackNumber);

        if (user.bookmarks.some(b => (b.trackNormalized || normalize(b.trackNumber)) === normalized)) {
            return res.status(400).json({ message: 'Закладка с таким трек-номером уже существует' });
        }

        const newBookmark = { description, trackNumber, trackNormalized: normalized, currentStatus: null };

        const existingTrack = await Track.findOne({ trackNormalized: normalized }).populate('status').populate('history.status');
        if (existingTrack) {
            newBookmark.trackId = existingTrack._id;
            newBookmark.currentStatus = existingTrack.status && existingTrack.status._id ? existingTrack.status._id : existingTrack.status;
        }

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
    const statusFilter = String(req.query.status || '').trim();
    const searchQuery = String(req.query.search || '').trim();

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const normalize = (value = '') => String(value).replace(/\s+/g, '').toUpperCase();
        const now = new Date();

        const bookmarks = user.bookmarks || [];
        const normalizedTrackNumbers = [...new Set(bookmarks.map(bookmark => normalize(bookmark.trackNormalized || bookmark.trackNumber || '')))].filter(Boolean);

        const tracks = normalizedTrackNumbers.length > 0
            ? await Track.find({ trackNormalized: { $in: normalizedTrackNumbers } }).populate('status').populate('history.status')
            : [];

        const trackMap = new Map(tracks.map(track => [track.trackNormalized, track]));
        const trackById = new Map(tracks.map(track => [String(track._id), track]));

        let isUserModified = false;
        const statusCounts = {};
        let notFoundCount = 0;

        const allBookmarks = bookmarks.map(bookmark => {
            const normalized = normalize(bookmark.trackNormalized || bookmark.trackNumber || '');

            if (!bookmark.trackNormalized || bookmark.trackNormalized !== normalized) {
                bookmark.trackNormalized = normalized;
                isUserModified = true;
            }

            const track = bookmark.trackId ? trackById.get(String(bookmark.trackId)) : trackMap.get(normalized);
            const baseBookmark = {
                _id: bookmark._id,
                trackNumber: bookmark.trackNumber,
                description: bookmark.description,
                createdAt: bookmark.createdAt,
                currentStatus: null,
                currentStatusText: 'Добавлен в базу',
                history: [],
                hasMoreHistory: false,
                type: 'notFound',
            };

            if (!track) {
                notFoundCount += 1;
                return baseBookmark;
            }

            if (!bookmark.trackId || String(bookmark.trackId) !== String(track._id)) {
                bookmark.trackId = track._id;
                isUserModified = true;
            }

            const historyEntries = Array.isArray(track.history) ? track.history.slice() : [];
            const visibleHistory = historyEntries
                .filter(entry => !entry.date || new Date(entry.date) <= now)
                .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

            if (visibleHistory.length === 0 && track.status) {
                visibleHistory.push({ status: track.status, date: track.updatedAt || track.createdAt || new Date() });
            }

            const limitedHistory = visibleHistory.slice(-historyLimit);
            const lastVisible = limitedHistory[limitedHistory.length - 1] || visibleHistory[visibleHistory.length - 1] || null;
            const statusObject = lastVisible && lastVisible.status ? lastVisible.status : track.status;
            const statusText = statusObject && statusObject.statusText ? statusObject.statusText : 'Неизвестен';
            const statusId = statusObject && statusObject._id ? statusObject._id : null;
            const lastUpdateAt = lastVisible && lastVisible.date ? lastVisible.date : track.updatedAt || track.createdAt || bookmark.createdAt;

            if (!bookmark.currentStatus || String(bookmark.currentStatus) !== String(statusId)) {
                bookmark.currentStatus = statusId;
                isUserModified = true;
            }

            statusCounts[statusText] = (statusCounts[statusText] || 0) + 1;

            return {
                ...baseBookmark,
                type: 'found',
                currentStatus: statusId,
                currentStatusText: statusText,
                history: limitedHistory,
                hasMoreHistory: visibleHistory.length > historyLimit,
                lastUpdateAt,
            };
        });

        if (isUserModified) {
            await user.save();
        }

        statusCounts['Добавлен в базу'] = notFoundCount;

        let filteredBookmarks = allBookmarks;
        if (searchQuery) {
            const normalizedSearch = normalize(searchQuery);
            filteredBookmarks = filteredBookmarks.filter(bookmark => {
                const trackMatch = bookmark.trackNumber && normalize(bookmark.trackNumber).includes(normalizedSearch);
                const descriptionMatch = bookmark.description && String(bookmark.description).toLowerCase().includes(searchQuery.toLowerCase());
                return trackMatch || descriptionMatch;
            });
        }

        if (statusFilter) {
            filteredBookmarks = statusFilter === 'Добавлен в базу'
                ? filteredBookmarks.filter(bookmark => bookmark.type === 'notFound')
                : filteredBookmarks.filter(bookmark => bookmark.currentStatusText === statusFilter);
        }

        const sortedBookmarks = filteredBookmarks.slice().sort((a, b) => {
            const aDate = new Date(a.lastUpdateAt || a.createdAt || 0);
            const bDate = new Date(b.lastUpdateAt || b.createdAt || 0);
            return bDate - aDate;
        });

        const total = sortedBookmarks.length;
        const totalPages = Math.max(Math.ceil(total / limit), 1);
        const paginated = sortedBookmarks.slice((page - 1) * limit, page * limit);

        const notFoundBookmarks = paginated.filter(bookmark => bookmark.type === 'notFound').map(({ type, ...rest }) => rest);
        const updatedBookmarks = paginated.filter(bookmark => bookmark.type === 'found').map(({ type, ...rest }) => rest);

        return res.status(200).json({
            notFoundBookmarks,
            updatedBookmarks,
            totalPages,
            totalBookmarks: total,
            statusCounts,
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