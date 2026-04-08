// scripts/listChildHistories.js
const mongoose = require('mongoose');
const ChildHistory = require('../src/models/ChildHistory');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const docs = await ChildHistory.find({}).lean();
    console.log('ChildHistories:', JSON.stringify(docs, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error fetching child histories:', err);
    process.exit(1);
  }
})();
