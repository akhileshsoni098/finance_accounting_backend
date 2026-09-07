const User = require("../models/user");

async function create(data, options = {}) {
    const [doc] = await User.create([data], options);
    return doc;
}

async function findByEmail(email, options = {}) {
    const query = User.findOne({ email: email.trim().toLowerCase() });
    if (options.includePassword) {
        query.select("+passwordHash");
    }
    return query.session(options.session);
}

async function findAllByEmail(email, options = {}) {
    const query = User.find({ email: email.trim().toLowerCase() });
    if (options.includePassword) {
        query.select("+passwordHash");
    }
    return query.session(options.session);
}

async function findById(id, options = {}) {
    return User.findById(id).session(options.session);
}

async function findByTenantId(tenantId, options = {}) {
    return User.find({ tenantId })
        .sort({ createdAt: -1 })
        .populate("roleId", "name key")
        .session(options.session);
}

async function findByIdAndTenant(id, tenantId, options = {}) {
    return User.findOne({ _id: id, tenantId })
        .populate("roleId", "name key")
        .session(options.session);
}

async function updateById(id, update, options = {}) {
    return User.findByIdAndUpdate(id, update, {
        returnDocument: "after",
        runValidators: true,
        session: options.session,
    })
        .populate("roleId", "name key")
        .session(options.session);
}

async function countByRoleId(roleId, options = {}) {
    return User.countDocuments({ roleId }).session(options.session);
}

module.exports = { create, findByEmail, findAllByEmail, findById, findByTenantId, findByIdAndTenant, updateById, countByRoleId };