const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");

const ALLOWED_UPDATE_FIELDS = ["name", "email", "phone", "website", "logo", "setupStage", "status"];
const STATUS_VALUES = ["active", "suspended", "inactive"];
const SETUP_STAGE_VALUES = ["registration", "organization", "accounting", "complete"];

function validateObjectId(value, label) {
    if (!mongoose.isValidObjectId(value)) {
        throw new HttpError(400, "INVALID_INPUT", `${label} must be a valid ObjectId`);
    }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateTenantUpdate(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid tenant update payload");
    }

    for (const key of Object.keys(data)) {
        if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
            throw new HttpError(400, "VALIDATION_ERROR", `Field '${key}' is not allowed for tenant update`);
        }
    }

    if (data.name !== undefined) {
        if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 160) {
            throw new HttpError(400, "VALIDATION_ERROR", "name must be a non-empty string up to 160 characters");
        }
        data.name = data.name.trim();
    }

    if (data.email !== undefined) {
        if (data.email === "") {
            data.email = undefined;
        } else if (typeof data.email !== "string" || !EMAIL_RE.test(data.email) || data.email.length > 254) {
            throw new HttpError(400, "VALIDATION_ERROR", "email must be a valid email address");
        } else {
            data.email = data.email.trim().toLowerCase();
        }
    }

    if (data.phone !== undefined) {
        if (typeof data.phone !== "string" || data.phone.length > 30) {
            throw new HttpError(400, "VALIDATION_ERROR", "phone must be a string up to 30 characters");
        }
        data.phone = data.phone.trim();
    }

    if (data.website !== undefined) {
        if (typeof data.website !== "string" || data.website.length > 200) {
            throw new HttpError(400, "VALIDATION_ERROR", "website must be a string up to 200 characters");
        }
        data.website = data.website.trim();
    }

    if (data.logo !== undefined) {
        if (typeof data.logo !== "string" || data.logo.length > 500) {
            throw new HttpError(400, "VALIDATION_ERROR", "logo must be a string up to 500 characters");
        }
        data.logo = data.logo.trim();
    }

    if (data.status !== undefined && !STATUS_VALUES.includes(data.status)) {
        throw new HttpError(400, "VALIDATION_ERROR", "status must be one of active, suspended, inactive");
    }

    if (data.setupStage !== undefined && !SETUP_STAGE_VALUES.includes(data.setupStage)) {
        throw new HttpError(400, "VALIDATION_ERROR", "setupStage must be one of registration, organization, accounting, complete");
    }
}

module.exports = { validateObjectId, validateTenantUpdate };