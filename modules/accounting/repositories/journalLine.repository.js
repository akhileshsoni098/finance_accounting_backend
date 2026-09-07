const JournalLine = require("../models/journalLine");

function createMany(data, options = {}) {
    return JournalLine.insertMany(data, { ordered: true, ...options });
}

function findManyByJournalId(journalEntryId, options = {}) {
    return JournalLine.find({ journalEntryId }, null, options).sort({ lineNumber: 1 });
}

function findManyByJournalIds(journalEntryIds, options = {}) {
    return JournalLine.find({ journalEntryId: { $in: journalEntryIds } }, null, options).sort({
        lineNumber: 1,
    });
}

function deleteManyByJournalId(journalEntryId, options = {}) {
    return JournalLine.deleteMany({ journalEntryId }, options);
}

function findJournalIdsByAccount(tenantId, entityId, accountId, options = {}) {
    const filter = { tenantId, entityId, accountId };
    const query = JournalLine.distinct("journalEntryId", filter);
    if (options.session) query.session(options.session);
    return query;
}

module.exports = {
    createMany,
    findManyByJournalId,
    findManyByJournalIds,
    deleteManyByJournalId,
    findJournalIdsByAccount,
};