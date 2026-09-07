const Entity = require("../models/entity");

async function create(data, options = {}) {
    const [doc] = await Entity.create([data], options);
    return doc;
}

async function findByTenantId(tenantId, options = {}) {
    return Entity.find({ tenantId })
        .sort({ createdAt: -1 })
        .session(options.session);
}

async function findByIdAndTenant(id, tenantId, options = {}) {
    return Entity.findOne({ _id: id, tenantId }).session(options.session);
}

async function updateById(id, update, options = {}) {
    return Entity.findByIdAndUpdate(id, update, {
        returnDocument: "after",
        runValidators: true,
        new: true,
        session: options.session,
    }).session(options.session);
}

async function countByTenantId(tenantId, options = {}) {
    return Entity.countDocuments({ tenantId }).session(options.session);
}

module.exports = { create, findByTenantId, findByIdAndTenant, updateById, countByTenantId };