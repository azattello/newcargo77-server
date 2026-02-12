const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const trackSchema = new Schema({
  track: { type: String, required: true },          // оригинальный трек номер
  trackNormalized: { type: String, required: true, index: true }, // для поиска
  status: { type: Schema.Types.ObjectId, ref: 'Status', required: true },
  filial: { type: mongoose.Types.ObjectId, ref: 'Filial' },
  user: { type: String }, // телефон как строка
  history: {
    type: [{
      _id: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
      status: { type: Schema.Types.ObjectId, ref: 'Status' },
      date: { type: Date, default: Date.now }
    }],
    default: []
  },
  notifiedHistoryIds: { type: [Schema.Types.ObjectId], default: [] }, // для отслеживания уведомленных статусов
  price: { type: Number, default: 0 },   // если нужно для фронта
  weight: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save hook для автоматической нормализации трека
trackSchema.pre('save', function(next) {
  if (this.track) {
    this.trackNormalized = this.track.replace(/\s+/g, '').toUpperCase();
  }
  this.updatedAt = new Date();
  next();
});

const Track = mongoose.model('Track', trackSchema);

module.exports = Track;
