const SubscriptionPlan = require("../models/plan");

async function findActive(options = {}) {
    return SubscriptionPlan.find({ status: "active" }).sort({ price: 1 }).session(options.session);
}

async function findByKey(key, options = {}) {
    return SubscriptionPlan.findOne({ key }).session(options.session);
}

async function upsertByKey(data, options = {}) {
    return SubscriptionPlan.findOneAndUpdate(
        { key: data.key },
        data,
        { upsert: true, returnDocument: "after", runValidators: true, session: options.session },
    );
}

module.exports = { findActive, findByKey, upsertByKey };