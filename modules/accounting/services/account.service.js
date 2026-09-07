const accountRepository = require("../repositories/account.repository");
const entityService = require("./entity.service");

const { HttpError } = require("../../../utils/http-error");
const { BALANCE_BY_TYPE } = require("../validators/account.validator");

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

async function ensureEntityOwnership(entityId, tenantId, options = {}) {
    await entityService.getByIdAndTenant(entityId, tenantId, options);
}

async function createAccount(tenantId, entityId, data, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    if (data.normalBalance && BALANCE_BY_TYPE[data.accountType] !== data.normalBalance) {
        throw new HttpError(
            400,
            "INVALID_NORMAL_BALANCE",
            `normalBalance must be '${BALANCE_BY_TYPE[data.accountType]}' for ${data.accountType} accounts`,
        );
    }

    if (data.parentAccountId) {
        await assertValidParent(data.parentAccountId, tenantId, entityId, options);
    }

    return accountRepository.create(
        {
            tenantId,
            entityId,
            code: data.code,
            name: data.name,
            description: data.description,
            accountType: data.accountType,
            accountSubtype: data.accountSubtype,
            parentAccountId: data.parentAccountId || undefined,
            normalBalance: data.normalBalance,
            isControlAccount: data.isControlAccount,
            allowPosting: data.allowPosting,
            status: data.status,
            sortOrder: data.sortOrder,
            notes: data.notes,
        },
        options,
    );
}

async function assertValidParent(parentAccountId, tenantId, entityId, options = {}) {
    const parent = await accountRepository.findByIdAndEntity(parentAccountId, tenantId, entityId, options);
    if (!parent) {
        throw new HttpError(
            400,
            "ACCOUNT_FOREIGN_PARENT",
            "Parent account must exist in the same entity",
        );
    }
}

async function listByEntity(tenantId, entityId, filters = {}, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);
    return accountRepository.findByEntityId(tenantId, entityId, filters, options);
}

async function getByIdAndEntity(id, tenantId, entityId, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);
    const account = await accountRepository.findByIdAndEntity(id, tenantId, entityId, options);
    if (!account) {
        throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found");
    }
    return account;
}

async function updateAccount(id, tenantId, entityId, data, options = {}) {
    await ensureEntityOwnership(entityId, tenantId, options);

    const account = await accountRepository.findByIdAndEntity(id, tenantId, entityId, options);
    if (!account) {
        throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found");
    }

    if (data.normalBalance !== undefined) {
        const expected = BALANCE_BY_TYPE[account.accountType];
        if (expected !== data.normalBalance) {
            throw new HttpError(
                400,
                "INVALID_NORMAL_BALANCE",
                `normalBalance must be '${expected}' for ${account.accountType} accounts`,
            );
        }
    }

    if (data.parentAccountId !== undefined) {
        if (data.parentAccountId === null) {
            data.parentAccountId = undefined;
        } else if (String(data.parentAccountId) === String(account._id)) {
            throw new HttpError(400, "ACCOUNT_SELF_PARENT", "An account cannot be its own parent");
        } else {
            await assertValidParent(data.parentAccountId, tenantId, entityId, options);
        }
    }

    const update = {};
    for (const field of UPDATE_FIELDS) {
        if (data[field] !== undefined) update[field] = data[field];
    }

    if (Object.hasOwn(data, "parentAccountId") && data.parentAccountId === undefined && update.parentAccountId === undefined) {
        update.parentAccountId = null;
    }

    return accountRepository.updateById(account._id, update, options);
}

function toPublic(account) {
    return {
        id: account._id,
        entityId: account.entityId,
        code: account.code,
        name: account.name,
        description: account.description,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        parentAccountId: account.parentAccountId || null,
        normalBalance: account.normalBalance,
        isControlAccount: account.isControlAccount,
        allowPosting: account.allowPosting,
        status: account.status,
        sortOrder: account.sortOrder,
        notes: account.notes,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
    };
}

module.exports = { createAccount, listByEntity, getByIdAndEntity, updateAccount, toPublic };