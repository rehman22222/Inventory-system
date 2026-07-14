const mongoose = require("mongoose");

// Atomic sequence source for human-readable receipt numbers (POS-000001).
const CounterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", CounterSchema);

// Returns the next value for a named sequence. Safe under concurrent tills.
module.exports.nextSequence = async (name, session) => {
  const options = { new: true, upsert: true };
  if (session) options.session = session;

  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    options
  );

  return counter.seq;
};

module.exports.Counter = Counter;
