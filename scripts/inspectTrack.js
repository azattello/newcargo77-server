const mongoose = require('mongoose');
const config = require('../config/default.json');
// Ensure referenced models are registered before populating
require('../models/Status');
const Track = require('../models/Track');

async function run() {
  try {
    console.log('Connecting to DB...');
    await mongoose.connect(config.dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected.');

    const trackNumber = process.argv[2] || 'AS12345678';
    console.log('Looking up track:', trackNumber);

    const track = await Track.findOne({ track: { $regex: new RegExp(`^${trackNumber}$`, 'i') } })
      .populate('status')
      .populate('history.status')
      .lean();

    if (!track) {
      console.log('Track not found');
    } else {
      console.log(JSON.stringify(track, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
