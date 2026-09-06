const express = require("express");

const tenantController = require("../controllers/tenant.controller");
const { requireAuth } = require("../../../middleware/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, tenantController.listTenantsHandler);
router.get("/:id", requireAuth, tenantController.getTenantHandler);

module.exports = router;