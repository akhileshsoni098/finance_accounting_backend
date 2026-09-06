const userRepository = require("../modules/foundation/repositories/user.repository");
const roleRepository = require("../modules/foundation/repositories/role.repository");

const { verifyAccessToken } = require("../utils/jwt");
const { HttpError } = require("../utils/http-error");

async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const [scheme, token] = header.split(" ");

        if (scheme !== "Bearer" || !token) {
            throw new HttpError(401, "UNAUTHORIZED", "Bearer token missing");
        }

        const claims = verifyAccessToken(token);

        const user = await userRepository.findById(claims.userId);
        if (!user || user.status !== "active") {
            throw new HttpError(401, "UNAUTHORIZED", "User not found or inactive");
        }

        const role = await roleRepository.findByIdAndTenant(claims.roleId, claims.tenantId);
        if (!role || role.status !== "active") {
            throw new HttpError(401, "UNAUTHORIZED", "Role not found or inactive");
        }

        req.auth = {
            userId: user._id,
            tenantId: user.tenantId,
            roleId: user.roleId,
            user,
            role,
        };

        return next();
    } catch (error) {
        if (error instanceof HttpError) {
            return next(error);
        }
        const unauthorized = new HttpError(401, "UNAUTHORIZED", "Invalid or expired token");
        return next(unauthorized);
    }
}

function requirePermission(moduleName, action) {
    return (req, res, next) => {
        const role = req.auth?.role;
        if (!role) {
            return next(new HttpError(401, "UNAUTHORIZED", "Authentication required"));
        }

        const granted = role.permissions.some(
            (p) =>
                (p.module === "*" || p.module === moduleName) &&
                (p.actions.includes("*") || p.actions.includes(action)),
        );

        if (!granted) {
            return next(
                new HttpError(
                    403,
                    "FORBIDDEN",
                    `Permission denied for ${moduleName}:${action}`,
                ),
            );
        }

        return next();
    };
}

module.exports = { requireAuth, requirePermission };