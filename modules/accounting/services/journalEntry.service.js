const mongoose = require("mongoose");

const journalEntryRepository = require("../repositories/journalEntry.repository");
const journalLineRepository = require("../repositories/journalLine.repository");
const journalNumberCounterRepository = require("../repositories/journalNumberCounter.repository");
const entityService = require("./entity.service");
const accountService = require("./account.service");
const fiscalPeriodService = require("./fiscalPeriod.service");

const { HttpError } = require("../../../utils/http-error");
const { isValidObjectId: isObjectId } = require("mongoose");

const UPDATE_HEADER_FIELDS = ["entryDate", "reference", "description", "currency", "notes"];

function formatJournalNumber(seq) {
    return `JE-${String(seq).padStart(6, "0")}`;
}

function isTransactionUnsupported(error) {
    if (!error) return false;
    const message = `${error.message || ""} ${error.codeName || ""}`;
    return (
        error.code === 20 ||
        message.includes("Transaction numbers are only allowed") ||
        message.includes("Transactions are not supported") ||
        message.includes("cannot be resumed")
    );
}

function isDuplicateIdempotencyKey(error) {
    return Boolean(
        error &&
            error.code === 11000 &&
            error.keyPattern &&
            error.keyPattern.idempotencyKey,
    );
}

async function ensureEntityOwnership(entityId, tenantId, options = {}) {
    return entityService.getByIdAndTenant(entityId, tenantId, options);
}

function resolveHeaderCurrency(entity, providedCurrency) {
    const entityCurrency = String(entity.currency || "USD").trim().toUpperCase();
    if (providedCurrency && providedCurrency !== entityCurrency) {
        throw new HttpError(
            400,
            "CURRENCY_MISMATCH",
            `Journal currency must match the entity currency (${entityCurrency})`,
        );
    }
    return entityCurrency;
}

async function assertOpenPeriod(tenantId, entityId, entryDate) {
    const period = await fiscalPeriodService.findPeriodForDate(tenantId, entityId, entryDate);
    if (!period) {
        throw new HttpError(
            404,
            "FISCAL_PERIOD_NOT_FOUND",
            "No fiscal period covers this entry date",
        );
    }
    if (period.status === "closed") {
        throw new HttpError(400, "FISCAL_PERIOD_CLOSED", "Fiscal period is closed for this entry date");
    }
    if (period.status === "locked") {
        throw new HttpError(400, "FISCAL_PERIOD_LOCKED", "Fiscal period is locked for this entry date");
    }
    return period;
}

async function assertPostableAccount(account) {
    if (account.status !== "active") {
        throw new HttpError(400, "ACCOUNT_INACTIVE", "Journal lines cannot reference inactive accounts");
    }
    if (!account.allowPosting) {
        throw new HttpError(400, "ACCOUNT_NOT_POSTABLE", "Journal lines cannot reference non-posting accounts");
    }
    return account;
}

async function verifyLines(tenantId, entityId, lines, options = {}) {
    const accountIds = [...new Set(lines.map((line) => String(line.accountId)))];
    for (const accountId of accountIds) {
        const account = await accountService.getByIdAndEntity(accountId, tenantId, entityId, options);
        await assertPostableAccount(account);
    }
}

function buildLineDocs(tenantId, entityId, journalEntryId, currency, lines) {
    return lines.map((line, index) => ({
        tenantId,
        entityId,
        journalEntryId,
        accountId: line.accountId,
        description: line.description,
        currency,
        debit: line.debit,
        credit: line.credit,
        lineNumber: index + 1,
    }));
}

async function getJournalHeader(id, tenantId, entityId) {
    const journal = await journalEntryRepository.findByIdAndTenant(id, tenantId, entityId);
    if (!journal) {
        throw new HttpError(404, "JOURNAL_NOT_FOUND", "Journal entry not found");
    }
    return journal;
}

async function createDraftJournal(tenantId, entityId, data) {
    await ensureEntityOwnership(entityId, tenantId);

    if (data.idempotencyKey) {
        const existing = await journalEntryRepository.findByTenantIdAndIdempotencyKey(
            tenantId,
            data.idempotencyKey,
        );
        if (existing) {
            const lines = await journalLineRepository.findManyByJournalId(existing._id);
            return { journal: existing, lines, replayed: true };
        }
    }

    const entity = await entityService.getByIdAndTenant(entityId, tenantId);
    const currency = resolveHeaderCurrency(entity, data.currency);
    const period = await assertOpenPeriod(tenantId, entityId, data.entryDate);

    await verifyLines(tenantId, entityId, data.lines);

    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);

    const headerBase = {
        tenantId,
        entityId,
        fiscalPeriodId: period._id,
        entryDate: data.entryDate,
        reference: data.reference,
        description: data.description,
        currency,
        totalDebit,
        totalCredit,
        source: data.source,
        sourceId: data.sourceId,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes,
    };

    let journal;
    try {
        const session = await mongoose.startSession();
        try {
            journal = await session.withTransaction(async () => {
                const seq = await journalNumberCounterRepository.nextJournalNumber(tenantId, entityId, {
                    session,
                });
                const created = await journalEntryRepository.create(
                    { ...headerBase, journalNumber: formatJournalNumber(seq) },
                    { session },
                );
                await journalLineRepository.createMany(
                    buildLineDocs(tenantId, entityId, created._id, currency, data.lines),
                    { session },
                );
                return created;
            });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        if (isDuplicateIdempotencyKey(error)) {
            const existing = await journalEntryRepository.findByTenantIdAndIdempotencyKey(
                tenantId,
                data.idempotencyKey,
            );
            if (existing) {
                const lines = await journalLineRepository.findManyByJournalId(existing._id);
                return { journal: existing, lines, replayed: true };
            }
        }
        if (isTransactionUnsupported(error)) {
            return createDraftJournalFallback(tenantId, entityId, data, period, currency, headerBase);
        }
        throw error;
    }

    const lines = await journalLineRepository.findManyByJournalId(journal._id);
    return { journal, lines };
}

async function createDraftJournalFallback(tenantId, entityId, data, period, currency, headerBase) {
    const seq = await journalNumberCounterRepository.nextJournalNumber(tenantId, entityId);
    const created = await journalEntryRepository.create(
        { ...headerBase, journalNumber: formatJournalNumber(seq) },
        {},
    );
    try {
        await journalLineRepository.createMany(
            buildLineDocs(tenantId, entityId, created._id, currency, data.lines),
            {},
        );
    } catch (error) {
        await journalEntryRepository.removeById(created._id);
        throw error;
    }
    const lines = await journalLineRepository.findManyByJournalId(created._id);
    return { journal: created, lines };
}

async function listJournals(tenantId, entityId, filters = {}) {
    await ensureEntityOwnership(entityId, tenantId);

    const queryFilters = { status: filters.status };

    if (filters.dateFrom) {
        const parsed = new Date(filters.dateFrom);
        if (Number.isNaN(parsed.getTime())) {
            throw new HttpError(400, "INVALID_INPUT", "dateFrom must be a valid date");
        }
        queryFilters.dateFrom = parsed;
    }
    if (filters.dateTo) {
        const parsed = new Date(filters.dateTo);
        if (Number.isNaN(parsed.getTime())) {
            throw new HttpError(400, "INVALID_INPUT", "dateTo must be a valid date");
        }
        queryFilters.dateTo = parsed;
    }
    if (filters.accountId) {
        if (!isObjectId(String(filters.accountId))) {
            throw new HttpError(400, "INVALID_INPUT", "accountId must be a valid account id");
        }
        const journalIds = await journalLineRepository.findJournalIdsByAccount(
            tenantId,
            entityId,
            filters.accountId,
        );
        queryFilters.idIn = journalIds;
    }

    return journalEntryRepository.findManyByTenant(tenantId, entityId, queryFilters);
}

async function getJournal(id, tenantId, entityId) {
    await ensureEntityOwnership(entityId, tenantId);
    const journal = await getJournalHeader(id, tenantId, entityId);
    const lines = await journalLineRepository.findManyByJournalId(journal._id);
    return { journal, lines };
}

async function updateDraftJournal(id, tenantId, entityId, data) {
    await ensureEntityOwnership(entityId, tenantId);

    const journal = await getJournalHeader(id, tenantId, entityId);
    if (journal.status !== "draft") {
        throw new HttpError(
            400,
            "JOURNAL_POSTED_IMMUTABLE",
            "Only draft journals can be modified",
        );
    }

    const entity = await entityService.getByIdAndTenant(entityId, tenantId);
    const currency =
        data.currency !== undefined
            ? resolveHeaderCurrency(entity, data.currency)
            : String(journal.currency || entity.currency || "USD").toUpperCase();

    const entryDate = data.entryDate || journal.entryDate;
    const period = await assertOpenPeriod(tenantId, entityId, entryDate);

    const update = {};
    for (const field of UPDATE_HEADER_FIELDS) {
        if (data[field] !== undefined) update[field] = data[field];
    }
    if (data.currency !== undefined) update.currency = currency;
    if (data.entryDate !== undefined) update.fiscalPeriodId = period._id;

    let nextLines;
    if (data.lines !== undefined) {
        await verifyLines(tenantId, entityId, data.lines);
        nextLines = buildLineDocs(tenantId, entityId, journal._id, currency, data.lines);
        update.totalDebit = nextLines.reduce((sum, line) => sum + line.debit, 0);
        update.totalCredit = nextLines.reduce((sum, line) => sum + line.credit, 0);
    }

    let updated;
    try {
        const session = await mongoose.startSession();
        try {
            updated = await session.withTransaction(async () => {
                const result = await journalEntryRepository.updateById(journal._id, update, { session });
                if (nextLines) {
                    await journalLineRepository.deleteManyByJournalId(journal._id, { session });
                    await journalLineRepository.createMany(nextLines, { session });
                }
                return result;
            });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        if (isTransactionUnsupported(error)) {
            updated = await journalEntryRepository.updateById(journal._id, update, {});
            if (nextLines) {
                await journalLineRepository.deleteManyByJournalId(journal._id, {});
                await journalLineRepository.createMany(nextLines, {});
            }
        } else {
            throw error;
        }
    }

    const lines = await journalLineRepository.findManyByJournalId(journal._id);
    return { journal: updated, lines };
}

async function postJournal(id, tenantId, entityId, userId) {
    await ensureEntityOwnership(entityId, tenantId);

    const journal = await getJournalHeader(id, tenantId, entityId);
    if (journal.status !== "draft") {
        throw new HttpError(
            400,
            "JOURNAL_POSTED_IMMUTABLE",
            "Only draft journals can be posted",
        );
    }

    const period = await assertOpenPeriod(tenantId, entityId, journal.entryDate);
    void period;
    const lines = await journalLineRepository.findManyByJournalId(journal._id);
    await verifyLines(tenantId, entityId, lines);

    const posted = await journalEntryRepository.transitionToPosted(
        id,
        tenantId,
        entityId,
        { status: "posted", postedAt: new Date(), postedBy: userId },
    );
    if (!posted) {
        throw new HttpError(
            400,
            "JOURNAL_POSTED_IMMUTABLE",
            "Journal is already posted or no longer in draft state",
        );
    }

    return { journal: posted, lines };
}

function toPublicHeader(journal) {
    return {
        id: journal._id,
        entityId: journal.entityId,
        fiscalPeriodId: journal.fiscalPeriodId,
        journalNumber: journal.journalNumber,
        entryDate: journal.entryDate,
        status: journal.status,
        reference: journal.reference || null,
        description: journal.description || null,
        currency: journal.currency,
        totalDebit: journal.totalDebit,
        totalCredit: journal.totalCredit,
        source: journal.source || null,
        sourceId: journal.sourceId || null,
        idempotencyKey: journal.idempotencyKey || null,
        reversalOfId: journal.reversalOfId || null,
        reversedById: journal.reversedById || null,
        notes: journal.notes || null,
        postedAt: journal.postedAt || null,
        postedBy: journal.postedBy || null,
        createdAt: journal.createdAt,
        updatedAt: journal.updatedAt,
    };
}

function toPublicLine(line) {
    return {
        id: line._id,
        journalEntryId: line.journalEntryId,
        lineNumber: line.lineNumber,
        accountId: line.accountId,
        description: line.description || null,
        currency: line.currency,
        debit: line.debit,
        credit: line.credit,
    };
}

function toPublic(journalWithLines) {
    return {
        ...toPublicHeader(journalWithLines.journal),
        lines: journalWithLines.lines.map(toPublicLine),
    };
}

module.exports = {
    createDraftJournal,
    listJournals,
    getJournal,
    updateDraftJournal,
    postJournal,
    toPublicHeader,
    toPublicLine,
    toPublic,
    formatJournalNumber,
};