const accountService = require("../services/account.service");
const {
    validateAccountId,
    validateEntityId,
    validateCreateAccount,
    validateUpdateAccount,
} = require("../validators/account.validator");

async function listAccountsHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        const accounts = await accountService.listByEntity(
            req.auth.tenantId,
            req.params.entityId,
            { accountType: req.query.accountType, status: req.query.status, allowPosting: req.query.allowPosting },
        );
        return res.json({ accounts: accounts.map(accountService.toPublic) });
    } catch (error) {
        return next(error);
    }
}

async function getAccountHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateAccountId(req.params.id);
        const account = await accountService.getByIdAndEntity(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
        );
        return res.json({ account: accountService.toPublic(account) });
    } catch (error) {
        return next(error);
    }
}

async function createAccountHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        const data = validateCreateAccount(req.body);
        const account = await accountService.createAccount(req.auth.tenantId, req.params.entityId, data);
        return res.status(201).json({ account: accountService.toPublic(account) });
    } catch (error) {
        return next(error);
    }
}

async function updateAccountHandler(req, res, next) {
    try {
        validateEntityId(req.params.entityId);
        validateAccountId(req.params.id);
        const data = validateUpdateAccount(req.body);
        const account = await accountService.updateAccount(
            req.params.id,
            req.auth.tenantId,
            req.params.entityId,
            data,
        );
        return res.json({ account: accountService.toPublic(account) });
    } catch (error) {
        return next(error);
    }
}

module.exports = { listAccountsHandler, getAccountHandler, createAccountHandler, updateAccountHandler };