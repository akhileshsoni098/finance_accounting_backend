const express = require("express");

const userController = require("../controllers/user.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription } = require("../../../middleware/subscription.middleware");

const router = express.Router();

router.use(requireAuth, requireValidSubscription);

router.get("/", requirePermission("users", "read"), userController.listUsersHandler);
router.post("/", requirePermission("users", "create"), userController.createUserHandler);
router.get("/:id", requirePermission("users", "read"), userController.getUserHandler);
router.patch("/:id", requirePermission("users", "update"), userController.updateUserHandler);
router.post("/:id/suspend", requirePermission("users", "update"), userController.suspendUserHandler);
router.post("/:id/activate", requirePermission("users", "update"), userController.activateUserHandler);

module.exports = router;