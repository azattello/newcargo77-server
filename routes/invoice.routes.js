const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const { sendPushToUser } = require('../utils/pushHelper');

// Получить неоплаченный счет пользователя
router.get('/:userId/current-invoice', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId).populate('invoices.bookmarks.trackId');

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const currentInvoice = user.invoices.find(invoice => invoice.status === 'pending');

    if (!currentInvoice) {
      return res.status(200).json({ message: 'Нет неоплаченных счетов' });
    }

    return res.status(200).json(currentInvoice);
  } catch (error) {
    console.error('Ошибка при получении неоплаченного счета:', error);
    return res.status(500).json({ message: 'Ошибка при получении счета' });
  }
});

// Добавить новые товары в неоплаченный счет
router.post('/:userId/update-invoice', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newBookmarks } = req.body;
    
    console.log(`📝 Обновление счета для пользователя: ${userId}`);
    console.log(`📦 Новые закладки:`, newBookmarks);
    
    if (!newBookmarks || !Array.isArray(newBookmarks) || newBookmarks.length === 0) {
      console.log(`⚠️ Нет закладок для обновления`);
      return res.status(400).json({ message: 'Нет закладок для добавления' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ Пользователь не найден: ${userId}`);
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Получаем неоплаченный счет или создаем новый, если его нет
    let invoice = user.invoices.find(inv => inv.status === 'pending');
    if (!invoice) {
      console.log(`📄 Создание нового счета`);
      invoice = {
        totalAmount: 0,
        totalWeight: 0,
        totalItems: 0,
        bookmarks: [],
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      user.invoices.push(invoice);
    } else {
      console.log(`📄 Счет найден, добавляем товары`);
    }

    let itemsAdded = false; // Флаг для отслеживания добавления товаров

    newBookmarks.forEach(bookmark => {
      const { trackNumber, price, weight } = bookmark;

      const existingInInvoice = invoice.bookmarks.some(b => b.trackNumber === trackNumber);
      const isAlreadyPaid = user.bookmarks.some(b => b.trackNumber === trackNumber && b.isPaid);

      // Пропускаем закладки без цены и веса
      if (!price || !weight || existingInInvoice || isAlreadyPaid) {
        console.log(`⚠️ Закладка ${trackNumber} пропущена: цена=${price}, вес=${weight}, вУч=${existingInInvoice}, опл=${isAlreadyPaid}`);
        return; // Пропускаем такие закладки
      }

      const parsedPrice = parseFloat(price);
      const parsedWeight = parseFloat(weight);

      if (isNaN(parsedPrice) || isNaN(parsedWeight)) {
        console.log(`⚠️ Закладка ${trackNumber} пропущена: цена/вес некорректны`);
        return;
      }

      // Добавляем товар в счет и обновляем его общие параметры
      invoice.bookmarks.push(bookmark);
      invoice.totalAmount += parsedPrice;
      invoice.totalWeight += parsedWeight;
      invoice.totalItems += 1;
      itemsAdded = true;
      console.log(`✅ Товар добавлен: ${trackNumber}, цена=${parsedPrice}, вес=${parsedWeight}`);
    });

    // Если ни один товар не был добавлен и счет не содержит товаров, удаляем его из массива
    if (!itemsAdded && invoice.totalItems === 0) {
      user.invoices = user.invoices.filter(inv => inv !== invoice); // Убираем счет из массива
      console.log('⚠️ Ни один товар не был добавлен. Счет не будет создан или сохранен.');
    } else {
      // Обновляем дату последнего изменения счета
      invoice.updatedAt = Date.now();
    }

    await user.save();
    console.log(`✅ Счет сохранен. itemsAdded: ${itemsAdded}, totalItems: ${invoice.totalItems}, totalAmount: ${invoice.totalAmount}`);
    console.log(`✅ Счет сохранен. itemsAdded: ${itemsAdded}, totalItems: ${invoice.totalItems}, totalAmount: ${invoice.totalAmount}`);

    // Отправляем уведомление о новом счете
    if (itemsAdded) {
      console.log(`💬 Создание уведомления о счете для пользователя ${userId}`);
      const notification = new Notification({
        userId,
        type: 'invoices',
        title: 'Новый счет на оплату',
        message: `Вам был назначен счет на оплату - сумма: ${invoice.totalAmount} ₸, вес: ${invoice.totalWeight} кг`,
        isRead: false,
        data: {
          invoiceId: invoice._id,
          amount: invoice.totalAmount,
          weight: invoice.totalWeight,
          itemCount: invoice.totalItems
        }
      });
      
      try {
        const savedNotification = await notification.save();
        console.log(`✅ Уведомление сохранено: ${savedNotification._id}`);
      } catch (notifError) {
        console.error(`❌ Ошибка при сохранении уведомления:`, notifError.message);
      }
      
      // Отправляем push уведомление
      try {
        const updatedUser = await User.findById(userId);
        if (updatedUser) {
          console.log(`📤 Отправка push пользователю ${userId}`);
          await sendPushToUser(updatedUser, 'Новый счет на оплату', 
            `Вам был назначен счет на оплату - сумма: ${invoice.totalAmount} ₸, вес: ${invoice.totalWeight} кг`, {
              invoiceId: invoice._id,
              amount: invoice.totalAmount,
              weight: invoice.totalWeight
            }
          );
        } else {
          console.log(`⚠️ Пользователь не найден для отправки push: ${userId}`);
        }
      } catch (pushError) {
        console.error(`❌ Ошибка при отправке push:`, pushError.message);
      }
    } else {
      console.log(`⚠️ itemsAdded=false, уведомление не будет отправлено`);
    }

    res.status(200).json(invoice);
  } catch (error) {
    console.error('❌ Ошибка при обновлении счета:', error.message);
    res.status(500).json({ message: 'Ошибка при обновлении счета', error: error.message });
  }
});




// Подтвердить оплату счета и рассчитать бонусы для реферера
router.post('/:userId/confirm-payment/:invoiceId', async (req, res) => {
    try {
        const { userId, invoiceId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const invoice = user.invoices.id(invoiceId);
        if (!invoice) {
            return res.status(404).json({ message: 'Счет не найден' });
        }

        // Проверяем, что счет еще не оплачен
        if (invoice.status === 'paid') {
            return res.status(400).json({ message: 'Счет уже оплачен' });
        }

        // Подтверждаем оплату
        invoice.status = 'paid';
        invoice.updatedAt = Date.now();

        // Устанавливаем статус оплаты для каждого трека в счете
        invoice.bookmarks.forEach(invoiceBookmark => {
          const bookmark = user.bookmarks.find(b => b.trackNumber === invoiceBookmark.trackNumber);
          if (bookmark) {
            bookmark.isPaid = true; // Устанавливаем статус оплаты
          }
        });
        
        // Рассчитываем общую сумму оплаты
        let totalPrice = invoice.totalAmount;

        // Получаем глобальный процент бонуса из настроек
        const settings = await Settings.findOne();
        const globalBonusPercentage = settings ? parseFloat(settings.globalReferralBonusPercentage) : 0;
        
        let userBonusPercentage;

        // Определяем процент бонуса для реферера
        if (user.referrer) {
            const referrer = await User.findById(user.referrer);
            userBonusPercentage = referrer?.referralBonusPercentage || globalBonusPercentage;
        } else {
            userBonusPercentage = globalBonusPercentage;
        }

        // Вычисляем сумму бонуса
        const bonusAmount = parseFloat((totalPrice * (userBonusPercentage / 100)).toFixed(1));

        // Начисляем бонус рефереру, если он существует
        if (user.referrer) {
            const referrer = await User.findById(user.referrer);
            if (referrer) {
                referrer.bonuses = (referrer.bonuses || 0) + bonusAmount;
                await referrer.save();
            }
        }

        // Сохраняем изменения пользователя
        await user.save();

        res.status(200).json({ message: 'Оплата подтверждена и бонус начислен', invoice });
    } catch (error) {
        console.error('Ошибка при подтверждении оплаты счета:', error);
        res.status(500).json({ message: 'Ошибка при подтверждении оплаты счета' });
    }
});


  

module.exports = router;
