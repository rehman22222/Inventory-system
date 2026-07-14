const mongoose = require("mongoose");

// Multi-document transactions need a replica set. Production (Atlas) is one, but
// a developer running a standalone mongod is not, and there the driver throws
// instead of degrading. So: try the transaction, and if the server tells us it
// can't do transactions, run the same work unsessioned rather than failing the
// sale. `work` receives a session (or null in the fallback path).
const unsupported = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  /transaction numbers are only allowed|transactions are not supported|replica set/i.test(
    error?.message || ""
  );

module.exports.runInTransaction = async (work) => {
  let session;

  try {
    session = await mongoose.startSession();
  } catch (error) {
    if (!unsupported(error)) throw error;
    return work(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (unsupported(error)) {
      console.warn("[txn] transactions unavailable on this MongoDB — running unsessioned");
      return work(null);
    }
    throw error;
  } finally {
    session.endSession();
  }
};
