// scripts/seedChildHistory.js
const mongoose = require('mongoose');
const ChildHistory = require('../src/models/ChildHistory');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');

    const record = {
      _id: '69d63aebb84927854e566a23',
      HistoryID: 1,
      PID: 4364,
      WIPID: 9498,
      History: 'lscs for non porgresion labour',
      AddInfo: '',
      HistoryType: 'Birth History',
      CreatedBy: 0,
      CreatedOn: new Date('2014-11-17T11:22:28.787Z'),
      IsRemove: false,
      IsUserDefined: false,
    };

    // Upsert the record
    await ChildHistory.updateOne({ _id: record._id }, record, { upsert: true });
    console.log('ChildHistory record upserted');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding ChildHistory:', err);
    process.exit(1);
  }
})();
