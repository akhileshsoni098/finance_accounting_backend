const FiscalPeriod = require("../models/fiscalPeriod");

function create(data, options = {}) {
    return FiscalPeriod.create([data], options).then(([period]) => period);
}

function findByTenantId(tenantId, entityId, filters = {}, options = {}) {
    const query = { tenantId, entityId };
    if (filters.status) query.status = filters.status;
    if (filters.fiscalYear) query.fiscalYear = Number(filters.fiscalYear);
    return FiscalPeriod.find(query, null, options).sort({ startDate: 1, code: 1 });
}

function findByIdAndTenant(id, tenantId, entityId, options = {}) {
    return FiscalPeriod.findOne({ _id: id, tenantId, entityId }, null, options);
}

function findByCode(tenantId, entityId, code, options = {}) {
    return FiscalPeriod.findOne({ tenantId, entityId, code }, null, options);
}

function findOverlapping(tenantId, entityId, startDate, endDate, excludeId, options = {}) {
    const query = {
        tenantId,
        entityId,
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
    };
    if (excludeId) query._id = { $ne: excludeId };
    return FiscalPeriod.findOne(query, null, options);
}

function findCurrent(tenantId, entityId, options = {}) {
    return FiscalPeriod.findOne({ tenantId, entityId, isCurrent: true }, null, options);
}

function findPeriodForDate(tenantId, entityId, transactionDate, options = {}) {
    return FiscalPeriod.findOne(
        {
            tenantId,
            entityId,
            startDate: { $lte: transactionDate },
            endDate: { $gte: transactionDate },
        },
        null,
        options,
    );
}

function countByEntityId(tenantId, entityId, options = {}) {
    return FiscalPeriod.countDocuments({ tenantId, entityId }, options);
}

function unsetCurrent(tenantId, entityId, options = {}) {
    return FiscalPeriod.updateMany(
        { tenantId, entityId, isCurrent: true },
        { $set: { isCurrent: false } },
        options,
    );
}

function updateById(id, update, options = {}) {
    return FiscalPeriod.findByIdAndUpdate(
        id,
        update,
        { new: true, returnDocument: "after", runValidators: true, ...options },
    );
}

module.exports = {
    create,
    findByTenantId,
    findByIdAndTenant,
    findByCode,
    findOverlapping,
    findCurrent,
    findPeriodForDate,
    countByEntityId,
    unsetCurrent,
    updateById,
};