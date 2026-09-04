const mongoose = require("mongoose");
const { Schema, tenantFields } = require("./common");

const accountingEventSchema = new Schema(
  {
    ...tenantFields,
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    eventType: { type: String, required: true, trim: true, immutable: true },
    sourceDocumentType: { type: String, required: true, immutable: true },
    sourceDocumentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    payload: { type: Schema.Types.Mixed, required: true },
    payloadVersion: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ["received", "processing", "processed", "failed"],
      default: "received",
    },
    journalEntryIds: [{ type: Schema.Types.ObjectId, ref: "JournalEntry" }],
    correlationId: { type: String, required: true, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now },
    processedAt: Date,
    failure: { code: String, message: String, occurredAt: Date },
  },
  { timestamps: true, strict: "throw" },
);

accountingEventSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true },
);
accountingEventSchema.index({ tenantId: 1, status: 1, occurredAt: 1 });
accountingEventSchema.index({
  tenantId: 1,
  sourceDocumentType: 1,
  sourceDocumentId: 1,
});

module.exports = mongoose.model("AccountingEvent", accountingEventSchema);
