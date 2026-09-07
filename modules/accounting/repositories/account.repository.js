const Account = require("../models/account");

function create(data, options = {}) {
    return Account.create([data], options).then(([account]) => account);
}

function findByTenantId(tenantId, filters = {}, options = {}) {
    const query = { tenantId };
    if (filters.accountType) query.accountType = filters.accountType;
    if (filters.status) query.status = filters.status;
    if (filters.allowPosting !== undefined) query.allowPosting = Boolean(filters.allowPosting);
    return Account.find(query, null, options).sort({ sortOrder: 1, code: 1 });
}

function findByEntityId(tenantId, entityId, filters = {}, options = {}) {
    const query = { tenantId, entityId };
    if (filters.accountType) query.accountType = filters.accountType;
    if (filters.status) query.status = filters.status;
    if (filters.allowPosting !== undefined) query.allowPosting = Boolean(filters.allowPosting);
    return Account.find(query, null, options).sort({ sortOrder: 1, code: 1 });
}

function findByIdAndTenant(id, tenantId, options = {}) {
    return Account.findOne({ _id: id, tenantId }, null, options);
}

function findByIdAndEntity(id, tenantId, entityId, options = {}) {
    return Account.findOne({ _id: id, tenantId, entityId }, null, options);
}

function findByCode(tenantId, entityId, code, options = {}) {
    return Account.findOne({ tenantId, entityId, code }, null, options);
}

function countByEntityId(tenantId, entityId, options = {}) {
    return Account.countDocuments({ tenantId, entityId }, options);
}

function updateById(id, update, options = {}) {
    return Account.findByIdAndUpdate(
        id,
        update,
        { new: true, returnDocument: "after", runValidators: true, ...options },
    );
}

module.exports = {
    create,
    findByTenantId,
    findByEntityId,
    findByIdAndTenant,
    findByIdAndEntity,
    findByCode,
    countByEntityId,
    updateById,
};