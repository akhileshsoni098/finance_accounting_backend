const JournalEntry = require("../models/journalEntry");

function create(data, options = {}) {
    return JournalEntry.create([data], options).then(([journal]) => journal);
}

function findManyByTenant(tenantId, entityId, filters = {}, options = {}) {
    const query = { tenantId, entityId };
    if (filters.status) query.status = filters.status;
    if (filters.idIn) query._id = { $in: filters.idIn };
    if (filters.dateFrom || filters.dateTo) {
        query.entryDate = {};
        if (filters.dateFrom) query.entryDate.$gte = filters.dateFrom;
        if (filters.dateTo) query.entryDate.$lte = filters.dateTo;
    }
    return JournalEntry.find(query, null, options).sort({ entryDate: -1, journalNumber: -1 });
}

function findByIdAndTenant(id, tenantId, entityId, options = {}) {
    return JournalEntry.findOne({ _id: id, tenantId, entityId }, null, options);
}

function findByTenantIdAndIdempotencyKey(tenantId, idempotencyKey, options = {}) {
    if (!idempotencyKey) return Promise.resolve(null);
    return JournalEntry.findOne({ tenantId, idempotencyKey }, null, options);
}

function findByCounter(tenantId, entityId, seq, options = {}) {
    const journalNumber = `JE-${String(seq).padStart(6, "0")}`;
    return JournalEntry.findOne({ tenantId, entityId, journalNumber }, null, options);
}

function transitionToPosted(id, tenantId, entityId, updates, options = {}) {
    return JournalEntry.findOneAndUpdate(
        { _id: id, tenantId, entityId, status: "draft" },
        { $set: updates },
        { returnDocument: "after", runValidators: true, ...options },
    );
}

function updateById(id, update, options = {}) {
    return JournalEntry.findByIdAndUpdate(
        id,
        update,
        { returnDocument: "after", runValidators: true, ...options },
    );
}

function removeById(id, options = {}) {
    return JournalEntry.deleteOne({ _id: id }, options);
}

module.exports = {
    create,
    findManyByTenant,
    findByIdAndTenant,
    findByTenantIdAndIdempotencyKey,
    findByCounter,
    transitionToPosted,
    updateById,
    removeById,
};