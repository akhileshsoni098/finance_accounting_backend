const express = require("express");

const entityController = require("../controllers/entity.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription, requireModule } = require("../../../middleware/subscription.middleware");

const router = express.Router();

router.use(requireAuth);
router.use(requireValidSubscription);
router.use(requireModule("accounting"));

router.get("/", requirePermission("accounting", "read"), entityController.listEntitiesHandler);
router.post("/", requirePermission("accounting", "create"), entityController.createEntityHandler);
router.get("/:id", requirePermission("accounting", "read"), entityController.getEntityHandler);
router.patch("/:id", requirePermission("accounting", "update"), entityController.updateEntityHandler);

module.exports = router;