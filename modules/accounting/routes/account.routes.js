const express = require("express");

const accountController = require("../controllers/account.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription, requireModule } = require("../../../middleware/subscription.middleware");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireValidSubscription);
router.use(requireModule("accounting"));

router.get("/", requirePermission("accounting", "read"), accountController.listAccountsHandler);
router.post("/", requirePermission("accounting", "create"), accountController.createAccountHandler);
router.get("/:id", requirePermission("accounting", "read"), accountController.getAccountHandler);
router.patch("/:id", requirePermission("accounting", "update"), accountController.updateAccountHandler);

module.exports = router;