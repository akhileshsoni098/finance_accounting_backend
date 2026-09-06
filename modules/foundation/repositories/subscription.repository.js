const Subscription = require("../models/subscription");

async function create(data, options = {}) {
    const [doc] = await Subscription.create([data], options);
    return doc;
}

async function findByTenantId(tenantId, options = {}) {
    return Subscription.findOne({ tenantId }).session(options.session);
}

module.exports = { create, findByTenantId };