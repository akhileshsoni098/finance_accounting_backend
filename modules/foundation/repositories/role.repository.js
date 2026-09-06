const Role = require("../models/role");

async function create(data, options = {}) {
    const [doc] = await Role.create([data], options);
    return doc;
}

async function findByIdAndTenant(id, tenantId, options = {}) {
    return Role.findOne({ _id: id, tenantId }).session(options.session);
}

module.exports = { create, findByIdAndTenant };