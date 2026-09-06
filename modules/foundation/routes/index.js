const express = require("express");

const authRoutes = require("./auth.routes");
const tenantRoutes = require("./tenant.routes");
const roleRoutes = require("./role.routes");
const subscriptionRoutes = require("./subscription.routes");
const permissionRoutes = require("./permission.routes");
const planRoutes = require("./plan.routes");
const userRoutes = require("./user.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/tenants", tenantRoutes);
router.use("/roles", roleRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/permissions", permissionRoutes);
router.use("/plans", planRoutes);
router.use("/users", userRoutes);

module.exports = router;