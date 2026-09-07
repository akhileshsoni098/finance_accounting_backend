const fiscalPeriodRepository = require("../repositories/fiscalPeriod.repository");
const entityService = require("./entity.service");

const { HttpError } = require("../../../utils/http-error");

const UPDATE_FIELDS = ["name", "startDate", "endDate", "fiscalYear", "notes"];

async function ensureEntityOwnership(entityId, tenantId, options = {}) {
    await entityService.getByIdAndTenant(entityId, tenantId, options);
}

async function getPeriodById(id, tenantId, entityId, options = {}) {
    const period = await fiscalPeriodRepository.findByIdAndTenant(id, tenantId, entityId, options);
    if (!period) {
        throw new HttpError(404, "FISCAL_PERIOD_NOT_FOUND", "Fiscal period not found");
    }
    return period;
}

async function assertNoOverlap(tenantId, entityId, startDate, endDate, excludeId, options = {}) {
    const overlap = await fiscalPeriodRepository.findOverlapping(
        tenantId,
        entityId,
        startDate,
        endDate,
        excludeId,
        options,
    );
    if (overlap) {
        throw new HttpError(
            400,
            "FISCAL_PERIOD_OVERLAP",
            "Fiscal period overlaps an existing period for this entity",
        );
    }
}

async function createPeriod(tenantId, entityId, data, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const existingCode = await fiscalPeriodRepository.findByCode(tenantId, entityId, data.code, options);
    if (existingCode) {
        throw new HttpError(409, "DUPLICATE_KEY", "Fiscal period code already exists for this entity");
    }

    await assertNoOverlap(tenantId, entityId, data.startDate, data.endDate, undefined, options);

    if (data.isCurrent) {
        await fiscalPeriodRepository.unsetCurrent(tenantId, entityId, options);
    }

    return fiscalPeriodRepository.create(
        {
            tenantId,
            entityId,
            code: data.code,
            name: data.name,
            startDate: data.startDate,
            endDate: data.endDate,
            fiscalYear: data.fiscalYear,
            status: "open",
            isCurrent: Boolean(data.isCurrent),
            notes: data.notes,
        },
        options,
    );
}

async function listPeriods(tenantId, entityId, filters = {}, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);
    return fiscalPeriodRepository.findByTenantId(tenantId, entityId, filters, options);
}

async function getPeriod(id, tenantId, entityId, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);
    return getPeriodById(id, tenantId, entityId, options);
}

async function updatePeriod(id, tenantId, entityId, data, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const period = await getPeriodById(id, tenantId, entityId, options);

    if (period.status === "locked") {
        throw new HttpError(400, "FISCAL_PERIOD_LOCKED", "Locked fiscal periods cannot be modified");
    }

    const dateChange = data.startDate !== undefined || data.endDate !== undefined;
    if (dateChange && period.status !== "open") {
        throw new HttpError(
            400,
            "VALIDATION_ERROR",
            "Dates cannot be changed while the fiscal period is not open",
        );
    }

    const update = {};
    for (const field of UPDATE_FIELDS) {
        if (data[field] !== undefined) update[field] = data[field];
    }

    if (dateChange) {
        const startDate = data.startDate || period.startDate;
        const endDate = data.endDate || period.endDate;
        if (endDate.getTime() < startDate.getTime()) {
            throw new HttpError(400, "VALIDATION_ERROR", "endDate must be on or after startDate");
        }
        await assertNoOverlap(tenantId, entityId, startDate, endDate, period._id, options);
    }

    return fiscalPeriodRepository.updateById(period._id, update, options);
}

async function closePeriod(id, tenantId, entityId, userId, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const period = await getPeriodById(id, tenantId, entityId, options);

    if (period.status === "locked") {
        throw new HttpError(400, "FISCAL_PERIOD_LOCKED", "Locked fiscal periods cannot be closed");
    }
    if (period.status === "closed") {
        throw new HttpError(400, "FISCAL_PERIOD_ALREADY_CLOSED", "Fiscal period is already closed");
    }

    return fiscalPeriodRepository.updateById(
        period._id,
        { status: "closed", closedAt: new Date(), closedBy: userId },
        options,
    );
}

async function reopenPeriod(id, tenantId, entityId, userId, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const period = await getPeriodById(id, tenantId, entityId, options);

    if (period.status === "locked") {
        throw new HttpError(400, "FISCAL_PERIOD_LOCKED", "Locked fiscal periods cannot be reopened");
    }
    if (period.status === "open") {
        throw new HttpError(400, "FISCAL_PERIOD_ALREADY_OPEN", "Fiscal period is already open");
    }

    return fiscalPeriodRepository.updateById(
        period._id,
        { status: "open", closedAt: null, closedBy: null },
        options,
    );
}

async function lockPeriod(id, tenantId, entityId, userId, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const period = await getPeriodById(id, tenantId, entityId, options);

    if (period.status === "locked") {
        throw new HttpError(400, "FISCAL_PERIOD_LOCKED", "Fiscal period is already locked");
    }
    if (period.status === "open") {
        throw new HttpError(
            400,
            "FISCAL_PERIOD_NOT_CLOSED",
            "Fiscal period must be closed before it can be locked",
        );
    }

    return fiscalPeriodRepository.updateById(
        period._id,
        { status: "locked", lockedAt: new Date(), lockedBy: userId },
        options,
    );
}

async function setCurrentPeriod(id, tenantId, entityId, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const period = await getPeriodById(id, tenantId, entityId, options);

    await fiscalPeriodRepository.unsetCurrent(tenantId, entityId, options);

    return fiscalPeriodRepository.updateById(period._id, { isCurrent: true }, options);
}

function findPeriodForDate(tenantId, entityId, transactionDate, options = {}) {
    return fiscalPeriodRepository.findPeriodForDate(tenantId, entityId, transactionDate, options);
}

function toPublic(period) {
    return {
        id: period._id,
        entityId: period.entityId,
        code: period.code,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        fiscalYear: period.fiscalYear,
        status: period.status,
        isCurrent: period.isCurrent,
        closedAt: period.closedAt,
        closedBy: period.closedBy,
        lockedAt: period.lockedAt,
        lockedBy: period.lockedBy,
        notes: period.notes,
        createdAt: period.createdAt,
        updatedAt: period.updatedAt,
    };
}

module.exports = {
    createPeriod,
    listPeriods,
    getPeriod,
    updatePeriod,
    closePeriod,
    reopenPeriod,
    lockPeriod,
    setCurrentPeriod,
    findPeriodForDate,
    toPublic,
};