const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const LoyaltyLevelSchema = new Schema({
    minPoints: { type: Number, required: true },
    maxPoints: { type: Number, default: null }, // null = Infinity
    level: { type: String, required: true },
    tariff: { type: Number, required: true }
});

module.exports = model('LoyaltyLevel', LoyaltyLevelSchema);
