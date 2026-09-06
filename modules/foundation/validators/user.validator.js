const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STATUSES = ["invited", "active", "suspended", "disabled"];

function validateUserId(param) {
    if (!mongoose.isValidObjectId(param)) {
        throw new HttpError(400, "INVALID_INPUT", "userId must be a valid ObjectId");
    }
}

function validateCreateUser(body) {
    const errors = [];

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid user payload");
    }

    const forCreate = ["displayName", "email", "password", "roleId"];
    for (const key of Object.keys(body)) {
        if (!forCreate.includes(key)) {
            errors.push(`Field '${key}' is not allowed for user creation`);
        }
    }

    if (!body.displayName || typeof body.displayName !== "string" || body.displayName.trim().length < 2 || body.displayName.trim().length > 160) {
        errors.push("displayName must be between 2 and 160 characters");
    }

    if (!body.email || !EMAIL_RE.test(body.email)) {
        errors.push("email is invalid");
    }

    if (!body.password || typeof body.password !== "string" || body.password.length < 8) {
        errors.push("password must be at least 8 characters");
    }

    if (!body.roleId || !mongoose.isValidObjectId(body.roleId)) {
        errors.push("roleId must be a valid ObjectId");
    }

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }
}

function validateUpdateUser(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid user update payload");
    }

    const ALLOWED_UPDATE_FIELDS = ["displayName", "email", "avatar", "roleId", "status"];

    for (const key of Object.keys(body)) {
        if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
            throw new HttpError(400, "VALIDATION_ERROR", `Field '${key}' is not allowed for user update`);
        }
    }

    if (body.displayName !== undefined) {
        if (typeof body.displayName !== "string" || body.displayName.trim().length < 2 || body.displayName.trim().length > 160) {
            throw new HttpError(400, "VALIDATION_ERROR", "displayName must be between 2 and 160 characters");
        }
        body.displayName = body.displayName.trim();
    }

    if (body.email !== undefined) {
        if (typeof body.email !== "string" || !EMAIL_RE.test(body.email)) {
            throw new HttpError(400, "VALIDATION_ERROR", "email is invalid");
        }
        body.email = body.email.trim().toLowerCase();
    }

    if (body.avatar !== undefined) {
        if (typeof body.avatar !== "string" || body.avatar.length > 500) {
            throw new HttpError(400, "VALIDATION_ERROR", "avatar must be a string up to 500 characters");
        }
        body.avatar = body.avatar.trim();
    }

    if (body.roleId !== undefined && !mongoose.isValidObjectId(body.roleId)) {
        throw new HttpError(400, "VALIDATION_ERROR", "roleId must be a valid ObjectId");
    }

    if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status)) {
        throw new HttpError(400, "VALIDATION_ERROR", "status must be one of invited, active, suspended, disabled");
    }
}

module.exports = { validateUserId, validateCreateUser, validateUpdateUser };