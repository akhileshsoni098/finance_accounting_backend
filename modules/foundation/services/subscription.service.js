const subscriptionRepository = require("../repositories/subscription.repository");

const TRIAL_DAYS = 30;

async function createDefaultSubscription(tenantId, options = {}) {
    const now = new Date();
    return subscriptionRepository.create(
        {
            tenantId,
            startDate: now,
            endDate: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
        options,
    );
}

async function getByTenantId(tenantId, options = {}) {
    return subscriptionRepository.findByTenantId(tenantId, options);
}

function toPublic(subscription) {
    return {
        id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        modules: subscription.modules,
        limits: subscription.limits,
    };
}

module.exports = { createDefaultSubscription, getByTenantId, toPublic };