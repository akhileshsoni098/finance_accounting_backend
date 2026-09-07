const express = require("express");

const fiscalPeriodController = require("../controllers/fiscalPeriod.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription, requireModule } = require("../../../middleware/subscription.middleware");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireValidSubscription);
router.use(requireModule("accounting"));

router.get("/", requirePermission("accounting", "read"), fiscalPeriodController.listFiscalPeriodsHandler);
router.post("/", requirePermission("accounting", "create"), fiscalPeriodController.createFiscalPeriodHandler);
router.get("/:id", requirePermission("accounting", "read"), fiscalPeriodController.getFiscalPeriodHandler);
router.patch("/:id", requirePermission("accounting", "update"), fiscalPeriodController.updateFiscalPeriodHandler);
router.post("/:id/close", requirePermission("accounting", "update"), fiscalPeriodController.closeFiscalPeriodHandler);
router.post("/:id/reopen", requirePermission("accounting", "update"), fiscalPeriodController.reopenFiscalPeriodHandler);
router.post("/:id/lock", requirePermission("accounting", "update"), fiscalPeriodController.lockFiscalPeriodHandler);
router.post("/:id/current", requirePermission("accounting", "update"), fiscalPeriodController.setCurrentFiscalPeriodHandler);

module.exports = router;