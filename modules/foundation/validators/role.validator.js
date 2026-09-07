const mongoose = require("mongoose");

const { HttpError } = require("../../../utils/http-error");
const { isKnownModule, isKnownAction } = require("../constants/permissions");

const ALLOWED_STATUSES = ["active", "inactive"];

function validateRoleId(param) {
    if (!mongoose.isValidObjectId(param)) {
        throw new HttpError(400, "INVALID_INPUT", "roleId must be a valid ObjectId");
    }
}

function validateRolePayload(body, { partial = false } = {}) {
    const errors = [];
    const data = {};

    if (!partial || body.name !== undefined) {
        if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 80) {
            errors.push("name must be between 2 and 80 characters");
        } else {
            data.name = body.name.trim();
        }
    }

    if (!partial || body.key !== undefined) {
        if (partial) {
            errors.push("key cannot be changed on update");
        } else if (!body.key || typeof body.key !== "string" || !/^[a-z][a-z0-9_]*$/.test(body.key)) {
            errors.push("key must match ^[a-z][a-z0-9_]*$");
        } else {
            data.key = body.key;
        }
    }

    if (body.permissions !== undefined) {
        if (!Array.isArray(body.permissions)) {
            errors.push("permissions must be an array");
        } else {
            const normalized = [];
            for (const permission of body.permissions) {
                if (!permission || typeof permission !== "object" || !permission.module || !Array.isArray(permission.actions) || permission.actions.length === 0) {
                    errors.push("each permission must have a module and a non-empty actions array");
                    continue;
                }
                if (!isKnownModule(permission.module)) {
                    errors.push(`unknown module '${permission.module}'`);
                    continue;
                }
                if (!permission.actions.every((action) => isKnownAction(permission.module, String(action)))) {
                    errors.push(`invalid action for module '${permission.module}'`);
                    continue;
                }
                normalized.push({
                    module: permission.module,
                    actions: [...new Set(permission.actions.map((action) => String(action)))],
                });
            }
            data.permissions = normalized;
        }
    }

    if (body.status !== undefined) {
        if (!ALLOWED_STATUSES.includes(body.status)) {
            errors.push("status must be active or inactive");
        } else {
            data.status = body.status;
        }
    }

    if (errors.length) {
        throw new HttpError(400, "INVALID_INPUT", errors.join("; "));
    }
    return data;
}

module.exports = { validateRoleId, validateRolePayload };