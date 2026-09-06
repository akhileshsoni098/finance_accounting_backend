const tenantService = require("../services/tenant.service");

const { HttpError } = require("../../../utils/http-error");
const { validateObjectId } = require("../validators/tenant.validator");

async function getTenantHandler(req, res, next) {
    try {
        validateObjectId(req.params.id, "tenantId");
        const tenant = await tenantService.getTenantById(req.params.id);

        if (!tenant || String(tenant._id) !== String(req.auth.tenantId)) {
            throw new HttpError(404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        return res.json({ tenant: tenantService.toPublic(tenant) });
    } catch (error) {
        return next(error);
    }
}

async function listTenantsHandler(req, res, next) {
    try {
        const tenant = await tenantService.getTenantById(req.auth.tenantId);
        return res.json({ tenants: tenant ? [tenantService.toPublic(tenant)] : [] });
    } catch (error) {
        return next(error);
    }
}

module.exports = { getTenantHandler, listTenantsHandler };