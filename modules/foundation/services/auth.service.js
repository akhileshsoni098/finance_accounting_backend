const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const tenantService = require("./tenant.service");
const subscriptionService = require("./subscription.service");
const roleService = require("./role.service");
const userService = require("./user.service");

const { signAccessToken } = require("../../../utils/jwt");
const { HttpError } = require("../../../utils/http-error");

const { toPublic: toPublicUser } = userService;
const { toPublic: toPublicTenant } = tenantService;
const { toPublic: toPublicRole } = roleService;
const { toPublic: toPublicSubscription } = subscriptionService;

async function register(payload) {
    const { tenant: tenantData, admin } = payload;

    const session = await mongoose.startSession();

    let tenant;
    let subscription;
    let role;
    let user;

    try {
        await session.withTransaction(async () => {
            tenant = await tenantService.createTenant(
                {
                    name: tenantData.name,
                    code: tenantData.code.toUpperCase(),
                    businessType: tenantData.businessType,
                    email: tenantData.email,
                    phone: tenantData.phone,
                    website: tenantData.website,
                    status: "active",
                    setupStage: "organization",
                },
                { session },
            );

            subscription = await subscriptionService.createDefaultSubscription(tenant._id, {
                session,
            });

            role = await roleService.createSuperAdmin(tenant._id, { session });

            user = await userService.createUser(
                {
                    tenantId: tenant._id,
                    roleId: role._id,
                    email: admin.email,
                    password: admin.password,
                    displayName: admin.displayName,
                },
                { session },
            );
        });
    } finally {
        session.endSession();
    }

    const token = signAccessToken({
        userId: user._id.toString(),
        tenantId: tenant._id.toString(),
        roleId: role._id.toString(),
    });

    return {
        token,
        user: toPublicUser(user),
        tenant: toPublicTenant(tenant),
        subscription: toPublicSubscription(subscription),
        role: toPublicRole(role),
    };
}

async function login({ email, password, tenantCode }) {
    const candidates = await userService.getAllByEmail(email, { includePassword: true });
    if (!candidates.length) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    let user;
    if (tenantCode) {
        const tenant = await tenantService.getTenantByCode(tenantCode);
        if (!tenant) {
            throw new HttpError(404, "TENANT_NOT_FOUND", "Tenant not found");
        }
        user = candidates.find((candidate) => String(candidate.tenantId) === String(tenant._id));
        if (!user) {
            throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
        }
    } else if (candidates.length > 1) {
        throw new HttpError(
            400,
            "MULTIPLE_ACCOUNTS",
            "This email exists in multiple tenants. Provide tenantCode to sign in",
        );
    } else {
        user = candidates[0];
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (user.status !== "active") {
        if (user.status === "suspended") {
            throw new HttpError(403, "ACCOUNT_SUSPENDED", "Account is suspended. Contact your administrator");
        }
        if (user.status === "disabled") {
            throw new HttpError(403, "ACCOUNT_DISABLED", "Account is disabled. Contact your administrator");
        }
        throw new HttpError(403, "ACCOUNT_INACTIVE", "User account is not active");
    }

    const tenant = await tenantService.getTenantById(user.tenantId);
    if (!tenant || tenant.status !== "active") {
        throw new HttpError(403, "TENANT_INACTIVE", "Tenant account is not active");
    }

    const subscription = await subscriptionService.getByTenantId(tenant._id);
    if (subscription && subscription.endDate && subscription.endDate < new Date()) {
        throw new HttpError(403, "SUBSCRIPTION_EXPIRED", "Tenant subscription has expired");
    }
    if (subscription && !["trialing", "active", "past_due"].includes(subscription.status)) {
        throw new HttpError(403, "SUBSCRIPTION_SUSPENDED", "Tenant subscription is suspended");
    }

    const role = await roleService.getByIdAndTenant(user.roleId, user.tenantId);
    if (!role || role.status !== "active") {
        throw new HttpError(403, "ROLE_INACTIVE", "User role is not active");
    }

    await userService.updateLastLogin(user);

    const token = signAccessToken({
        userId: user._id.toString(),
        tenantId: user.tenantId.toString(),
        roleId: user.roleId.toString(),
    });

    return {
        token,
        user: toPublicUser(user),
        role: toPublicRole(role),
    };
}

module.exports = { register, login };