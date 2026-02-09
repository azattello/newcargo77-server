const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// Вспомогательная функция для нормализации трек-номеров
function normalizeTrack(str = '') {
  return String(str).replace(/\s+/g, '').toUpperCase();
}

// Схема для закладок треков
const TrackBookmarkSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  description: { type: String, required: true },
  trackNumber: { type: String, required: true },
  trackNormalized: { type: String, required: false, default: '' }, // не обязательно для совместимости со старыми данными
  trackId: { type: Schema.Types.ObjectId, ref: 'Track', required: false },
  currentStatus: { type: Schema.Types.ObjectId, ref: 'Status', default: null }
});

// Схема для архива закладок
const ArchiveBookmarkSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  description: { type: String, required: true },
  trackNumber: { type: String, required: true },
  trackNormalized: { type: String, required: false, default: '' }, // не обязательно для совместимости
  history: {
    type: [{
      status: { type: Schema.Types.ObjectId, ref: 'Status' },
      date: { type: Date, default: Date.now }
    }],
    default: []
  },
  receivedAt: { type: Date, required: false } // дата получения
});

// Схема для счетов
const InvoiceSchema = new Schema({
  itemCount: { type: Number, required: true },
  totalWeight: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// История бонусов
const BonusHistorySchema = new Schema({
  type: { type: String, required: true }, // registration, invite, order, spend
  amount: { type: Number, required: true }, // +/- баллы
  description: { type: String, required: false },
  date: { type: Date, default: Date.now }
});

// =======================
// Основная схема пользователя
// =======================
const UserSchema = new Schema({
  phone: { type: Number, required: true, unique: true }, // Number чтобы совпадать с существующими данными
  password: { type: String, required: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  email: { type: String, required: false },
  role: { type: String, default: "client" },
  createdAt: { type: Date, default: Date.now },

  // --- Профиль ---
  profilePhoto: { type: String, required: false },
  selectedFilial: { type: String, required: false },

  // --- Лояльность ---
  bonuses: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  bonusHistory: { type: [BonusHistorySchema], default: [] },
  level: { type: String, default: 'Bronze' },
  personalRate: { type: String, required: false },

  // --- Рефералы ---
  referrer: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  referralBonusPercentage: { type: Number, default: null },

  // --- Привязки ---
  personalId: { type: String, required: false },

  // --- Push уведомления ---
  pushSubscriptions: {
    type: [{ type: Schema.Types.Mixed }],
    default: []
  },

  // --- Операции ---
  bookmarks: [TrackBookmarkSchema],
  archive: [ArchiveBookmarkSchema],
  invoices: [InvoiceSchema]
});

// pre-save middleware для автоматической нормализации трек-номеров в закладках
UserSchema.pre('save', function(next) {
  // Нормализуем номер телефона (убираем спецсимволы)
  if (this.phone) {
    this.phone = String(this.phone).replace(/\D/g, '');
  }

  if (this.bookmarks && this.bookmarks.length > 0) {
    this.bookmarks.forEach(b => {
      b.trackNormalized = normalizeTrack(b.trackNumber);
    });
  }

  if (this.archive && this.archive.length > 0) {
    this.archive.forEach(a => {
      a.trackNormalized = normalizeTrack(a.trackNumber);
    });
  }

  next();
});

module.exports = model('User', UserSchema);
