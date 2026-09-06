const express = require("express");

const roleController = require("../controllers/role.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription } = require("../../../middleware/subscription.middleware");

const router = express.Router();

router.use(requireAuth, requireValidSubscription);

router.get("/", requirePermission("roles", "read"), roleController.listRoles);
router.post("/", requirePermission("roles", "create"), roleController.createRole);
router.get("/:id", requirePermission("roles", "read"), roleController.getRole);
router.patch("/:id", requirePermission("roles", "update"), roleController.updateRole);
router.delete("/:id", requirePermission("roles", "delete"), roleController.deleteRole);

module.exports = router;