const entityRepository = require("../repositories/entity.repository");
const subscriptionService = require("../../foundation/services/subscription.service");

const { HttpError } = require("../../../utils/http-error");

const PLAN_ENTITY_LIMITS = {
    trial: 1,
    starter: 3,
    professional: 10,
    enterprise: 50,
    default: 1,
};

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

async function entityLimitFor(subscription) {
    const limit = subscription?.limits?.entities;
    if (Number.isInteger(limit) && limit > 0) {
        return limit;
    }
    const plan = subscription?.plan;
    return PLAN_ENTITY_LIMITS[plan] ?? PLAN_ENTITY_LIMITS.default;
}

async function createEntity(tenantId, data, options = {}) {
    const subscription = await subscriptionService.getByTenantId(tenantId, options);
    if (!subscription) {
        throw new HttpError(403, "SUBSCRIPTION_NOT_FOUND", "No subscription found for this tenant");
    }

    const limit = await entityLimitFor(subscription);
    const count = await entityRepository.countByTenantId(tenantId, options);
    if (count >= limit) {
        throw new HttpError(
            403,
            "ENTITY_LIMIT_REACHED",
            `Entity limit reached (${limit}). Upgrade your plan.`,
        );
    }

    const parentEntityId = data.parentEntityId;
    if (parentEntityId) {
        await assertValidParent(parentEntityId, tenantId, options);
    }

    return entityRepository.create(
        {
            tenantId,
            type: data.type,
            code: data.code,
            name: data.name,
            legalName: data.legalName,
            registrationNumber: data.registrationNumber,
            taxId: data.taxId,
            email: data.email,
            phone: data.phone,
            website: data.website,
            address: data.address,
            currency: data.currency,
            parentEntityId: parentEntityId || undefined,
            status: data.status,
            notes: data.notes,
        },
        options,
    );
}

async function assertValidParent(parentEntityId, tenantId, options = {}) {
    const parent = await entityRepository.findByIdAndTenant(parentEntityId, tenantId, options);
    if (!parent) {
        throw new HttpError(
            400,
            "ENTITY_FOREIGN_PARENT",
            "Parent entity must exist in the same tenant",
        );
    }
}

function listByTenant(tenantId, options = {}) {
    return entityRepository.findByTenantId(tenantId, options);
}

async function getByIdAndTenant(id, tenantId, options = {}) {
    const entity = await entityRepository.findByIdAndTenant(id, tenantId, options);
    if (!entity) {
        throw new HttpError(404, "ENTITY_NOT_FOUND", "Entity not found");
    }
    return entity;
}

async function updateEntity(id, tenantId, data, options = {}) {
    const entity = await entityRepository.findByIdAndTenant(id, tenantId, options);
    if (!entity) {
        throw new HttpError(404, "ENTITY_NOT_FOUND", "Entity not found");
    }

    const update = {};

    if (data.parentEntityId !== undefined) {
        if (data.parentEntityId === null) {
            update.parentEntityId = null;
        } else if (String(data.parentEntityId) === String(entity._id)) {
            throw new HttpError(400, "ENTITY_SELF_PARENT", "An entity cannot be its own parent");
        } else {
            const parent = await entityRepository.findByIdAndTenant(data.parentEntityId, tenantId, options);
            if (!parent) {
                throw new HttpError(
                    400,
                    "ENTITY_FOREIGN_PARENT",
                    "Parent entity must exist in the same tenant",
                );
            }
            update.parentEntityId = data.parentEntityId;
        }
    }

    for (const field of UPDATE_FIELDS) {
        if (field === "parentEntityId") continue;
        if (data[field] !== undefined) update[field] = data[field];
    }

    return entityRepository.updateById(entity._id, update, options);
}

function toPublic(entity) {
    return {
        id: entity._id,
        type: entity.type,
        code: entity.code,
        name: entity.name,
        legalName: entity.legalName,
        registrationNumber: entity.registrationNumber,
        taxId: entity.taxId,
        contact: {
            email: entity.email,
            phone: entity.phone,
            website: entity.website,
        },
        address: entity.address,
        currency: entity.currency,
        parentEntityId: entity.parentEntityId || null,
        status: entity.status,
        notes: entity.notes,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
}

module.exports = {
    createEntity,
    listByTenant,
    getByIdAndTenant,
    updateEntity,
    toPublic,
};