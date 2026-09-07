const { HttpError } = require("../../../utils/http-error");
const { validateEntityId } = require("./entity.validator");

const { isValidObjectId: isObjectId } = require("mongoose");

const CURRENCY_RE = /^[A-Z]{3}$/;
const JOURNAL_STATUSES = ["draft", "posted", "reversed"];

const CREATE_FIELDS = [
    "entryDate",
    "reference",
    "description",
    "currency",
    "source",
    "sourceId",
    "idempotencyKey",
    "notes",
    "lines",
];

const UPDATE_FIELDS = ["entryDate", "reference", "description", "currency", "notes", "lines"];

const MAX_JOURNAL_LINES = 100;
const MIN_JOURNAL_LINES = 2;

function validateJournalId(id) {
    if (!id || !isObjectId(String(id))) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid journal entry id");
    }
}

function validateEntryDate(value, label, errors) {
    if (value === undefined) return undefined;
    const parsed = new Date(value);
    if (typeof value !== "string" || Number.isNaN(parsed.getTime())) {
        errors.push(`${label} must be a valid date`);
        return undefined;
    }
    return parsed;
}

function validateText(value, label, max, errors) {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") {
        errors.push(`${label} must be a string up to ${max} characters`);
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
        errors.push(`${label} must be a string up to ${max} characters`);
        return undefined;
    }
    return trimmed;
}

function validateCurrency(value, errors) {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") {
        errors.push("currency must be a three-letter ISO code such as USD");
        return undefined;
    }
    const normalized = value.trim().toUpperCase();
    if (!CURRENCY_RE.test(normalized)) {
        errors.push("currency must be a three-letter ISO code such as USD");
        return undefined;
    }
    return normalized;
}

function normalizeJournalLines(lines, errors) {
    if (lines === undefined) return undefined;

    if (!Array.isArray(lines)) {
        throw new HttpError(400, "INVALID_JOURNAL", "lines must be an array");
    }

    if (lines.length < MIN_JOURNAL_LINES || lines.length > MAX_JOURNAL_LINES) {
        throw new HttpError(
            400,
            "INVALID_JOURNAL",
            `Journal must contain between ${MIN_JOURNAL_LINES} and ${MAX_JOURNAL_LINES} lines`,
        );
    }

    const normalized = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line || typeof line !== "object" || Array.isArray(line)) {
            throw new HttpError(
                400,
                "INVALID_JOURNAL_LINE",
                `Line ${i + 1} must be an object with accountId, debit and credit`,
            );
        }

        if (!line.accountId || !isObjectId(String(line.accountId))) {
            throw new HttpError(
                400,
                "INVALID_JOURNAL_LINE",
                `Line ${i + 1} must reference a valid account`,
            );
        }

        const accountId = String(line.accountId);

        const amounts = ["debit", "credit"].map((side) => {
            const value = line[side];
            if (
                typeof value !== "number" ||
                !Number.isInteger(value) ||
                value < 0 ||
                value > Number.MAX_SAFE_INTEGER
            ) {
                throw new HttpError(
                    400,
                    "INVALID_JOURNAL_LINE",
                    `Line ${i + 1} ${side} must be a non-negative integer amount in minor units`,
                );
            }
            return value;
        });
        const [debit, credit] = amounts;

        if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
            throw new HttpError(
                400,
                "INVALID_JOURNAL_LINE",
                `Line ${i + 1} must have exactly one positive debit or credit`,
            );
        }

        normalized.push({
            accountId,
            description: validateText(line.description, `line ${i + 1} description`, 500, errors) || undefined,
            debit,
            credit,
        });
    }

    const totalDebit = normalized.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = normalized.reduce((sum, line) => sum + line.credit, 0);
    if (totalDebit !== totalCredit) {
        throw new HttpError(
            400,
            "JOURNAL_NOT_BALANCED",
            "Journal must be balanced (total debit must equal total credit)",
        );
    }

    return normalized;
}

function validateCreateJournal(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "INVALID_INPUT", "Invalid journal entry payload");
    }

    for (const key of Object.keys(body)) {
        if (!CREATE_FIELDS.includes(key)) {
            throw new HttpError(
                400,
                "INVALID_INPUT",
                `Field '${key}' is not allowed for journal entry creation`,
            );
        }
    }

    const errors = [];

    body.entryDate = validateEntryDate(body.entryDate, "entryDate", errors);
    body.reference = validateText(body.reference, "reference", 100, errors);
    body.description = validateText(body.description, "description", 500, errors);
    body.currency = validateCurrency(body.currency, errors);
    body.source = validateText(body.source, "source", 60, errors);
    body.sourceId = validateText(body.sourceId, "sourceId", 40, errors);
    body.notes = validateText(body.notes, "notes", 500, errors);

    if (body.idempotencyKey !== undefined && body.idempotencyKey !== null) {
        if (
            typeof body.idempotencyKey !== "string" ||
            !body.idempotencyKey.trim() ||
            body.idempotencyKey.trim().length > 100
        ) {
            errors.push("idempotencyKey must be a string up to 100 characters");
        } else {
            body.idempotencyKey = body.idempotencyKey.trim();
        }
    } else {
        body.idempotencyKey = undefined;
    }

    if (body.entryDate === undefined) errors.push("entryDate is required");
    if (body.lines === undefined) errors.push("lines is required");

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }

    body.lines = normalizeJournalLines(body.lines, errors);

    return body;
}

function validateUpdateJournal(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid journal entry update payload");
    }

    for (const key of Object.keys(body)) {
        if (!UPDATE_FIELDS.includes(key)) {
            throw new HttpError(
                400,
                "VALIDATION_ERROR",
                `Field '${key}' is not allowed for journal entry update`,
            );
        }
    }

    const errors = [];

    body.entryDate = validateEntryDate(body.entryDate, "entryDate", errors);
    body.reference = validateText(body.reference, "reference", 100, errors);
    body.description = validateText(body.description, "description", 500, errors);
    body.currency = validateCurrency(body.currency, errors);
    body.notes = validateText(body.notes, "notes", 500, errors);

    if (errors.length) {
        throw new HttpError(400, "VALIDATION_ERROR", errors.join("; "));
    }

    if (body.lines !== undefined) {
        body.lines = normalizeJournalLines(body.lines, errors);
    }

    return body;
}

module.exports = {
    validateJournalId,
    validateEntityId,
    validateCreateJournal,
    validateUpdateJournal,
    JOURNAL_STATUSES,
    MAX_JOURNAL_LINES,
    MIN_JOURNAL_LINES,
};