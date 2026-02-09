const mongoose = require('mongoose');
const fs = require('fs');
const User = require('./models/User'); // путь к твоей модели User

// функция нормализации трек-номеров
function normalizeTrack(str = '') {
  return String(str).replace(/\s+/g, '').toUpperCase();
}

async function migrate() {
  try {
    await mongoose.connect('mongodb+srv://azatabdykalli_db_user:tT1cx5x7apMw7ymy@vypercargo.xlazzha.mongodb.net/?retryWrites=true&w=majority&appName=vypercargo', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    const users = await User.find({});
    const backup = [];

    for (const user of users) {
      let updated = false;

      // Сохраняем резервную копию ключевых полей
      backup.push({
        _id: user._id,
        phone: user.phone,
        bookmarks: user.bookmarks.map(b => ({ trackNumber: b.trackNumber, trackNormalized: b.trackNormalized })),
        archive: user.archive.map(a => ({ trackNumber: a.trackNumber, trackNormalized: a.trackNormalized }))
      });

      // --- миграция phone ---
      if (typeof user.phone === 'Double') {
        user.phone = String(user.phone);
        updated = true;
      }

      // --- миграция bookmarks ---
      if (user.bookmarks && user.bookmarks.length > 0) {
        user.bookmarks.forEach(b => {
          if (!b.trackNormalized) {
            b.trackNormalized = normalizeTrack(b.trackNumber);
            updated = true;
          }
        });
      }

      // --- миграция archive ---
      if (user.archive && user.archive.length > 0) {
        user.archive.forEach(a => {
          if (!a.trackNormalized) {
            a.trackNormalized = normalizeTrack(a.trackNumber);
            updated = true;
          }
        });
      }

      if (updated) {
        await user.save();
        console.log(`Updated user ${user._id}`);
      }
    }

    // Сохраняем резервную копию в файл
    fs.writeFileSync(`./user_migration_backup_${Date.now()}.json`, JSON.stringify(backup, null, 2));
    console.log('Backup saved!');

    console.log('Migration completed successfully.');
    mongoose.disconnect();
  } catch (err) {
    console.error('Migration error:', err);
    mongoose.disconnect();
  }
}

migrate();
