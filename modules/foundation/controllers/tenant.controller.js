const tenantService = require("../services/tenant.service");

const { HttpError } = require("../../../utils/http-error");
const { validateObjectId, validateTenantUpdate } = require("../validators/tenant.validator");

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
        const isSuperAdmin = req.auth.role.permissions.some(
            (p) => p.module === "*" && p.actions.includes("*"),
        );

        const tenants = isSuperAdmin
            ? await tenantService.listTenants()
            : [await tenantService.getTenantById(req.auth.tenantId)];

        return res.json({ tenants: (tenants || []).filter(Boolean).map((tenant) => tenantService.toPublic(tenant)) });
    } catch (error) {
        return next(error);
    }
}

async function updateTenantHandler(req, res, next) {
    try {
        validateObjectId(req.params.id, "tenantId");
        validateTenantUpdate(req.body);

        const tenant = await tenantService.getTenantById(req.params.id);
        if (!tenant || String(tenant._id) !== String(req.auth.tenantId)) {
            throw new HttpError(404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        const updated = await tenantService.updateTenant(req.params.id, req.body);
        return res.json({ tenant: tenantService.toPublic(updated) });
    } catch (error) {
        return next(error);
    }
}

module.exports = { getTenantHandler, listTenantsHandler, updateTenantHandler };