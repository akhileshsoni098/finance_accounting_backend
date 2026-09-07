const journalEntryService = require("../services/journalEntry.service");
const {
    validateJournalId,
    validateEntityId,
    validateCreateJournal,
    validateUpdateJournal,
} = require("../validators/journalEntry.validator");

function readIdempotencyKey(req) {
    const header = req.headers["idempotency-key"];
    if (!header) return undefined;
    const trimmed = String(header).trim();
    return trimmed || undefined;
}

async function listJournalEntriesHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        const journals = await journalEntryService.listJournals(
            req.auth.tenantId,
            req.params.entityId,
            {
                status: req.query.status,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo,
                accountId: req.query.accountId,
            },
        );
        return res.json({
            journalEntries: journals.map(journalEntryService.toPublicHeader),
        });
    } catch (error) {
        return next(error);
    }
}

async function getJournalEntryHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateJournalId(req.params.journalId);
        const result = await journalEntryService.getJournal(
            req.params.journalId,
            req.auth.tenantId,
            req.params.entityId,
        );
        return res.json({ journal: journalEntryService.toPublic(result) });
    } catch (error) {
        return next(error);
    }
}

async function createJournalEntryHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        const data = validateCreateJournal(req.body);
        data.idempotencyKey = data.idempotencyKey || readIdempotencyKey(req);

        const result = await journalEntryService.createDraftJournal(
            req.auth.tenantId,
            req.params.entityId,
            data,
        );
        const publicJournal = journalEntryService.toPublic(result);
        return res.status(result.replayed ? 200 : 201).json({ journal: publicJournal });
    } catch (error) {
        return next(error);
    }
}

async function updateJournalEntryHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateJournalId(req.params.journalId);
        const data = validateUpdateJournal(req.body);
        const result = await journalEntryService.updateDraftJournal(
            req.params.journalId,
            req.auth.tenantId,
            req.params.entityId,
            data,
        );
        return res.json({ journal: journalEntryService.toPublic(result) });
    } catch (error) {
        return next(error);
    }
}

async function postJournalEntryHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateJournalId(req.params.journalId);
        const result = await journalEntryService.postJournal(
            req.params.journalId,
            req.auth.tenantId,
            req.params.entityId,
            req.auth.userId,
        );
        return res.json({ journal: journalEntryService.toPublic(result) });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listJournalEntriesHandler,
    getJournalEntryHandler,
    createJournalEntryHandler,
    updateJournalEntryHandler,
    postJournalEntryHandler,
};