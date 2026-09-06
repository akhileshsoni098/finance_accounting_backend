const subscriptionService = require("../services/subscription.service");
const { validateSubscriptionId, validateUpdateSubscription } = require("../validators/subscription.validator");

const { HttpError } = require("../../../utils/http-error");

async function getSubscription(req, res, next) {
    try {
        const subscription = await subscriptionService.getByTenantId(req.auth.tenantId);
        if (!subscription) {
            throw new HttpError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");
        }
        res.json({ subscription: subscriptionService.toPublic(subscription) });
    } catch (error) {
        next(error);
    }
}

async function updateSubscription(req, res, next) {
    try {
        validateSubscriptionId(req.params.id);
        const data = validateUpdateSubscription(req.body);
        const subscription = await subscriptionService.updateSubscription(req.params.id, req.auth.tenantId, data);
        res.json({ subscription: subscriptionService.toPublic(subscription) });
    } catch (error) {
        next(error);
    }
}

module.exports = { getSubscription, updateSubscription };