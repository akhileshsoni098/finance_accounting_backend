const express = require("express");

const subscriptionController = require("../controllers/subscription.controller");
const paymentController = require("../controllers/payment.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription } = require("../../../middleware/subscription.middleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("subscriptions", "read"), subscriptionController.getSubscription);
router.patch("/:id", requireValidSubscription, requirePermission("subscriptions", "update"), subscriptionController.updateSubscription);
router.post("/:id/pay", requirePermission("subscriptions", "update"), paymentController.paySubscription);

module.exports = router;