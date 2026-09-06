const { PERMISSION_CATALOG } = require("../constants/permissions");

function listPermissions(req, res, next) {
    try {
        res.json({ modules: PERMISSION_CATALOG });
    } catch (error) {
        next(error);
    }
}

module.exports = { listPermissions };