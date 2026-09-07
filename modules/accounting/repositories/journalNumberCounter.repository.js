const JournalNumberCounter = require("../models/journalNumberCounter");

function nextJournalNumber(tenantId, entityId, options = {}) {
    return JournalNumberCounter.findOneAndUpdate(
        { tenantId, entityId },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, ...options },
    ).then((counter) => counter.seq);
}

module.exports = { nextJournalNumber };