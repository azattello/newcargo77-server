const express = require('express');
const Notification = require('../models/Notification');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth.middleware');
const config = require('../config/default.json');

let webpush;
try {
  webpush = require('web-push');
  // Настройка web-push с VAPID ключами
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(
      'mailto:support@akdani.com',
      config.vapidPublicKey,
      config.vapidPrivateKey
    );
    console.log('Web Push configured successfully');
  }
} catch (e) {
  console.log('web-push не установлен. Установите: npm install web-push');
  webpush = null;
}

const router = express.Router();

// Сохранить подписку на push уведомления
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { userId, subscription } = req.body;
    
    if (!subscription) {
      return res.status(400).json({ message: 'Subscription required' });
    }

    await User.findByIdAndUpdate(
      userId,
      { 
        $addToSet: { pushSubscriptions: subscription }
      },
      { new: true }
    );

    res.json({ message: 'Subscription saved' });
  } catch (error) {
    console.error('Ошибка при сохранении подписки:', error);
    res.status(500).json({ message: 'Ошибка при сохранении подписки' });
  }
});

// Удалить подписку на push уведомления
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    
    await User.findByIdAndUpdate(
      userId,
      { pushSubscriptions: [] },
      { new: true }
    );

    res.json({ message: 'Unsubscribed' });
  } catch (error) {
    console.error('Ошибка при удалении подписки:', error);
    res.status(500).json({ message: 'Ошибка при удалении подписки' });
  }
});

// Получить все уведомления пользователя по типу или все
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query; // 'parcels', 'invoices', 'announcements' или empty для всех

    const query = { userId };
    if (type) query.type = type;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Ошибка при получении уведомлений:', error);
    res.status(500).json({ message: 'Ошибка при получении уведомлений' });
  }
});

// Получить счетчик непрочитанных
router.get('/:userId/unread-count', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    res.json({ unreadCount });
  } catch (error) {
    console.error('Ошибка при получении счетчика:', error);
    res.status(500).json({ message: 'Ошибка при получении счетчика' });
  }
});

// Отметить уведомление как прочитанное
router.patch('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );
    res.json(notification);
  } catch (error) {
    console.error('Ошибка при отметке как прочитанное:', error);
    res.status(500).json({ message: 'Ошибка при обновлении уведомления' });
  }
});

// Отметить все уведомления как прочитанные
router.patch('/:userId/read-all', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    res.json({ message: 'Все уведомления отмечены как прочитанные' });
  } catch (error) {
    console.error('Ошибка при отметке всех как прочитанные:', error);
    res.status(500).json({ message: 'Ошибка при обновлении уведомлений' });
  }
});

// Удалить уведомление
router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    await Notification.findByIdAndDelete(notificationId);
    res.json({ message: 'Уведомление удалено' });
  } catch (error) {
    console.error('Ошибка при удалении уведомления:', error);
    res.status(500).json({ message: 'Ошибка при удалении уведомления' });
  }
});

// Отправить push уведомление (внутренний маршрут, не для клиента)
router.post('/:userId/send-push', async (req, res) => {
  try {
    if (!webpush) {
      return res.status(503).json({ message: 'Push notifications not available' });
    }

    const { userId } = req.params;
    const { title, message, data } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      return res.status(404).json({ message: 'No push subscriptions found' });
    }

    const payload = JSON.stringify({
      title: title || '291cargo',
      message,
      data
    });

    // Отправляем push всем подпискам пользователя
    const promises = user.pushSubscriptions.map(subscription => {
      return webpush.sendNotification(subscription, payload).catch(error => {
        console.error('Error sending push notification:', error);
        // Удаляем мертвые подписки
        if (error.statusCode === 410) {
          User.findByIdAndUpdate(userId, {
            $pull: { pushSubscriptions: subscription }
          }).catch(err => console.error('Error removing subscription:', err));
        }
      });
    });

    await Promise.all(promises);
    res.json({ message: 'Push notifications sent' });
  } catch (error) {
    console.error('Ошибка при отправке push:', error);
    res.status(500).json({ message: 'Ошибка при отправке push' });
  }
});

// Создать уведомление (для тестирования и внутреннего использования)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { userId, type, title, message, data } = req.body;
    
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data
    });

    await notification.save();

    // Отправляем push уведомление (если web-push установлен)
    if (webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      try {
        await webpush.sendNotification(userId, title, message, data).catch(err => {
          console.log('Push не отправлено (возможно, сервис недоступен):', err.message);
        });
      } catch (pushError) {
        console.log('Push error (non-critical):', pushError.message);
      }
    }

    res.status(201).json(notification);
  } catch (error) {
    console.error('Ошибка при создании уведомления:', error);
    res.status(500).json({ message: 'Ошибка при создании уведомления' });
  }
});

module.exports = router;

