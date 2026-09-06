const Tenant = require("../models/tenant");

async function create(data, options = {}) {
    const [doc] = await Tenant.create([data], options);
    return doc;
}

async function findById(id, options = {}) {
    return Tenant.findById(id).session(options.session);
}

async function findByCode(code, options = {}) {
    return Tenant.findOne({ code: code.toUpperCase() }).session(options.session);
}

module.exports = { create, findById, findByCode };