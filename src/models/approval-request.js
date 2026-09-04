const mongoose = require("mongoose");
const { Schema, tenantFields, moneyAmount, currency } = require("./common");

const approvalStepSchema = new Schema(
  {
    order: { type: Number, required: true, min: 1 },
    approverUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    decision: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    comment: { type: String, trim: true, maxlength: 1000 },
    decidedAt: Date,
  },
  { _id: false, strict: "throw" },
);

const approvalRequestSchema = new Schema(
  {
    ...tenantFields,
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    resourceType: { type: String, required: true, immutable: true },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    journalEntryId: {
      type: Schema.Types.ObjectId,
      ref: "JournalEntry",
      immutable: true,
    },
    thresholdMinor: { ...moneyAmount, immutable: true },
    currency,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    steps: {
      type: [approvalStepSchema],
      required: true,
      validate: (steps) => steps.length > 0,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    requestedAt: { type: Date, default: Date.now, immutable: true },
    completedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);

approvalRequestSchema.index({ tenantId: 1, status: 1, createdAt: 1 });
approvalRequestSchema.index({
  tenantId: 1,
  "steps.approverUserId": 1,
  status: 1,
});
approvalRequestSchema.index(
  { tenantId: 1, resourceType: 1, resourceId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

module.exports = mongoose.model("ApprovalRequest", approvalRequestSchema);
