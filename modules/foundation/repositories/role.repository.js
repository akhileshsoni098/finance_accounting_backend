const Role = require("../models/role");

async function create(data, options = {}) {
    const [doc] = await Role.create([data], options);
    return doc;
}

async function findByIdAndTenant(id, tenantId, options = {}) {
    return Role.findOne({ _id: id, tenantId }).session(options.session);
}

async function findByTenantId(tenantId, options = {}) {
    return Role.find({ tenantId }).sort({ createdAt: 1 }).session(options.session);
}

async function findByKeyAndTenant(key, tenantId, options = {}) {
    return Role.findOne({ tenantId, key }).session(options.session);
}

async function updateById(id, data, options = {}) {
    return Role.findByIdAndUpdate(id, data, {
        returnDocument: "after",
        runValidators: true,
        session: options.session,
    });
}

async function deleteById(id, options = {}) {
    return Role.findByIdAndDelete(id).session(options.session);
}

module.exports = {
    create,
    findByIdAndTenant,
    findByTenantId,
    findByKeyAndTenant,
    updateById,
    deleteById,
};