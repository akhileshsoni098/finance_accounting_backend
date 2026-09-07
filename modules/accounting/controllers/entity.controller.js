const entityService = require("../services/entity.service");
const {
    validateEntityId,
    validateCreateEntity,
    validateUpdateEntity,
} = require("../validators/entity.validator");

async function listEntitiesHandler(req, res, next) {
    try {
        const entities = await entityService.listByTenant(req.auth.tenantId);
        return res.json({ entities: entities.map(entityService.toPublic) });
    } catch (error) {
        return next(error);
    }
}

async function getEntityHandler(req, res, next) {
    try {
        validateEntityId(req.params.id);
        const entity = await entityService.getByIdAndTenant(req.params.id, req.auth.tenantId);
        return res.json({ entity: entityService.toPublic(entity) });
    } catch (error) {
        return next(error);
    }
}

async function createEntityHandler(req, res, next) {
    try {
        const data = validateCreateEntity(req.body);
        const entity = await entityService.createEntity(req.auth.tenantId, data);
        return res.status(201).json({ entity: entityService.toPublic(entity) });
    } catch (error) {
        return next(error);
    }
}

async function updateEntityHandler(req, res, next) {
    try {
        validateEntityId(req.params.id);
        const data = validateUpdateEntity(req.body);
        const entity = await entityService.updateEntity(req.params.id, req.auth.tenantId, data);
        return res.json({ entity: entityService.toPublic(entity) });
    } catch (error) {
        return next(error);
    }
}

module.exports = { listEntitiesHandler, getEntityHandler, createEntityHandler, updateEntityHandler };