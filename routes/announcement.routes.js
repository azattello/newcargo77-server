const express = require('express');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth.middleware');
const webpush = require('web-push');

const router = express.Router();

// Проверка прав администратора
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Доступ запрещен. Требуются права администратора.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};

// Получить все объявления (доступно всем авторизованным)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .populate('createdBy', 'name surname')
      .sort({ priority: -1, createdAt: -1 })
      .limit(50);

    res.json({ announcements });
  } catch (error) {
    console.error('Ошибка при получении объявлений:', error);
    res.status(500).json({ message: 'Ошибка при получении объявлений' });
  }
});

// Получить одно объявление
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'name surname');

    if (!announcement) {
      return res.status(404).json({ message: 'Объявление не найдено' });
    }

    res.json({ announcement });
  } catch (error) {
    console.error('Ошибка при получении объявления:', error);
    res.status(500).json({ message: 'Ошибка при получении объявления' });
  }
});

// Создать объявление (только админ)
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { title, message, description, image, link, priority } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Требуются поля: title и message' });
    }

    const announcement = new Announcement({
      title,
      message,
      description,
      image,
      link,
      priority: priority || 'medium',
      createdBy: req.userId
    });

    await announcement.save();

    // Создаём уведомления для всех пользователей
    const users = await User.find({});
    const notifications = users.map(user => ({
      userId: user._id,
      type: 'announcements',
      title: title,
      message: message,
      data: {
        announcementId: announcement._id,
        image: image,
        actionUrl: link
      },
      isRead: false,
      createdAt: new Date()
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Отправляем push-уведомления всем подписанным пользователям
    for (const user of users) {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        for (const subscription of user.pushSubscriptions) {
          try {
            await webpush.sendNotification(subscription, JSON.stringify({
              title: title,
              body: message,
              message: message,
              icon: image || '/icons/notification-icon.png',
              badge: '/icons/notification-badge.png',
              tag: 'announcement',
              requireInteraction: priority === 'high',
              data: {
                announcementId: announcement._id,
                description: description,
                image: image,
                priority: priority,
                link: link,
                url: link || '/notification',
                type: 'announcement'
              }
            }));
          } catch (error) {
            console.error('Ошибка при отправке push:', error);
          }
        }
      }
    }

    res.json({ message: 'Объявление создано и отправлено всем пользователям', announcement });
  } catch (error) {
    console.error('Ошибка при создании объявления:', error);
    res.status(500).json({ message: 'Ошибка при создании объявления' });
  }
});

// Обновить объявление (только админ)
router.put('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { title, message, description, image, link, priority, isActive } = req.body;

    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { title, message, description, image, link, priority, isActive, updatedAt: new Date() },
      { new: true }
    );

    if (!announcement) {
      return res.status(404).json({ message: 'Объявление не найдено' });
    }

    res.json({ message: 'Объявление обновлено', announcement });
  } catch (error) {
    console.error('Ошибка при обновлении объявления:', error);
    res.status(500).json({ message: 'Ошибка при обновлении объявления' });
  }
});

// Удалить объявление (только админ)
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Объявление не найдено' });
    }

    res.json({ message: 'Объявление удалено' });
  } catch (error) {
    console.error('Ошибка при удалении объявления:', error);
    res.status(500).json({ message: 'Ошибка при удалении объявления' });
  }
});

module.exports = router;
