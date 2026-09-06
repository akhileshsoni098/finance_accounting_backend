const express = require("express");

const planController = require("../controllers/plan.controller");
const { requireAuth } = require("../../../middleware/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, planController.listPlans);

module.exports = router;