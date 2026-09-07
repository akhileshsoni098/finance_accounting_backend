const express = require("express");

const journalEntryController = require("../controllers/journalEntry.controller");
const { requireAuth, requirePermission } = require("../../../middleware/auth.middleware");
const { requireValidSubscription, requireModule } = require("../../../middleware/subscription.middleware");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireValidSubscription);
router.use(requireModule("accounting"));

router.get("/", requirePermission("accounting", "read"), journalEntryController.listJournalEntriesHandler);
router.post("/", requirePermission("accounting", "create"), journalEntryController.createJournalEntryHandler);
router.get("/:journalId", requirePermission("accounting", "read"), journalEntryController.getJournalEntryHandler);
router.patch("/:journalId", requirePermission("accounting", "update"), journalEntryController.updateJournalEntryHandler);
router.post("/:journalId/post", requirePermission("accounting", "update"), journalEntryController.postJournalEntryHandler);

module.exports = router;