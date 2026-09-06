const express = require("express");

const authRoutes = require("./auth.routes");
const tenantRoutes = require("./tenant.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/tenants", tenantRoutes);

module.exports = router;