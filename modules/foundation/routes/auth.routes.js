const express = require("express");

const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../../../middleware/auth.middleware");
const { createRateLimiter } = require("../../../middleware/rate-limit.middleware");

const router = express.Router();

const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

router.post("/register", authController.registerHandler);
router.post("/login", loginLimiter, authController.loginHandler);
router.get("/me", requireAuth, authController.meHandler);

module.exports = router;