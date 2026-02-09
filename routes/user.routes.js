const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Filial = require('../models/Filial');
const Notification = require('../models/Notification');
const jwt = require("jsonwebtoken")
const config = require("config")
const mongoose = require('mongoose'); // Добавьте эту строку для импорта mongoose
const { sendPushByUserId } = require('../utils/pushHelper');


router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const sortByDate = req.query.sortByDate || 'latest';
  const searchQuery = req.query.search || '';
  const sortByActivity = req.query.sortByActivity === 'true';
  const filterByRole = req.query.filterByRole || '';
  const filterByFilial = req.query.filterByFilial || ''; // Новый фильтр по филиалу
  const invoiceStatus = req.query.invoiceStatus || 'all'; // Новый фильтр по статусу счета

  try {
    const startIndex = (page - 1) * limit;
    let query = {};

    // Поиск по имени, фамилии или номеру телефона
    if (searchQuery) {
      const parsedQuery = parseInt(searchQuery);
      if (!isNaN(parsedQuery)) {
        query.phone = parsedQuery;
      } else {
        query.$or = [
          { name: { $regex: new RegExp(searchQuery, 'i') } },
          { surname: { $regex: new RegExp(searchQuery, 'i') } }
        ];
      }
    }

    // Фильтрация по роли
    if (filterByRole) {
      query.role = filterByRole;
    }

    // Фильтрация по филиалу
    if (filterByFilial) {
      query.selectedFilial = filterByFilial;
    }

    // Настройки сортировки
    let sortOptions = {};
    if (sortByDate === 'latest') {
      sortOptions.createdAt = -1;
    } else if (sortByDate === 'oldest') {
      sortOptions.createdAt = 1;
    }

    // Выполняем запрос к базе данных с сортировкой, фильтрацией и пагинацией
    let users = await User.find(query)
      .sort(sortOptions)
      .limit(limit)
      .skip(startIndex)
      .lean();

    // Фильтрация по статусу счета
    if (invoiceStatus !== 'all') {
      // Используем только пользователей с инвойсами, чтобы проверить их статус
      users = users.filter(user => {
        const hasPendingInvoice = user.invoices?.some(invoice => invoice.status === 'pending');
        const hasPaidInvoice = user.invoices?.some(invoice => invoice.status === 'paid');

        if (invoiceStatus === 'pending') {
          return hasPendingInvoice; // Показываем только пользователей с неоплаченными счетами
        } else if (invoiceStatus === 'paid') {
          return hasPaidInvoice; // Показываем только пользователей с оплаченными счетами
        }
        return false; // Если счет не соответствует ни одному статусу
      });
    }

    // Подсчет количества закладок и архивных записей для каждого пользователя
    const usersWithCounts = users.map(user => ({
      ...user,
      bookmarkCount: (user.bookmarks || []).length,
      archiveCount: (user.archive || []).length,
      totalActivity: (user.bookmarks || []).length + (user.archive || []).length
    }));

    // Фильтрация по активности
    if (sortByActivity) {
      usersWithCounts.sort((a, b) => b.totalActivity - a.totalActivity);
    }

    // Подсчитываем общее количество пользователей после фильтрации по счетам
    const totalCount = usersWithCounts.length;

    // Пагинация уже после фильтрации по счетам
    const paginatedUsers = usersWithCounts.slice(startIndex, startIndex + limit);

    res.json({
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      users: paginatedUsers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


router.get('/referrals', async (req, res) => {
  try {
    // Получаем токен из заголовка запроса или из cookies, где он может быть хранится
    const token = req.headers.authorization.split(' ')[1] || req.cookies.token;

    // Если токен не найден, отправляем ошибку
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Расшифровываем токен, чтобы получить идентификатор пользователя
    const decodedToken = jwt.verify(token, config.get('secretKey'));

    console.log(decodedToken)
    const referrals = await User.find({ referrer: decodedToken.id }); // Поиск пользователей с этим referrer

    res.status(200).json(referrals); // Возвращаем список найденных пользователей
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка при получении рефералов' });
  }
});


// Роут для обновления бонусного процента пользователя
router.post('/:userId/updateBonusPercentage', async (req, res) => {
  const { userId } = req.params;
  const { referralBonusPercentage } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Неверный формат идентификатора пользователя' });
  }

  if (referralBonusPercentage == null || referralBonusPercentage < 0) {
      return res.status(400).json({ message: 'Неверный процент бонуса' });
  }

  try {
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).json({ message: 'Пользователь не найден' });
      }

      user.referralBonusPercentage = referralBonusPercentage;
      await user.save();

      return res.status(200).json({ message: 'Процент бонуса пользователя успешно обновлен' });
  } catch (error) {
      console.error('Ошибка при обновлении процента бонуса пользователя:', error.message);
      return res.status(500).json({ message: 'Произошла ошибка при обновлении процента бонуса' });
  }
});



// Получение бонусного процента пользователя
router.get('/api/user/:userId/bonusPercentage', async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя' });
  }

  try {
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ message: 'Пользователь не найден' });
      }

      res.status(200).json({ referralBonusPercentage: user.referralBonusPercentage });
  } catch (error) {
      res.status(500).json({ message: 'Ошибка при получении процента бонуса пользователя' });
  }
});

// Поиск пользователя по personalId (понадобится для QR)
router.get('/byPersonalId/:personalId', async (req, res) => {
  try {
    const { personalId } = req.params;
    if (!personalId) return res.status(400).json({ message: 'personalId не указан' });

    const user = await User.findOne({ personalId }).lean();
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Ошибка при поиске пользователя по personalId:', error);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Admin-only lookup: возвращает полный профиль (invoices, tracks) по personalId
const authMiddleware = require('../middleware/auth.middleware');
router.get('/byPersonalId/admin/:personalId', authMiddleware, async (req, res) => {
  try {
    // проверим роль пользователя
    const requester = await User.findById(req.user.id);
    if (!requester || requester.role !== 'admin') return res.status(403).json({ message: 'Доступ запрещён' });

    const { personalId } = req.params;
    if (!personalId) return res.status(400).json({ message: 'personalId не указан' });

    const user = await User.findOne({ personalId }).lean();
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    // Используем наш уже существующий /:id/fullProfile функционал напрямую
    const Track = require('../models/Track');
    const bookmarks = user.bookmarks || [];

    // Собираем нормализованные номера треков и маппим оригинальные значения
    const normalize = (s = '') => String(s).replace(/\s+/g, '').toUpperCase();
    const normalizedToOriginal = {};
    const normalizedList = [];

    bookmarks.forEach(bk => {
      const normalized = normalize(bk.trackNumber || '');
      if (normalized) {
        normalizedToOriginal[normalized] = normalizedToOriginal[normalized] || [];
        normalizedToOriginal[normalized].push({ original: bk.trackNumber, description: bk.description, createdAt: bk.createdAt });
        normalizedList.push(normalized);
      }
    });

    // Делаем одну запросную операцию для всех существующих треков
    let foundTracks = [];
    if (normalizedList.length) {
      // Уникализируем
      const uniq = Array.from(new Set(normalizedList));
      foundTracks = await Track.find({ trackNormalized: { $in: uniq } }).populate('status').populate('history.status').lean();
    }

    // Собираем результаты, сохраняя порядок — если трек не найден, добавляем notFound
    const trackResults = [];
    for (const bk of bookmarks) {
      const normalized = normalize(bk.trackNumber || '');
      const found = foundTracks.find(t => t.trackNormalized === normalized);
      if (found) {
        trackResults.push(found);
      } else {
        trackResults.push({ track: bk.trackNumber, notFound: true, description: bk.description, createdAt: bk.createdAt });
      }
    }

    // Group by statusText or special label
    const grouped = {};
    for (const t of trackResults) {
      const statusKey = t.notFound ? 'Добавлен в базу' : (t.status && (t.status.statusText || t.status._id)) || 'Неизвестен';
      if (!grouped[statusKey]) grouped[statusKey] = [];
      grouped[statusKey].push(t);
    }

    // Sort within groups by latest event date
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => {
        const aDate = a.history && a.history.length ? new Date(a.history[a.history.length -1].date) : new Date(a.createdAt || 0);
        const bDate = b.history && b.history.length ? new Date(b.history[b.history.length -1].date) : new Date(b.createdAt || 0);
        return bDate - aDate;
      });
    }

    return res.json({ user, invoices: user.invoices || [], tracksByStatus: grouped });
  } catch (err) {
    console.error('Ошибка при admin поиске пользователя по personalId:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Обновление бонусного процента пользователя
router.post('/api/user/:userId/updateBonusPercentage', async (req, res) => {
  const { userId } = req.params;
  const { referralBonusPercentage } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя' });
  }

  try {
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ message: 'Пользователь не найден' });
      }

      user.referralBonusPercentage = referralBonusPercentage;
      await user.save();

      res.status(200).json({ message: 'Процент бонуса пользователя успешно обновлен' });
  } catch (error) {
      res.status(500).json({ message: 'Ошибка при обновлении процента бонуса пользователя' });
  }
});



// Роут для обновления личного тарифа пользователя
router.post('/:userId/updatePersonalRate', async (req, res) => {
  const { userId } = req.params;
  const { personalRate } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Неверный формат идентификатора пользователя' });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.personalRate = personalRate; // Добавляем или обновляем личный тариф пользователя
    await user.save();

    return res.status(200).json({ message: 'Личный тариф пользователя успешно обновлен' });
  } catch (error) {
    console.error('Ошибка при обновлении личного тарифа пользователя:', error.message);
    return res.status(500).json({ message: 'Произошла ошибка при обновлении личного тарифа' });
  }
});

router.put('/update/:id', async (req, res) => {
  try {
    const { newPassword, filial, name, surname, phone, email } = req.body;
    const updateData = {};

    if (newPassword) {
      if (newPassword.length < 4 || newPassword.length > 20) {
        return res.status(400).json({ message: "Пароль должен содержать от 4 до 20 символов" });
      }
      updateData.password = newPassword;
    }

    // allow updating basic profile fields
    if (typeof name !== 'undefined') updateData.name = name;
    if (typeof surname !== 'undefined') updateData.surname = surname;
    if (typeof phone !== 'undefined') updateData.phone = phone;
    if (typeof email !== 'undefined') updateData.email = email;

    if (filial) {
      // Находим филиал по ID
      const selectedFilial = await Filial.findById(filial);
      if (!selectedFilial) {
        return res.status(404).json({ message: "Филиал не найден" });
      }

      // Увеличиваем счетчик пользователей в филиале
      const newUserCount = (selectedFilial.userCount || 0) + 1;
      await Filial.findByIdAndUpdate(filial, { userCount: newUserCount });

      // Генерируем новый personalId
      const personalId = `${selectedFilial.filialId}${String(newUserCount).padStart(2, '0')}`;

      // Обновляем данные пользователя
      updateData.filial = filial; // ID филиала
      updateData.selectedFilial = selectedFilial.filialText; // Название филиала
      updateData.personalId = personalId;
    }

    // Обновляем пользователя
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    return res.json({ message: "Данные успешно обновлены", user });
  } catch (error) {
    console.error("Ошибка при обновлении:", error);
    return res.status(500).json({ message: "Ошибка сервера" });
  }
});


// ✅ POST /api/user/:id/invoice — создать счёт
router.post('/:id/invoice', async (req, res) => {
  try {
    const { itemCount, totalWeight, totalAmount, date } = req.body;
    const userId = req.params.id;
    
    const newInvoice = {
      itemCount,
      totalWeight,
      totalAmount,
      date,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.invoices.unshift(newInvoice); // Добавляем в начало
    await user.save();

    // 📝 Создание уведомления
    console.log(`📝 Создание уведомления о новом счете для пользователя: ${userId}`);
    try {
      const notification = new Notification({
        userId,
        type: 'invoices',
        title: 'Новый счет',
        message: `Создан новый счет на сумму ${totalAmount}₸`,
        isRead: false,
        data: {
          invoiceId: newInvoice._id,
          amount: totalAmount,
          itemCount
        }
      });
      await notification.save();
      console.log(`✅ Уведомление сохранено: ${notification._id}`);

      // 📤 Отправка push
      console.log(`📤 Отправка push пользователю ${userId}`);
      await sendPushByUserId(userId, 'Новый счет', `Счет на сумму ${totalAmount}₸`, {
        type: 'invoice',
        invoiceId: newInvoice._id
      });
    } catch (notificationError) {
      console.error('❌ Ошибка при создании уведомления:', notificationError.message);
      // Не прерываем выполнение, счет все равно создан
    }

    res.status(200).json({ message: 'Счёт успешно добавлен', invoice: newInvoice });
  } catch (error) {
    console.error('❌ Ошибка при создании счёта:', error);
    res.status(500).json({ message: 'Ошибка при создании счёта' });
  }
});

// ✅ PUT /api/user/:id/invoice/:invoiceId — редактировать счёт
router.put('/:id/invoice/:invoiceId', async (req, res) => {
  try {
    const userId = req.params.id;
    const invoiceId = req.params.invoiceId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const invoice = user.invoices.id(invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Счёт не найден' });

    // Запоминаем старый статус
    const oldStatus = invoice.status;
    
    Object.assign(invoice, req.body);
    invoice.updatedAt = new Date();

    await user.save();

    // 📝 Создание уведомления при обновлении (особенно если изменился статус)
    if (req.body.status && req.body.status !== oldStatus) {
      console.log(`📝 Создание уведомления об изменении счета для пользователя: ${userId}`);
      try {
        let message = '';
        if (req.body.status === 'paid') {
          message = 'Счет оплачен';
        } else if (req.body.status === 'cancelled') {
          message = 'Счет отменен';
        } else {
          message = `Статус счета изменен на: ${req.body.status}`;
        }

        const notification = new Notification({
          userId,
          type: 'invoices',
          title: 'Обновление счета',
          message,
          isRead: false,
          data: {
            invoiceId,
            status: req.body.status,
            totalAmount: invoice.totalAmount
          }
        });
        await notification.save();
        console.log(`✅ Уведомление сохранено: ${notification._id}`);

        // 📤 Отправка push
        console.log(`📤 Отправка push пользователю ${userId}`);
        await sendPushByUserId(userId, 'Обновление счета', message, {
          type: 'invoice',
          invoiceId,
          status: req.body.status
        });
      } catch (notificationError) {
        console.error('❌ Ошибка при создании уведомления:', notificationError.message);
        // Не прерываем выполнение, счет все равно обновлен
      }
    }

    res.status(200).json({ message: 'Счёт обновлён', invoice });
  } catch (error) {
    console.error('❌ Ошибка при обновлении счёта:', error);
    res.status(500).json({ message: 'Ошибка при обновлении счёта' });
  }
});

// ✅ DELETE /api/user/:id/invoice/:invoiceId — удалить счёт
router.delete('/:id/invoice/:invoiceId', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.invoices = user.invoices.filter(inv => inv._id.toString() !== req.params.invoiceId);

    await user.save();

    res.status(200).json({ message: 'Счёт удалён' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка при удалении счёта' });
  }
});

// ✅ PUT /api/user/:id/invoice/:invoiceId/pay — отметить как оплаченный
router.put('/:id/invoice/:invoiceId/pay', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const invoice = user.invoices.id(req.params.invoiceId);

    if (!invoice) return res.status(404).json({ message: 'Счёт не найден' });

    invoice.status = 'paid';
    invoice.updatedAt = new Date();

    await user.save();

    res.status(200).json({ message: 'Счёт отмечен как оплаченный' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка при оплате счёта' });
  }
});

// Удаление пользователя по id
router.delete("/delete/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });
    return res.json({ message: "Пользователь удалён" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

// --- Бонусная система ---

// Получить бонусы пользователя
router.get('/:id/bonuses', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    res.json({ bonuses: user.bonuses, totalEarned: user.totalEarned, level: user.level });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Получить историю бонусов пользователя
router.get('/:id/bonus-history', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    res.json({ history: user.bonusHistory });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Начислить бонусы пользователю (админ)
router.post('/:id/bonuses/add', async (req, res) => {
  try {
    const { amount, description, type } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    user.bonuses += amount;
    user.totalEarned += amount;
    user.bonusHistory.unshift({ type: type || 'add', amount, description, date: new Date() });
    await user.save();
    res.json({ success: true, bonuses: user.bonuses });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Списать бонусы у пользователя (админ)
router.post('/:id/bonuses/spend', async (req, res) => {
  try {
    const { amount, description } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (user.bonuses < amount) return res.status(400).json({ message: 'Недостаточно бонусов' });
    user.bonuses -= amount;
    user.bonusHistory.unshift({ type: 'spend', amount: -amount, description, date: new Date() });
    await user.save();
    res.json({ success: true, bonuses: user.bonuses });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Получить список всех пользователей с бонусами (админ)
router.get('/all/bonuses', async (req, res) => {
  try {
    const users = await User.find({}, 'name surname phone bonuses level totalEarned');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// --- Конец бонусных роутов ---


// Лёгкий профиль: минимальные поля пользователя + счета (быстрый ответ, без треков)
router.get('/:id/basicProfile', async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Неверный ID' });

    const user = await User.findById(userId).select('name surname phone personalId selectedFilial createdAt bonuses bookmarks').lean();
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const invoices = (user.invoices || []).slice(0, 20);
    return res.json({ user, invoices });
  } catch (err) {
    console.error('Ошибка при получении базового профиля:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Получить полный профиль пользователя: профиль, инвойсы, треки (с populated status и history)
router.get('/:id/fullProfile', async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Неверный ID' });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    // Быстрый ответ без треков
    if (req.query.skipTracks === '1' || req.query.skipTracks === 'true') {
      return res.json({ user, invoices: user.invoices || [] });
    }

    const Track = require('../models/Track');
    const bookmarks = user.bookmarks || [];

    // Сбор нормализованных номеров для batched поиска
    const normalize = (s = '') => String(s).replace(/\s+/g, '').toUpperCase();
    const normalizedList = [];
    bookmarks.forEach(bk => {
      const normalized = normalize(bk.trackNumber || '');
      if (normalized) normalizedList.push(normalized);
    });

    let foundTracks = [];
    if (normalizedList.length) {
      const uniq = Array.from(new Set(normalizedList));
      foundTracks = await Track.find({ trackNormalized: { $in: uniq } }).populate('status').populate('history.status').lean();
    }

    // Собираем результаты в исходном порядке
    const trackResults = bookmarks.map(bk => {
      const normalized = normalize(bk.trackNumber || '');
      const found = foundTracks.find(t => t.trackNormalized === normalized);
      if (found) return found;
      return { track: bk.trackNumber, notFound: true, description: bk.description, createdAt: bk.createdAt };
    });

    // group by statusText or special label
    const grouped = {};
    for (const t of trackResults) {
      const statusKey = t.notFound ? 'Добавлен в базу' : (t.status && (t.status.statusText || t.status._id)) || 'Неизвестен';
      if (!grouped[statusKey]) grouped[statusKey] = [];
      grouped[statusKey].push(t);
    }

    // sort within groups by latest event date
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => {
        const aDate = a.history && a.history.length ? new Date(a.history[a.history.length -1].date) : new Date(a.createdAt || 0);
        const bDate = b.history && b.history.length ? new Date(b.history[b.history.length -1].date) : new Date(b.createdAt || 0);
        return bDate - aDate;
      });
    }

    return res.json({ user, invoices: user.invoices || [], tracksByStatus: grouped });
  } catch (err) {
    console.error('Ошибка при получении полного профиля:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Поиск пользователя по номеру телефона (для QR сканера)
router.get('/search', async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ message: 'Требуется номер телефона' });
    }

    // Преобразуем телефон в число
    const phoneNumber = parseInt(phone);
    if (isNaN(phoneNumber)) {
      return res.status(400).json({ message: 'Некорректный номер телефона' });
    }

    const user = await User.findOne({ phone: phoneNumber })
      .select('-password -pushSubscriptions')
      .populate('selectedFilial', 'name')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Ошибка при поиске пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
