const subscriptionService = require("../modules/foundation/services/subscription.service");
const subscriptionRepository = require("../modules/foundation/repositories/subscription.repository");

const { HttpError } = require("../utils/http-error");

const ALLOWED_STATUSES = ["trialing", "active", "past_due"];

async function requireValidSubscription(req, res, next) {
    try {
        if (!req.auth?.tenantId) {
            return next(new HttpError(401, "UNAUTHORIZED", "Authentication required"));
        }

        const subscription = await subscriptionService.getByTenantId(req.auth.tenantId);
        if (!subscription) {
            return next(new HttpError(403, "SUBSCRIPTION_NOT_FOUND", "No subscription found for this tenant"));
        }

        const expired = subscription.endDate && new Date(subscription.endDate) < new Date();
        if (expired) {
            if (ALLOWED_STATUSES.includes(subscription.status)) {
                await subscriptionRepository.updateStatus(subscription._id, "cancelled");
            }
            return next(new HttpError(403, "SUBSCRIPTION_EXPIRED", "Your subscription has expired. Please renew to continue"));
        }

        if (!ALLOWED_STATUSES.includes(subscription.status)) {
            return next(new HttpError(403, "SUBSCRIPTION_SUSPENDED", "Your subscription is not active"));
        }

        req.subscription = subscription;
        return next();
    } catch (error) {
        return next(error);
    }
}

function requireModule(moduleKey) {
    return (req, res, next) => {
        const subscription = req.subscription;
        if (!subscription) {
            return next(new HttpError(403, "SUBSCRIPTION_INACTIVE", "A valid subscription is required"));
        }

        const entry = (subscription.modules || []).find((mod) => mod.key === moduleKey);
        if (!entry || !entry.enabled) {
            return next(new HttpError(403, "MODULE_NOT_ENABLED", `The '${moduleKey}' module is not enabled on your subscription`));
        }

        return next();
    };
}

module.exports = { requireValidSubscription, requireModule };