const { HttpError } = require("../../../utils/http-error");
const { validateEntityId } = require("./entity.validator");

const { isValidObjectId: isObjectId } = require("mongoose");

const PERIOD_CODE_RE = /^[A-Z0-9-_]{1,30}$/;
const PERIOD_STATUSES = ["open", "closed", "locked"];

const CREATE_FIELDS = [
    "code",
    "name",
    "startDate",
    "endDate",
    "fiscalYear",
    "notes",
    "isCurrent",
];

const UPDATE_FIELDS = [
    "name",
    "startDate",
    "endDate",
    "fiscalYear",
    "notes",
];

function validateFiscalPeriodId(id) {
    if (!id || !isObjectId(String(id))) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid fiscal period id");
    }
}

function validateCode(value, errors) {
    if (value !== undefined) {
        if (typeof value !== "string") {
            errors.push("code must be 1-30 characters using letters, numbers, hyphen, or underscore");
            return undefined;
        }
        const normalized = value.trim().toUpperCase();
        if (!PERIOD_CODE_RE.test(normalized)) {
            errors.push("code must be 1-30 characters using letters, numbers, hyphen, or underscore");
            return undefined;
        }
        return normalized;
    }
    return undefined;
}

function validateName(value, errors) {
    if (value !== undefined) {
        if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
            errors.push("name must be a non-empty string up to 100 characters");
        } else {
            return value.trim();
        }
    }
    return undefined;
}

function validateDate(value, label, errors) {
    if (value === undefined) return undefined;
    const parsed = new Date(value);
    if (typeof value !== "string" || Number.isNaN(parsed.getTime())) {
        errors.push(`${label} must be a valid date`);
        return undefined;
    }
    return parsed;
}

function validateFiscalYear(value, errors) {
    if (value !== undefined) {
        if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < 1900 ||
            value > 2100
        ) {
            errors.push("fiscalYear must be an integer between 1900 and 2100");
            return undefined;
        }
        return value;
    }
    return undefined;
}

function validateNotes(value, errors) {
    if (value !== undefined && value !== "" && value !== null) {
        if (typeof value !== "string" || value.length > 500) {
            errors.push("notes must be a string up to 500 characters");
        } else {
            return value.trim();
        }
    }
    return undefined;
}

function validateIsCurrent(value, errors) {
    if (value !== undefined && typeof value !== "boolean") {
        errors.push("isCurrent must be a boolean");
        return undefined;
    }
    return value;
}

function validateCreateFiscalPeriod(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid fiscal period payload");
    }

    for (const key of Object.keys(body)) {
        if (!CREATE_FIELDS.includes(key)) {
            throw new HttpError(
                400,
                "INVALID_INPUT",
                `Field '${key}' is not allowed for fiscal period creation`,
            );
        }
    }

    const errors = [];

    body.code = validateCode(body.code, errors);
    body.name = validateName(body.name, errors);
    body.startDate = validateDate(body.startDate, "startDate", errors);
    body.endDate = validateDate(body.endDate, "endDate", errors);
    body.fiscalYear = validateFiscalYear(body.fiscalYear, errors);
    body.notes = validateNotes(body.notes, errors);
    body.isCurrent = validateIsCurrent(body.isCurrent, errors);

    if (body.code === undefined) errors.push("code is required");
    if (body.name === undefined) errors.push("name is required");
    if (body.startDate === undefined) errors.push("startDate is required");
    if (body.endDate === undefined) errors.push("endDate is required");

    if (
        body.startDate instanceof Date &&
        body.endDate instanceof Date &&
        body.endDate.getTime() < body.startDate.getTime()
    ) {
        errors.push("endDate must be on or after startDate");
    }

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }

    return body;
}

function validateUpdateFiscalPeriod(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid fiscal period update payload");
    }

    for (const key of Object.keys(body)) {
        if (!UPDATE_FIELDS.includes(key)) {
            throw new HttpError(
                400,
                "VALIDATION_ERROR",
                `Field '${key}' is not allowed for fiscal period update`,
            );
        }
    }

    const errors = [];

    body.name = validateName(body.name, errors);
    body.startDate = validateDate(body.startDate, "startDate", errors);
    body.endDate = validateDate(body.endDate, "endDate", errors);
    body.fiscalYear = validateFiscalYear(body.fiscalYear, errors);
    body.notes = validateNotes(body.notes, errors);

    if (
        body.startDate instanceof Date &&
        body.endDate instanceof Date &&
        body.endDate.getTime() < body.startDate.getTime()
    ) {
        errors.push("endDate must be on or after startDate");
    }

    if (errors.length) {
        throw new HttpError(400, "VALIDATION_ERROR", errors.join("; "));
    }

    return body;
}

module.exports = { validateFiscalPeriodId, validateEntityId, validateCreateFiscalPeriod, validateUpdateFiscalPeriod, PERIOD_STATUSES };