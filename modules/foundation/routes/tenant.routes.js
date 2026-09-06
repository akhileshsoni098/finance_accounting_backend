const express = require("express");

const tenantController = require("../controllers/tenant.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription } = require("../../../middleware/subscription.middleware");

const router = express.Router();

router.use(requireAuth, requireValidSubscription);

router.get("/", tenantController.listTenantsHandler);
router.get("/:id", tenantController.getTenantHandler);
router.patch("/:id", requirePermission("tenants", "update"), tenantController.updateTenantHandler);

module.exports = router;