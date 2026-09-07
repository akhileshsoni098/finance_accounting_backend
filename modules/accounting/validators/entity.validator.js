const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_RE = /^https?:\/\/.+/i;
const CODE_RE = /^[A-Za-z0-9]{2,12}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const TYPES = ["mga", "broker", "carrier", "insured", "agency", "reinsurer"];
const STATUSES = ["active", "suspended", "inactive"];

const ADDRESS_FIELDS = ["line1", "line2", "city", "state", "country", "postalCode"];

const CREATE_FIELDS = [
    "type",
    "code",
    "name",
    "legalName",
    "registrationNumber",
    "taxId",
    "email",
    "phone",
    "website",
    "address",
    "currency",
    "parentEntityId",
    "status",
    "notes",
];

const UPDATE_FIELDS = [
    "name",
    "legalName",
    "registrationNumber",
    "taxId",
    "email",
    "phone",
    "website",
    "address",
    "currency",
    "parentEntityId",
    "status",
    "notes",
];

function validateEntityId(param) {
    if (!mongoose.isValidObjectId(param)) {
        throw new HttpError(400, "INVALID_INPUT", "entityId must be a valid ObjectId");
    }
}

function validateAddress(address) {
    const errors = [];
    const normalized = {};

    if (!address || typeof address !== "object" || Array.isArray(address)) {
        errors.push("address must be an object");
        return { errors, value: null };
    }

    for (const key of Object.keys(address)) {
        if (!ADDRESS_FIELDS.includes(key)) {
            errors.push(`Field '${key}' is not allowed in address`);
        }
    }

    for (const field of ADDRESS_FIELDS) {
        if (address[field] !== undefined && address[field] !== null) {
            if (typeof address[field] !== "string") {
                errors.push(`address.${field} must be a string`);
            } else {
                normalized[field] = address[field].trim();
            }
        }
    }

    return { errors, value: normalized };
}

function normalizeContacts(data, errors) {
    if (data.email !== undefined && data.email !== "" && data.email !== null) {
        if (typeof data.email !== "string" || !EMAIL_RE.test(data.email) || data.email.length > 254) {
            errors.push("email is invalid");
        } else {
            data.email = data.email.trim().toLowerCase();
        }
    } else {
        delete data.email;
    }

    if (data.phone !== undefined && data.phone !== "" && data.phone !== null) {
        if (typeof data.phone !== "string" || data.phone.length > 30) {
            errors.push("phone must be a string up to 30 characters");
        } else {
            data.phone = data.phone.trim();
        }
    } else {
        delete data.phone;
    }

    if (data.website !== undefined && data.website !== "" && data.website !== null) {
        if (typeof data.website !== "string" || !WEBSITE_RE.test(data.website) || data.website.length > 200) {
            errors.push("website must be a valid URL starting with http(s)");
        } else {
            data.website = data.website.trim();
        }
    } else {
        delete data.website;
    }
}

function validateAddressField(data, errors) {
    if (data.address !== undefined && data.address !== null) {
        const { errors: addressErrors, value } = validateAddress(data.address);
        errors.push(...addressErrors);
        data.address = value;
    } else {
        delete data.address;
    }
}

function validateParentEntityId(data, errors, options = {}) {
    const { rejectNull = false } = options;
    if (data.parentEntityId !== undefined) {
        if (data.parentEntityId === null) {
            if (rejectNull) {
                delete data.parentEntityId;
            }
        } else if (!mongoose.isValidObjectId(data.parentEntityId)) {
            errors.push("parentEntityId must be a valid ObjectId");
        }
    } else {
        delete data.parentEntityId;
    }
}

function validateCreateEntity(body) {
    const errors = [];

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid entity payload");
    }

    for (const key of Object.keys(body)) {
        if (!CREATE_FIELDS.includes(key)) {
            errors.push(`Field '${key}' is not allowed for entity creation`);
        }
    }

    if (!TYPES.includes(body.type)) {
        errors.push(`type must be one of: ${TYPES.join(", ")}`);
    }

    if (!body.code || !CODE_RE.test(body.code)) {
        errors.push("code must be 2-12 characters");
    } else {
        body.code = body.code.trim().toUpperCase();
    }

    if (!body.name || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160) {
        errors.push("name must be a non-empty string up to 160 characters");
    } else {
        body.name = body.name.trim();
    }

    if (body.legalName !== undefined && body.legalName !== "" && body.legalName !== null) {
        if (typeof body.legalName !== "string" || body.legalName.length > 200) {
            errors.push("legalName must be a string up to 200 characters");
        } else {
            body.legalName = body.legalName.trim();
        }
    }

    if (body.registrationNumber !== undefined && body.registrationNumber !== "" && body.registrationNumber !== null) {
        if (typeof body.registrationNumber !== "string" || body.registrationNumber.length > 60) {
            errors.push("registrationNumber must be a string up to 60 characters");
        } else {
            body.registrationNumber = body.registrationNumber.trim();
        }
    }

    if (body.taxId !== undefined && body.taxId !== "" && body.taxId !== null) {
        if (typeof body.taxId !== "string" || body.taxId.length > 40) {
            errors.push("taxId must be a string up to 40 characters");
        } else {
            body.taxId = body.taxId.trim();
        }
    }

    normalizeContacts(body, errors);
    validateAddressField(body, errors);

    if (body.currency !== undefined) {
        if (typeof body.currency !== "string" || !CURRENCY_RE.test(body.currency)) {
            errors.push("currency must be a 3-letter code like USD");
        } else {
            body.currency = body.currency.trim().toUpperCase();
        }
    }

    validateParentEntityId(body, errors, { rejectNull: true });

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

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }

    return body;
}

function validateUpdateEntity(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid entity update payload");
    }

    for (const key of Object.keys(body)) {
        if (!UPDATE_FIELDS.includes(key)) {
            throw new HttpError(400, "VALIDATION_ERROR", `Field '${key}' is not allowed for entity update`);
        }
    }

    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160) {
            throw new HttpError(400, "VALIDATION_ERROR", "name must be a non-empty string up to 160 characters");
        }
        body.name = body.name.trim();
    }

    if (body.legalName !== undefined && body.legalName !== "" && body.legalName !== null) {
        if (typeof body.legalName !== "string" || body.legalName.length > 200) {
            throw new HttpError(400, "VALIDATION_ERROR", "legalName must be a string up to 200 characters");
        }
        body.legalName = body.legalName.trim();
    }

    if (body.registrationNumber !== undefined && body.registrationNumber !== "" && body.registrationNumber !== null) {
        if (typeof body.registrationNumber !== "string" || body.registrationNumber.length > 60) {
            throw new HttpError(400, "VALIDATION_ERROR", "registrationNumber must be a string up to 60 characters");
        }
        body.registrationNumber = body.registrationNumber.trim();
    }

    if (body.taxId !== undefined && body.taxId !== "" && body.taxId !== null) {
        if (typeof body.taxId !== "string" || body.taxId.length > 40) {
            throw new HttpError(400, "VALIDATION_ERROR", "taxId must be a string up to 40 characters");
        }
        body.taxId = body.taxId.trim();
    }

    const errors = [];
    normalizeContacts(body, errors);
    validateAddressField(body, errors);
    if (errors.length) {
        throw new HttpError(400, "VALIDATION_ERROR", errors.join("; "));
    }

    if (body.currency !== undefined) {
        if (typeof body.currency !== "string" || !CURRENCY_RE.test(body.currency)) {
            throw new HttpError(400, "VALIDATION_ERROR", "currency must be a 3-letter code like USD");
        }
        body.currency = body.currency.trim().toUpperCase();
    }

    validateParentEntityId(body, errors);
    if (errors.length) {
        throw new HttpError(400, "VALIDATION_ERROR", errors.join("; "));
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

module.exports = { validateEntityId, validateCreateEntity, validateUpdateEntity };