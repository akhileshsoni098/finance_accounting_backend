const express = require("express");

const permissionController = require("../controllers/permission.controller");
const { requireAuth } = require("../../../middleware/auth.middleware");
const { requireValidSubscription } = require("../../../middleware/subscription.middleware");

const router = express.Router();

router.get("/", requireAuth, requireValidSubscription, permissionController.listPermissions);

module.exports = router;