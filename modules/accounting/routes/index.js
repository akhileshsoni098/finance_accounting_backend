const express = require("express");

const entityRoutes = require("./entity.routes");
const accountRoutes = require("./account.routes");
const fiscalPeriodRoutes = require("./fiscalPeriod.routes");
const journalEntryRoutes = require("./journalEntry.routes");

const router = express.Router();

router.use("/entities/:entityId/journal-entries", journalEntryRoutes);
router.use("/entities/:entityId/fiscal-periods", fiscalPeriodRoutes);
router.use("/entities/:entityId/accounts", accountRoutes);
router.use("/entities", entityRoutes);

module.exports = router;