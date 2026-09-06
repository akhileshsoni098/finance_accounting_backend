const tenantRepository = require("../repositories/tenant.repository");

const { HttpError } = require("../../../utils/http-error");

async function createTenant(data, options = {}) {
    return tenantRepository.create(data, options);
}

async function getTenantById(id, options = {}) {
    return tenantRepository.findById(id, options);
}

async function getTenantByCode(code, options = {}) {
    return tenantRepository.findByCode(code, options);
}

const UPDATABLE_FIELDS = ["name", "email", "phone", "website", "logo", "setupStage", "status"];

async function updateTenant(id, data, options = {}) {
    if (data.code !== undefined || data.businessType !== undefined) {
        throw new HttpError(400, "TENANT_IMMUTABLE_FIELD", "code and businessType cannot be changed");
    }

    const update = {};
    for (const key of UPDATABLE_FIELDS) {
        if (data[key] !== undefined) update[key] = data[key];
    }

    const tenant = await tenantRepository.updateById(id, update, options);
    if (!tenant) {
        throw new HttpError(404, "TENANT_NOT_FOUND", "Tenant not found");
    }

    return tenant;
}

async function listTenants(options = {}) {
    return tenantRepository.findAll(options);
}

function toPublic(tenant) {
    return {
        id: tenant._id,
        name: tenant.name,
        code: tenant.code,
        businessType: tenant.businessType,
        email: tenant.email,
        phone: tenant.phone,
        website: tenant.website,
        logo: tenant.logo,
        status: tenant.status,
        setupStage: tenant.setupStage,
        createdAt: tenant.createdAt,
    };
}

module.exports = {
    createTenant,
    getTenantById,
    getTenantByCode,
    updateTenant,
    listTenants,
    toPublic,
};