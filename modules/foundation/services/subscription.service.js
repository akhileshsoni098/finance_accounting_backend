const subscriptionRepository = require("../repositories/subscription.repository");
const { MODULE_FEATURES } = require("../constants/modules");

const { HttpError } = require("../../../utils/http-error");

const TRIAL_DAYS = 30;

async function createDefaultSubscription(tenantId, options = {}) {
    const now = new Date();
    return subscriptionRepository.create(
        {
            tenantId,
            modules: [{ key: "accounting", enabled: true, features: MODULE_FEATURES.accounting }],
            startDate: now,
            endDate: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
            limits: { users: 5, storageGB: 10, entities: 1, monthlyBordereaux: 100 },
        },
        options,
    );
}

async function getByTenantId(tenantId, options = {}) {
    return subscriptionRepository.findByTenantId(tenantId, options);
}

async function getByIdAndTenant(id, tenantId, options = {}) {
    return subscriptionRepository.findByIdAndTenant(id, tenantId, options);
}

async function updateSubscription(id, tenantId, data, options = {}) {
    const subscription = await subscriptionRepository.findByIdAndTenant(id, tenantId, options);
    if (!subscription) {
        throw new HttpError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    }

    const update = {};
    if (data.plan !== undefined) update.plan = data.plan;
    if (data.status !== undefined) update.status = data.status;
    if (data.billingCycle !== undefined) update.billingCycle = data.billingCycle;
    if (data.modules !== undefined) {
        update.modules = data.modules.map((entry) => {
            const existing = (subscription.modules || []).find((mod) => mod.key === entry.key);
            const features = existing?.features?.length
                ? existing.features
                : MODULE_FEATURES[entry.key] || [];
            return { key: entry.key, enabled: entry.enabled, features };
        });
    }
    if (data.limits !== undefined) {
        update.limits = { ...subscription.limits.toObject(), ...data.limits };
    }
    if (data.endDate !== undefined) update.endDate = data.endDate;

    return subscriptionRepository.updateById(id, update, options);
}

function toPublic(subscription) {
    return {
        id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        modules: subscription.modules,
        limits: subscription.limits,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
    };
}

module.exports = {
    createDefaultSubscription,
    getByTenantId,
    getByIdAndTenant,
    updateSubscription,
    toPublic,
};