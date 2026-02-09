const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['parcels', 'invoices', 'announcements'],
      required: true
    },
    title: String,
    message: {
      type: String,
      required: true
    },
    isRead: {
      type: Boolean,
      default: false
    },
    data: {
      trackNumber: String,
      invoiceId: mongoose.Schema.Types.ObjectId,
      announcementId: mongoose.Schema.Types.ObjectId,
      status: String,
      amount: Number,
      weight: Number,
      image: String,
      actionUrl: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', NotificationSchema);
