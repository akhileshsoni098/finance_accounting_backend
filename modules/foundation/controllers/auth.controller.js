const authService = require("../services/auth.service");
const tenantService = require("../services/tenant.service");
const subscriptionService = require("../services/subscription.service");
const roleService = require("../services/role.service");
const userService = require("../services/user.service");

const { validateRegister, validateLogin } = require("../validators/auth.validator");

async function registerHandler(req, res, next) {
    try {
        validateRegister(req.body);
        const result = await authService.register(req.body);
        return res.status(201).json(result);
    } catch (error) {
        return next(error);
    }
}

async function loginHandler(req, res, next) {
    try {
        validateLogin(req.body);
        const result = await authService.login(req.body);
        return res.json(result);
    } catch (error) {
        return next(error);
    }
}

async function meHandler(req, res, next) {
    try {
        const { user } = req.auth;
        const [tenant, subscription] = await Promise.all([
            tenantService.getTenantById(user.tenantId),
            subscriptionService.getByTenantId(user.tenantId),
        ]);

        return res.json({
            user: userService.toPublic(user),
            role: roleService.toPublic(req.auth.role),
            tenant: tenant ? tenantService.toPublic(tenant) : null,
            subscription: subscription ? subscriptionService.toPublic(subscription) : null,
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = { registerHandler, loginHandler, meHandler };