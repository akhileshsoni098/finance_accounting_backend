const { HttpError } = require("../../../utils/http-error");
const Tenant = require("../models/tenant");

const BUSINESS_TYPES = Tenant.schema.path("businessType").enumValues;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(payload) {
    const errors = [];
    const tenant = payload?.tenant || {};
    const admin = payload?.admin || {};

    if (!tenant.name || typeof tenant.name !== "string" || tenant.name.trim().length < 2) {
        errors.push("tenant.name must be at least 2 characters");
    }
    if (!tenant.code || !/^[A-Za-z0-9]{2,12}$/.test(tenant.code)) {
        errors.push("tenant.code must be 2-12 alphanumeric characters");
    }
    if (!BUSINESS_TYPES.includes(tenant.businessType)) {
        errors.push(`tenant.businessType must be one of: ${BUSINESS_TYPES.join(", ")}`);
    }
    if (tenant.email && !EMAIL_RE.test(tenant.email)) {
        errors.push("tenant.email is invalid");
    }

    if (
        !admin.displayName ||
        typeof admin.displayName !== "string" ||
        admin.displayName.trim().length < 2
    ) {
        errors.push("admin.displayName must be at least 2 characters");
    }
    if (!admin.email || !EMAIL_RE.test(admin.email)) {
        errors.push("admin.email is invalid");
    }
    if (!admin.password || typeof admin.password !== "string" || admin.password.length < 8) {
        errors.push("admin.password must be at least 8 characters");
    }

    if (errors.length > 0) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }
}

function validateLogin(body) {
    const errors = [];
    if (!body.email || !EMAIL_RE.test(body.email)) {
        errors.push("email is invalid");
    }
    if (!body.password || typeof body.password !== "string" || body.password.length < 1) {
        errors.push("password is required");
    }
    if (errors.length > 0) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }
}

module.exports = { validateRegister, validateLogin };