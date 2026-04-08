const mongoose = require('mongoose');

const ChildHistorySchema = new mongoose.Schema({
  HistoryID: {
    type: Number,
  },
  PID: {
    type: Number,
    required: true
  },
  WIPID: {
    type: Number
  },
  History: {
    type: String,
    required: true
  },
  AddInfo: {
    type: String,
    default: ""
  },
  HistoryType: {
    type: String
  },
  CreatedBy: {
    type: Number,
    default: 0
  },
  CreatedOn: {
    type: Date,
    default: Date.now
  },
  IsRemove: {
    type: Boolean,
    default: false
  },
  IsUserDefined: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index on PID for faster querying of a patient's history
ChildHistorySchema.index({ PID: 1 });

module.exports = mongoose.model('ChildHistory', ChildHistorySchema);
