const { HttpError } = require("../../../utils/http-error");
const { validateEntityId } = require("./entity.validator");

const { isValidObjectId: isObjectId } = require("mongoose");

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];
const NORMAL_BALANCES = ["debit", "credit"];
const STATUSES = ["active", "inactive"];
const ACCOUNT_CODE_RE = /^[A-Z0-9-_]{2,20}$/;

const BALANCE_BY_TYPE = {
    asset: "debit",
    expense: "debit",
    liability: "credit",
    equity: "credit",
    revenue: "credit",
};

const CREATE_FIELDS = [
    "code",
    "name",
    "description",
    "accountType",
    "accountSubtype",
    "parentAccountId",
    "normalBalance",
    "isControlAccount",
    "allowPosting",
    "status",
    "sortOrder",
    "notes",
];

const UPDATE_FIELDS = [
    "name",
    "description",
    "accountSubtype",
    "parentAccountId",
    "normalBalance",
    "isControlAccount",
    "allowPosting",
    "status",
    "sortOrder",
    "notes",
];

function validateAccountId(id) {
    if (!id || !isObjectId(String(id))) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid account id");
    }
}

function validateParentAccountId(body, errors) {
    if (body.parentAccountId === undefined) return;
    if (body.parentAccountId === null || body.parentAccountId === "") {
        body.parentAccountId = null;
        return;
    }
    if (!isObjectId(String(body.parentAccountId))) {
        errors.push("parentAccountId must be a valid ObjectId");
    }
}

function validateBooleanField(field, label, errors) {
    if (field !== undefined && typeof field !== "boolean") {
        errors.push(`${label} must be a boolean`);
    }
}

function validateSortOrder(value, errors) {
    if (value !== undefined) {
        if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
            errors.push("sortOrder must be a non-negative integer");
        }
    }
}

function validateCreateAccount(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid account payload");
    }

    for (const key of Object.keys(body)) {
        if (!CREATE_FIELDS.includes(key)) {
            throw new HttpError(400, "INVALID_INPUT", `Field '${key}' is not allowed for account creation`);
        }
    }

    const errors = [];

    if (body.code !== undefined) {
        if (typeof body.code !== "string" || !ACCOUNT_CODE_RE.test(String(body.code).trim())) {
            errors.push("code must be 2-20 characters using letters, numbers, hyphen, or underscore");
        } else {
            body.code = body.code.trim().toUpperCase();
        }
    }

    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160) {
            errors.push("name must be a non-empty string up to 160 characters");
        } else {
            body.name = body.name.trim();
        }
    }

    if (body.description !== undefined && body.description !== "" && body.description !== null) {
        if (typeof body.description !== "string" || body.description.length > 500) {
            errors.push("description must be a string up to 500 characters");
        } else {
            body.description = body.description.trim();
        }
    }

    if (body.accountType !== undefined) {
        if (!ACCOUNT_TYPES.includes(body.accountType)) {
            errors.push(`accountType must be one of: ${ACCOUNT_TYPES.join(", ")}`);
        }
    }

    if (body.accountSubtype !== undefined && body.accountSubtype !== "" && body.accountSubtype !== null) {
        if (typeof body.accountSubtype !== "string" || body.accountSubtype.length > 80) {
            errors.push("accountSubtype must be a string up to 80 characters");
        } else {
            body.accountSubtype = body.accountSubtype.trim();
        }
    }

    validateParentAccountId(body, errors);
    validateBooleanField(body.isControlAccount, "isControlAccount", errors);
    validateBooleanField(body.allowPosting, "allowPosting", errors);
    validateSortOrder(body.sortOrder, errors);

    if (body.status !== undefined && !STATUSES.includes(body.status)) {
        errors.push(`status must be one of: ${STATUSES.join(", ")}`);
    }

    if (body.notes !== undefined && body.notes !== "" && body.notes !== null) {
        if (typeof body.notes !== "string" || body.notes.length > 500) {
            errors.push("notes must be a string up to 500 characters");
        } else {
            body.notes = body.notes.trim();
        }
    }

    if (body.code === undefined) errors.push("code is required");
    if (body.name === undefined) errors.push("name is required");
    if (body.accountType === undefined) errors.push("accountType is required");

    if (body.accountType && ACCOUNT_TYPES.includes(body.accountType)) {
        const derived = BALANCE_BY_TYPE[body.accountType];
        if (body.normalBalance === undefined) {
            body.normalBalance = derived;
        } else if (body.normalBalance !== derived) {
            errors.push(`normalBalance must be '${derived}' for ${body.accountType} accounts`);
        }
    } else if (body.normalBalance !== undefined && !NORMAL_BALANCES.includes(body.normalBalance)) {
        errors.push(`normalBalance must be one of: ${NORMAL_BALANCES.join(", ")}`);
    }

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }

    return body;
}

function validateUpdateAccount(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid account update payload");
    }

    if (body.accountType !== undefined) {
        throw new HttpError(400, "ACCOUNT_TYPE_IMMUTABLE", "accountType cannot be changed after creation");
    }

    for (const key of Object.keys(body)) {
        if (!UPDATE_FIELDS.includes(key)) {
            throw new HttpError(400, "VALIDATION_ERROR", `Field '${key}' is not allowed for account update`);
        }
    }

    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160) {
            throw new HttpError(400, "VALIDATION_ERROR", "name must be a non-empty string up to 160 characters");
        }
        body.name = body.name.trim();
    }

    if (body.description !== undefined && body.description !== "" && body.description !== null) {
        if (typeof body.description !== "string" || body.description.length > 500) {
            throw new HttpError(400, "VALIDATION_ERROR", "description must be a string up to 500 characters");
        }
        body.description = body.description.trim();
    }

    if (body.accountSubtype !== undefined && body.accountSubtype !== "" && body.accountSubtype !== null) {
        if (typeof body.accountSubtype !== "string" || body.accountSubtype.length > 80) {
            throw new HttpError(400, "VALIDATION_ERROR", "accountSubtype must be a string up to 80 characters");
        }
        body.accountSubtype = body.accountSubtype.trim();
    }

    const errors = [];
    validateParentAccountId(body, errors);
    validateBooleanField(body.isControlAccount, "isControlAccount", errors);
    validateBooleanField(body.allowPosting, "allowPosting", errors);
    validateSortOrder(body.sortOrder, errors);
    if (errors.length) {
        throw new HttpError(400, "VALIDATION_ERROR", errors.join("; "));
    }

    if (body.normalBalance !== undefined && !NORMAL_BALANCES.includes(body.normalBalance)) {
        throw new HttpError(400, "VALIDATION_ERROR", `normalBalance must be one of: ${NORMAL_BALANCES.join(", ")}`);
    }

    if (body.status !== undefined && !STATUSES.includes(body.status)) {
        throw new HttpError(400, "VALIDATION_ERROR", `status must be one of: ${STATUSES.join(", ")}`);
    }

    if (body.notes !== undefined && body.notes !== "" && body.notes !== null) {
        if (typeof body.notes !== "string" || body.notes.length > 500) {
            throw new HttpError(400, "VALIDATION_ERROR", "notes must be a string up to 500 characters");
        }
        body.notes = body.notes.trim();
    }

    return body;
}

module.exports = { validateAccountId, validateEntityId, validateCreateAccount, validateUpdateAccount, BALANCE_BY_TYPE };