const config = require('../config/default.json');

let webpush;
try {
  webpush = require('web-push');
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(
      'mailto:support@akdani.com',
      config.vapidPublicKey,
      config.vapidPrivateKey
    );
  }
} catch (error) {
  console.log('web-push not available');
  webpush = null;
}

/**
 * Отправить push уведомление пользователю
 * @param {Object} user - Объект пользователя с pushSubscriptions
 * @param {String} title - Заголовок уведомления
 * @param {String} message - Текст уведомления
 * @param {Object} data - Дополнительные данные
 */
async function sendPushToUser(user, title, message, data = {}) {
  if (!webpush || !user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
    console.log(`⚠️ Push не отправлено: webpush=${!!webpush}, subscriptions=${user?.pushSubscriptions?.length || 0}`);
    return;
  }

  console.log(`📤 Отправка push для пользователя ${user._id}: "${title}"`);

  const payload = JSON.stringify({
    title,
    message,
    data
  });

  for (const subscription of user.pushSubscriptions) {
    try {
      await webpush.sendNotification(subscription, payload);
      console.log(`✅ Push успешно отправлен пользователю ${user._id}`);
    } catch (error) {
      console.error('❌ Push notification error:', error.message, `(statusCode: ${error.statusCode})`);
      // Удаляем мертвую подписку если ошибка 410 (Gone)
      if (error.statusCode === 410) {
        console.log(`🗑️  Удаление мертвой подписки для пользователя ${user._id}`);
        const User = require('../models/User');
        User.findByIdAndUpdate(user._id, {
          $pull: { pushSubscriptions: subscription }
        }).then(() => {
          console.log(`✅ Мертвая подписка удалена`);
        }).catch(err => console.error('❌ Error removing subscription:', err));
      }
    }
  }
}

/**
 * Отправить push по userId
 * @param {String} userId - ID пользователя
 * @param {String} title - Заголовок уведомления
 * @param {String} message - Текст уведомления
 * @param {Object} data - Дополнительные данные
 */
async function sendPushByUserId(userId, title, message, data = {}) {
  const User = require('../models/User');
  const user = await User.findById(userId);
  if (user) {
    await sendPushToUser(user, title, message, data);
  }
}

module.exports = {
  sendPushToUser,
  sendPushByUserId
};
