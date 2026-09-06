const tenantRepository = require("../repositories/tenant.repository");

async function createTenant(data, options = {}) {
    return tenantRepository.create(data, options);
}

async function getTenantById(id, options = {}) {
    return tenantRepository.findById(id, options);
}

async function getTenantByCode(code, options = {}) {
    return tenantRepository.findByCode(code, options);
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
        status: tenant.status,
        setupStage: tenant.setupStage,
    };
}

module.exports = {
    createTenant,
    getTenantById,
    getTenantByCode,
    toPublic,
};