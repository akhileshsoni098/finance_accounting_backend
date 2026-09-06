const crypto = require("crypto");

const subscriptionRepository = require("../repositories/subscription.repository");
const planRepository = require("../repositories/plan.repository");
const paymentRepository = require("../repositories/payment.repository");

const { HttpError } = require("../../../utils/http-error");

const CYCLE_DAYS = {
    monthly: 30,
    quarterly: 90,
    yearly: 365,
};

async function collectDummyPayment({ tenantId, subscriptionId, planKey }, options = {}) {
    const subscription = await subscriptionRepository.findByIdAndTenant(subscriptionId, tenantId, options);
    if (!subscription) {
        throw new HttpError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    }

    const plan = await planRepository.findByKey(planKey, options);
    if (!plan || plan.status !== "active") {
        throw new HttpError(400, "PLAN_UNAVAILABLE", "Selected plan is not available");
    }

    const now = new Date();
    const cycleDays = CYCLE_DAYS[plan.billingCycle] || 30;
    const endDate = new Date(now.getTime() + cycleDays * 24 * 60 * 60 * 1000);

    subscription.plan = plan.key;
    subscription.status = "active";
    subscription.billingCycle = plan.billingCycle;
    subscription.limits = {
        users: plan.limits.users,
        storageGB: plan.limits.storageGB,
        entities: plan.limits.entities,
        monthlyBordereaux: plan.limits.monthlyBordereaux,
    };
    subscription.modules = (plan.modules || []).map((entry) => ({
        key: entry.key,
        enabled: true,
        features: entry.features || [],
    }));
    subscription.endDate = endDate;
    await subscription.save(options);

    const payment = await paymentRepository.create(
        {
            tenantId,
            subscriptionId,
            plan: plan.key,
            amount: plan.price,
            currency: plan.currency,
            method: "card",
            provider: "dummy",
            status: "paid",
            reference: `DMP-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
            paidAt: now,
        },
        options,
    );

    return { payment, subscription };
}

function toPublicPayment(payment) {
    return {
        id: payment._id,
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        provider: payment.provider,
        status: payment.status,
        reference: payment.reference,
        cardLast4: payment.cardLast4,
        paidAt: payment.paidAt,
    };
}

module.exports = { collectDummyPayment, toPublicPayment };