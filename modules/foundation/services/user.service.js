const bcrypt = require("bcryptjs");

const userRepository = require("../repositories/user.repository");
const { bcryptRounds } = require("../../../config/env");

async function createUser({ tenantId, roleId, email, password, displayName }, options = {}) {
    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    return userRepository.create(
        {
            tenantId,
            roleId,
            email: email.trim().toLowerCase(),
            passwordHash,
            displayName,
            status: "active",
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

async function updateLastLogin(user) {
    user.lastLoginAt = new Date();
    await user.save();
    return user;
}

function toPublic(user) {
    return {
        id: user._id,
        tenantId: user.tenantId,
        roleId: user.roleId,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
    };
}

module.exports = { createUser, getByEmail, getById, updateLastLogin, toPublic };