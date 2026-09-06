const roleRepository = require("../repositories/role.repository");

const SUPER_ADMIN_KEY = "super_admin";

async function createSuperAdmin(tenantId, options = {}) {
    return roleRepository.create(
        {
            tenantId,
            name: "Super Admin",
            key: SUPER_ADMIN_KEY,
            isSystem: true,
            permissions: [{ module: "*", actions: ["*"] }],
            status: "active",
        },
        options,
    );
}

async function getByIdAndTenant(id, tenantId, options = {}) {
    return roleRepository.findByIdAndTenant(id, tenantId, options);
}

function toPublic(role) {
    return {
        id: role._id,
        name: role.name,
        key: role.key,
        permissions: role.permissions,
    };
}

module.exports = { createSuperAdmin, getByIdAndTenant, toPublic, SUPER_ADMIN_KEY };