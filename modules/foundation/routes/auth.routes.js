const express = require("express");

const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../../../middleware/auth.middleware");

const router = express.Router();

router.post("/register", authController.registerHandler);
router.post("/login", authController.loginHandler);
router.get("/me", requireAuth, authController.meHandler);

module.exports = router;