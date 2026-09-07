const fiscalPeriodService = require("../services/fiscalPeriod.service");
const {
    validateFiscalPeriodId,
    validateEntityId,
    validateCreateFiscalPeriod,
    validateUpdateFiscalPeriod,
} = require("../validators/fiscalPeriod.validator");

async function listFiscalPeriodsHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        const periods = await fiscalPeriodService.listPeriods(
            req.auth.tenantId,
            req.params.entityId,
            { status: req.query.status, fiscalYear: req.query.fiscalYear },
        );
        return res.json({ fiscalPeriods: periods.map(fiscalPeriodService.toPublic) });
    } catch (error) {
        return next(error);
    }
}

async function getFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateFiscalPeriodId(req.params.id);
        const period = await fiscalPeriodService.getPeriod(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
        );
        return res.json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

async function createFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        const data = validateCreateFiscalPeriod(req.body);
        const period = await fiscalPeriodService.createPeriod(
            req.auth.tenantId,
            req.params.entityId,
            data,
        );
        return res.status(201).json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

async function updateFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateFiscalPeriodId(req.params.id);
        const data = validateUpdateFiscalPeriod(req.body);
        const period = await fiscalPeriodService.updatePeriod(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
            data,
        );
        return res.json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

async function closeFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateFiscalPeriodId(req.params.id);
        const period = await fiscalPeriodService.closePeriod(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
            req.auth.userId,
        );
        return res.json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

async function reopenFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateFiscalPeriodId(req.params.id);
        const period = await fiscalPeriodService.reopenPeriod(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
            req.auth.userId,
        );
        return res.json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

async function lockFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateFiscalPeriodId(req.params.id);
        const period = await fiscalPeriodService.lockPeriod(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
            req.auth.userId,
        );
        return res.json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

async function setCurrentFiscalPeriodHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateFiscalPeriodId(req.params.id);
        const period = await fiscalPeriodService.setCurrentPeriod(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
        );
        return res.json({ fiscalPeriod: fiscalPeriodService.toPublic(period) });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listFiscalPeriodsHandler,
    getFiscalPeriodHandler,
    createFiscalPeriodHandler,
    updateFiscalPeriodHandler,
    closeFiscalPeriodHandler,
    reopenFiscalPeriodHandler,
    lockFiscalPeriodHandler,
    setCurrentFiscalPeriodHandler,
};