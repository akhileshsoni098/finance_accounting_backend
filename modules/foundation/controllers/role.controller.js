const roleService = require("../services/role.service");
const {
  validateRoleId,
  validateRolePayload,
} = require("../validators/role.validator");

const { HttpError } = require("../../../utils/http-error");

async function listRoles(req, res, next) {
  try {
    const roles = await roleService.listByTenant(req.auth.tenantId);
    res.json({ roles: roles.map(roleService.toPublic) });
  } catch (error) {
    next(error);
  }
}

async function createRole(req, res, next) {
  try {
    const data = validateRolePayload(req.body);
    data.tenantId = req.auth.tenantId;
    data.status = data.status || "active";

    const role = await roleService.createRole(data);
    res.status(201).json({ role: roleService.toPublic(role) });
  } catch (error) {
    next(error);
  }
}

async function getRole(req, res, next) {
  try {
    validateRoleId(req.params.id);
    const role = await roleService.getByIdAndTenant(
      req.params.id,
      req.auth.tenantId,
    );
    if (!role) {
      throw new HttpError(404, "ROLE_NOT_FOUND", "Role not found");
    }
    res.json({ role: roleService.toPublic(role) });
  } catch (error) {
    next(error);
  }
}

async function updateRole(req, res, next) {
  try {
    validateRoleId(req.params.id);
    const data = validateRolePayload(req.body, { partial: true });
    const role = await roleService.updateRole(
      req.params.id,
      req.auth.tenantId,
      data,
    );
    res.json({ role: roleService.toPublic(role) });
  } catch (error) {
    next(error);
  }
}

async function deleteRole(req, res, next) {
  try {
    validateRoleId(req.params.id);
    await roleService.deleteRole(req.params.id, req.auth.tenantId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = { listRoles, createRole, getRole, updateRole, deleteRole };
