const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    url: {
        type: String,
        required: false
    },
    title: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    imageUrl: {
        type: String,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

const Banner = mongoose.model('Banner', bannerSchema);
module.exports = Banner;
