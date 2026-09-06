const User = require("../models/user");

async function create(data, options = {}) {
    const [doc] = await User.create([data], options);
    return doc;
}

async function findByEmail(email, options = {}) {
    const query = User.findOne({ email: email.trim().toLowerCase() });
    if (options.includePassword) {
        query.select("+passwordHash");
    }
    return query.session(options.session);
}

async function findById(id, options = {}) {
    return User.findById(id).session(options.session);
}

async function countByRoleId(roleId, options = {}) {
    return User.countDocuments({ roleId }).session(options.session);
}

module.exports = { create, findByEmail, findById, countByRoleId };