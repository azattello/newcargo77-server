const Track = require('../models/Track'); // Подключаем модель Track
const User = require('../models/User');   // Подключаем модель User

const getUserBookmarks = async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Количество записей на одной странице
    const skip = (page - 1) * limit;

    // Находим пользователя
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Общее количество закладок пользователя
    const totalBookmarks = user.bookmarks.length;

    // Берём закладки текущей страницы
    const bookmarksPage = user.bookmarks.slice(skip, skip + limit);

    // Обрабатываем закладки
    let updatedBookmarks = await Promise.all(
      bookmarksPage.map(async (bookmark) => {
        let track = null;

        if (bookmark.trackId) {
          track = await Track.findById(bookmark.trackId).populate(
            'history.status',
            'statusText'
          );
        } else {
          const normalizedTrack = String(bookmark.trackNumber || '').replace(/\s+/g, '').toUpperCase();
          track = await Track.findOne({ trackNormalized: normalizedTrack }).populate(
            'history.status',
            'statusText'
          );

          if (track) {
            bookmark.trackId = track._id;
            await User.updateOne(
              { _id: userId, 'bookmarks.trackNumber': bookmark.trackNumber },
              { $set: { 'bookmarks.$.trackId': track._id } }
            );
          }
        }

        if (!track) {
          return {
            trackNumber: bookmark.trackNumber,
            createdAt: bookmark.createdAt,
            description: bookmark.description,
            readyForPickup: false,
          };
        }

        // Обновляем поле `user` в документе трека (телефон как строка без спецсимволов)
        const userPhoneStr = String(user.phone || '').replace(/\D/g, '');
        if (!track.user || String(track.user) !== userPhoneStr) {
          track.user = userPhoneStr;
          console.log(`[bookmarks] saving track.user -> trackId=${track._id}, user=${userPhoneStr}`);
          try {
            await track.save();
            console.log(`[bookmarks] saved track.user -> trackId=${track._id}, user=${track.user}`);
          } catch (saveErr) {
            console.error('Ошибка при сохранении track.user:', saveErr);
          }
        }

        // Проверяем, есть ли статус "Готов к выдаче"
        const readyForPickup = track.history.some(
          (h) => h.status && h.status.statusText === 'Готов к выдаче'
        );

        return {
          ...bookmark,
          trackDetails: track,
          history: track.history,
          price: track.price,
          weight: track.weight,
          readyForPickup, // Флаг для кнопки
          createdAt: track.createdAt, // Добавляем дату создания
        };
      })
    );

    // Сортируем: сначала "Готов к выдаче", затем по дате (новые выше)
    updatedBookmarks.sort((a, b) => {
      if (a.readyForPickup !== b.readyForPickup) {
        return b.readyForPickup - a.readyForPickup;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const totalPages = Math.ceil(totalBookmarks / limit);

    // ✅ Подсчитываем статусы для ВСЕХ закладок (не только текущей страницы)
    const allBookmarks = await User.findById(userId).select('bookmarks').lean();
    const statusCounts = {};
    let notFoundCount = 0;

    if (allBookmarks && allBookmarks.bookmarks) {
      const Status = require('../models/Status');
      
      for (const bookmark of allBookmarks.bookmarks) {
        let track = null;
        if (bookmark.trackId) {
          track = await Track.findById(bookmark.trackId).populate('history.status', 'statusText').lean();
        } else {
          const normalizedTrack = String(bookmark.trackNumber || '').replace(/\s+/g, '').toUpperCase();
          track = await Track.findOne({ trackNormalized: normalizedTrack }).populate('history.status', 'statusText').lean();
        }
        
        if (!track) {
          notFoundCount++;
        } else if (track.history && track.history.length > 0) {
          const lastStatus = track.history[track.history.length - 1];
          const statusText = lastStatus.status && lastStatus.status.statusText ? lastStatus.status.statusText : 'Неизвестен';
          statusCounts[statusText] = (statusCounts[statusText] || 0) + 1;
        }
      }
    }

    // "Добавлен в базу" — это notFoundBookmarks
    statusCounts['Добавлен в базу'] = notFoundCount;

    res.status(200).json({
      updatedBookmarks,
      totalPages,
      totalBookmarks,
      statusCounts,  // ✅ Подсчет по ВСЕМ статусам
    });
  } catch (error) {
    console.error('Ошибка при получении закладок пользователя:', error);
    res.status(500).json({ message: 'Произошла ошибка при получении закладок' });
  }
};

module.exports = { getUserBookmarks };
