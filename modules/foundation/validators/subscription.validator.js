const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");

const PLANS = ["trial", "starter", "professional", "enterprise"];
const STATUSES = ["trialing", "active", "past_due", "cancelled", "suspended"];
const CYCLES = ["monthly", "quarterly", "yearly"];
const LIMIT_KEYS = ["users", "storageGB", "entities", "monthlyBordereaux"];

function validateSubscriptionId(param) {
    if (!mongoose.isValidObjectId(param)) {
        throw new HttpError(400, "INVALID_INPUT", "subscriptionId must be a valid ObjectId");
    }
}

function validateUpdateSubscription(body) {
    const errors = [];
    const data = {};

    if (body.plan !== undefined) {
        if (!PLANS.includes(body.plan)) {
            errors.push(`plan must be one of: ${PLANS.join(", ")}`);
        } else {
            data.plan = body.plan;
        }
    }

    if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) {
            errors.push(`status must be one of: ${STATUSES.join(", ")}`);
        } else {
            data.status = body.status;
        }
    }

    if (body.billingCycle !== undefined) {
        if (!CYCLES.includes(body.billingCycle)) {
            errors.push(`billingCycle must be one of: ${CYCLES.join(", ")}`);
        } else {
            data.billingCycle = body.billingCycle;
        }
    }

    if (body.endDate !== undefined) {
        const date = new Date(body.endDate);
        if (Number.isNaN(date.getTime())) {
            errors.push("endDate must be a valid date");
        } else {
            data.endDate = date;
        }
    }

    if (body.modules !== undefined) {
        if (!Array.isArray(body.modules) || body.modules.length === 0) {
            errors.push("modules must be a non-empty array");
        } else {
            const normalized = [];
            for (const moduleEntry of body.modules) {
                const key = moduleEntry && moduleEntry.key;
                if (!key || typeof key !== "string" || !key.trim()) {
                    errors.push("each module must have a key");
                    continue;
                }
                normalized.push({
                    key: key.trim().toLowerCase(),
                    enabled: moduleEntry.enabled === undefined ? true : Boolean(moduleEntry.enabled),
                });
            }
            data.modules = normalized;
        }
    }

    if (body.limits !== undefined) {
        if (!body.limits || typeof body.limits !== "object" || Array.isArray(body.limits)) {
            errors.push("limits must be an object");
        } else {
            const limits = {};
            for (const key of LIMIT_KEYS) {
                if (body.limits[key] !== undefined && body.limits[key] !== null) {
                    const value = Number(body.limits[key]);
                    if (!Number.isFinite(value) || value < 0) {
                        errors.push(`limits.${key} must be a non-negative number`);
                    } else {
                        limits[key] = value;
                    }
                }
            }
            data.limits = limits;
        }
    }

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }
    return data;
}

module.exports = { validateSubscriptionId, validateUpdateSubscription };