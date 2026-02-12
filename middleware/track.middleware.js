const Track = require('../models/Track');
const Settings = require('../models/Settings');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Status = require('../models/Status');
const { sendPushToUser } = require('../utils/pushHelper');

const normalize = (s = '') => String(s).replace(/\s+/g, '').toUpperCase();

const updateTrack = async (req, res, next) => {
    try {
        const { track, status, date } = req.body;

        // Получаем объект статуса
        let statusObj = null;
        if (status) {
            statusObj = await Status.findById(status);
        }

        // Проверяем, существует ли трек с переданным номером
        let existingTrack = await Track.findOne({ track });

        if (!existingTrack) {
            // Если трек не существует, создаем новую запись
            const newTrack = new Track({
                track,
                trackNormalized: normalize(track),
                status,
                history: [{ status, date }]
            });
            // Сохраняем новый трек
            await newTrack.save();
            return res.status(201).json({ message: 'Новая запись трека успешно создана' });
        } else {
            // Если трек существует, обновляем его данные
            const oldStatus = existingTrack.status;
            existingTrack.status = status;

            // Добавляем новую запись в историю
            existingTrack.history.push({ status, date });

            // Сохраняем обновленный трек
            await existingTrack.save();

            // Отправляем уведомления пользователям, у которых есть этот трек в закладках
            await sendTrackNotifications(track, statusObj, date);

            return res.status(200).json({ message: 'Данные трека успешно обновлены' });
        }

    } catch (error) {
        console.error('Ошибка при обновлении или создании трека:', error);
        return res.status(500).json({ message: 'Произошла ошибка при обновлении или создании трека' });
        next(error);
    }
};

// Функция для отправки уведомлений пользователям
async function sendTrackNotifications(trackNumber, statusObj, historyDate) {
    try {
        // Проверяем, прошла ли уже дата статуса
        if (historyDate) {
            const statusDate = new Date(historyDate);
            const now = new Date();
            if (statusDate > now) {
                console.log(`⏳ Статус ${statusObj?.statusText} для трека ${trackNumber} имеет будущую дату ${historyDate}, уведомление не отправляется`);
                return; // Не отправляем уведомление, так как дата еще не наступила
            }
        }

        // Находим всех пользователей, у которых этот трек в закладках
        const users = await User.find({ 
            'bookmarks.trackNumber': trackNumber 
        });

        if (!users || users.length === 0) {
            console.log(`🔍 Пользователи с треком ${trackNumber} не найдены`);
            return;
        }

        console.log(`📦 Найдено ${users.length} пользователей с треком ${trackNumber}`);

        const statusText = statusObj?.statusText || 'Статус обновлён';
        const message = `трек ${trackNumber} - добавлен новый статус ${statusText}`;

        for (const user of users) {
            // Создаем уведомление
            const notification = new Notification({
                userId: user._id,
                type: 'parcels',
                title: 'Обновление статуса посылки',
                message,
                isRead: false,
                data: {
                    trackNumber,
                    status: statusText,
                    statusId: statusObj?._id
                }
            });

            await notification.save();
            console.log(`✅ Уведомление создано для пользователя ${user._id}`);
            
            // Отправляем push уведомление
            await sendPushToUser(user, 'Обновление статуса посылки', message, {
                trackNumber,
                status: statusText
            });
        }
    } catch (error) {
        console.error('❌ Ошибка при отправке уведомлений:', error);
    }
}




const excelTrack = async (req, res, next) => {
    try {
        const { tracks, status, date } = req.body;

        console.log(`📊 Массовое обновление треков: ${tracks.length} шт`);

        // Получаем объект статуса
        let statusObj = null;
        if (status) {
            statusObj = await Status.findById(status);
        }

        // Получаем список уже существующих треков
        const existingTracks = await Track.find({ track: { $in: tracks } });

        // Разделяем массив треков на существующие и новые
        const existingTrackNumbers = existingTracks.map(track => track.track);
        const newTracksData = tracks.filter(track => !existingTrackNumbers.includes(track))
            .map(track => ({
                track,
                trackNormalized: normalize(track),
                status,
                history: [{ status, date }]
            }));

        // Обновляем данные существующих треков
        await Track.updateMany({ track: { $in: existingTrackNumbers } }, {
            $set: { status },
            $push: { history: { status, date } }
        });

        // Убедимся, что у существующих треков есть поле trackNormalized
        for (const tr of existingTrackNumbers) {
            await Track.updateOne({ track: tr, trackNormalized: { $exists: false } }, { $set: { trackNormalized: normalize(tr) } });
        }

        // Добавляем новые треки
        if (newTracksData.length > 0) {
            await Track.insertMany(newTracksData);
        }

        // Отправляем уведомления для всех обновленных треков
        console.log(`📬 Отправка уведомлений для ${existingTrackNumbers.length} треков...`);
        const notificationPromises = existingTrackNumbers.map(trackNumber => 
            sendTrackNotifications(trackNumber, statusObj, date).catch(err => {
                console.error(`❌ Ошибка при отправке уведомлений для трека ${trackNumber}:`, err.message);
            })
        );
        
        await Promise.all(notificationPromises);
        console.log(`✅ Все уведомления отправлены`);

        return res.status(200).json({ message: 'Данные треков успешно обновлены или созданы' });

    } catch (error) {
        console.error('❌ Ошибка при обновлении или создании треков:', error);
        return res.status(500).json({ message: 'Произошла ошибка при обновлении или создании треков' });
        next(error);
    }
};



module.exports = { updateTrack, excelTrack};
