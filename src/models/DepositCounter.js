const mongoose = require('mongoose');

const depositCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

// Atomic increment function
depositCounterSchema.statics.getNextIndex = async function() {
  const counter = await this.findByIdAndUpdate(
    'deposit_index',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.model('DepositCounter', depositCounterSchema);
