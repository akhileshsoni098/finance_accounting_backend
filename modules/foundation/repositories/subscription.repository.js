const Subscription = require("../models/subscription");

async function create(data, options = {}) {
    const [doc] = await Subscription.create([data], options);
    return doc;
}

async function findByTenantId(tenantId, options = {}) {
    return Subscription.findOne({ tenantId }).session(options.session);
}

async function findByIdAndTenant(id, tenantId, options = {}) {
    return Subscription.findOne({ _id: id, tenantId }).session(options.session);
}

async function updateById(id, data, options = {}) {
    return Subscription.findByIdAndUpdate(id, data, {
        returnDocument: "after",
        runValidators: true,
        session: options.session,
    });
}

async function updateStatus(id, status, options = {}) {
    await Subscription.updateOne({ _id: id }, { $set: { status } }).session(options.session);
}

module.exports = { create, findByTenantId, findByIdAndTenant, updateById, updateStatus };