const roleRepository = require("../repositories/role.repository");
const userRepository = require("../repositories/user.repository");

const { HttpError } = require("../../../utils/http-error");

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

async function listByTenant(tenantId, options = {}) {
    return roleRepository.findByTenantId(tenantId, options);
}

async function createRole(data, options = {}) {
    return roleRepository.create(data, options);
}

async function updateRole(id, tenantId, data, options = {}) {
    const role = await roleRepository.findByIdAndTenant(id, tenantId, options);
    if (!role) {
        throw new HttpError(404, "ROLE_NOT_FOUND", "Role not found");
    }
    if (role.isSystem) {
        throw new HttpError(403, "SYSTEM_ROLE_PROTECTED", "System roles cannot be modified");
    }

    if (data.name !== undefined) role.name = data.name;
    if (data.permissions !== undefined) role.permissions = data.permissions;
    if (data.status !== undefined) role.status = data.status;

    await role.save(options);
    return role;
}

async function deleteRole(id, tenantId, options = {}) {
    const role = await roleRepository.findByIdAndTenant(id, tenantId, options);
    if (!role) {
        throw new HttpError(404, "ROLE_NOT_FOUND", "Role not found");
    }
    if (role.isSystem) {
        throw new HttpError(403, "SYSTEM_ROLE_PROTECTED", "System roles cannot be deleted");
    }

    const assignedUsers = await userRepository.countByRoleId(role._id, options);
    if (assignedUsers > 0) {
        throw new HttpError(409, "ROLE_IN_USE", `Role is assigned to ${assignedUsers} user(s)`);
    }

    await roleRepository.deleteById(role._id, options);
    return role;
}

function toPublic(role) {
    return {
        id: role._id,
        name: role.name,
        key: role.key,
        permissions: role.permissions,
        isSystem: role.isSystem,
        status: role.status,
    };
}

module.exports = {
    createSuperAdmin,
    getByIdAndTenant,
    listByTenant,
    createRole,
    updateRole,
    deleteRole,
    toPublic,
    SUPER_ADMIN_KEY,
};