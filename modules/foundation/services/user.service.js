const bcrypt = require("bcryptjs");

const userRepository = require("../repositories/user.repository");
const roleService = require("./role.service");

const { bcryptRounds } = require("../../../config/env");
const { HttpError } = require("../../../utils/http-error");

async function createUser({ tenantId, roleId, email, password, displayName, status }, options = {}) {
    const role = await roleService.getByIdAndTenant(roleId, tenantId, options);
    if (!role) {
        throw new HttpError(400, "ROLE_NOT_FOUND", "Role does not belong to this tenant");
    }

    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    return userRepository.create(
        {
            tenantId,
            roleId,
            email: email.trim().toLowerCase(),
            passwordHash,
            displayName,
            status: status || "active",
        },
        options,
    );
}

async function getByEmail(email, options = {}) {
    return userRepository.findByEmail(email, options);
}

async function getById(id, options = {}) {
    return userRepository.findById(id, options);
}

async function listByTenant(tenantId, options = {}) {
    return userRepository.findByTenantId(tenantId, options);
}

async function getByIdAndTenant(id, tenantId, options = {}) {
    const user = await userRepository.findByIdAndTenant(id, tenantId, options);
    if (!user) {
        throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    return user;
}

async function updateUser(id, tenantId, data, options = {}) {
    const user = await userRepository.findByIdAndTenant(id, tenantId, options);
    if (!user) {
        throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    if (data.status !== undefined && ["suspended", "disabled"].includes(data.status) && String(user._id) === String(options.actorId)) {
        throw new HttpError(400, "CANNOT_SUSPEND_SELF", "You cannot suspend or disable your own account");
    }

    const update = {};
    if (data.email !== undefined) update.email = data.email.trim().toLowerCase();
    if (data.displayName !== undefined) update.displayName = data.displayName;
    if (data.avatar !== undefined) update.avatar = data.avatar;
    if (data.roleId !== undefined) {
        const role = await roleService.getByIdAndTenant(data.roleId, tenantId, options);
        if (!role) {
            throw new HttpError(400, "ROLE_NOT_FOUND", "Role does not belong to this tenant");
        }
        update.roleId = data.roleId;
    }
    if (data.status !== undefined) update.status = data.status;

    return userRepository.updateById(user._id, update, options);
}

async function suspendUser(id, tenantId, options = {}) {
    return updateUser(id, tenantId, { status: "suspended" }, options);
}

async function activateUser(id, tenantId, options = {}) {
    return updateUser(id, tenantId, { status: "active" }, options);
}

async function updateLastLogin(user) {
    user.lastLoginAt = new Date();
    await user.save();
    return user;
}

function toPublic(user) {
    return {
        id: user._id,
        tenantId: user.tenantId,
        roleId: user.roleId && typeof user.roleId === "object" ? user.roleId._id : user.roleId,
        role: user.roleId && typeof user.roleId === "object"
            ? { id: user.roleId._id, name: user.roleId.name, key: user.roleId.key }
            : undefined,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
    };
}

module.exports = {
    createUser,
    getByEmail,
    getById,
    listByTenant,
    getByIdAndTenant,
    updateUser,
    suspendUser,
    activateUser,
    updateLastLogin,
    toPublic,
};