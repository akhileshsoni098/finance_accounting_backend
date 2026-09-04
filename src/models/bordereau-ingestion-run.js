const mongoose = require("mongoose");
const { Schema } = require("./common");

const bordereauIngestionRunSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    bordereauId: { type: Schema.Types.ObjectId, ref: "Bordereau", required: true, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    status: { type: String, enum: ["received", "validating", "failed", "completed"], default: "received" },
    totalRows: { type: Number, min: 0, default: 0 },
    validRows: { type: Number, min: 0, default: 0 },
    invalidRows: { type: Number, min: 0, default: 0 },
    duplicateRows: { type: Number, min: 0, default: 0 },
    rejectedRows: { type: Number, min: 0, default: 0 },
    errorSummary: [{ code: String, message: String, count: { type: Number, min: 1 } }],
    journalEntryIds: [{ type: Schema.Types.ObjectId, ref: "JournalEntry" }],
    startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    startedAt: { type: Date, default: Date.now, immutable: true },
    completedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);

bordereauIngestionRunSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
bordereauIngestionRunSchema.index({ tenantId: 1, bordereauId: 1, createdAt: -1 });
bordereauIngestionRunSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("BordereauIngestionRun", bordereauIngestionRunSchema);
