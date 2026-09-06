const userService = require("../services/user.service");

const { validateUserId, validateCreateUser, validateUpdateUser } = require("../validators/user.validator");

async function listUsersHandler(req, res, next) {
    try {
        const users = await userService.listByTenant(req.auth.tenantId);
        return res.json({ users: users.map((user) => userService.toPublic(user)) });
    } catch (error) {
        return next(error);
    }
}

async function getUserHandler(req, res, next) {
    try {
        validateUserId(req.params.id);
        const user = await userService.getByIdAndTenant(req.params.id, req.auth.tenantId);
        return res.json({ user: userService.toPublic(user) });
    } catch (error) {
        return next(error);
    }
}

async function createUserHandler(req, res, next) {
    try {
        validateCreateUser(req.body);
        const user = await userService.createUser(
            {
                tenantId: req.auth.tenantId,
                roleId: req.body.roleId,
                email: req.body.email,
                password: req.body.password,
                displayName: req.body.displayName,
            },
        );
        return res.status(201).json({ user: userService.toPublic(user) });
    } catch (error) {
        return next(error);
    }
}

async function updateUserHandler(req, res, next) {
    try {
        validateUserId(req.params.id);
        validateUpdateUser(req.body);
        const user = await userService.updateUser(
            req.params.id,
            req.auth.tenantId,
            req.body,
            { actorId: req.auth.userId },
        );
        return res.json({ user: userService.toPublic(user) });
    } catch (error) {
        return next(error);
    }
}

async function suspendUserHandler(req, res, next) {
    try {
        validateUserId(req.params.id);
        const user = await userService.suspendUser(req.params.id, req.auth.tenantId, {
            actorId: req.auth.userId,
        });
        return res.json({ user: userService.toPublic(user) });
    } catch (error) {
        return next(error);
    }
}

async function activateUserHandler(req, res, next) {
    try {
        validateUserId(req.params.id);
        const user = await userService.activateUser(req.params.id, req.auth.tenantId, {
            actorId: req.auth.userId,
        });
        return res.json({ user: userService.toPublic(user) });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listUsersHandler,
    getUserHandler,
    createUserHandler,
    updateUserHandler,
    suspendUserHandler,
    activateUserHandler,
};