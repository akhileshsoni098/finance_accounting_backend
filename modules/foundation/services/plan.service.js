const planRepository = require("../repositories/plan.repository");

const { HttpError } = require("../../../utils/http-error");

async function listPlans(options = {}) {
    return planRepository.findActive(options);
}

async function getPlanByKey(key, options = {}) {
    const plan = await planRepository.findByKey(key, options);
    if (!plan) {
        throw new HttpError(404, "PLAN_NOT_FOUND", "Plan not found");
    }
    return plan;
}

function toPublic(plan) {
    return {
        id: plan._id,
        key: plan.key,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        limits: plan.limits,
        modules: plan.modules,
    };
}

module.exports = { listPlans, getPlanByKey, toPublic };