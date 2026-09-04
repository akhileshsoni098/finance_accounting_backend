const mongoose = require("mongoose");
const { Schema, tenantFields } = require("./common");

const auditLogSchema = new Schema(
  {
    ...tenantFields,
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    action: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    resourceType: {
      type: String,
      required: true,
      immutable: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      immutable: true,
    },
    before: {
      type: Schema.Types.Mixed,
      immutable: true,
    },
    after: {
      type: Schema.Types.Mixed,
      immutable: true,
    },
    details: {
      type: Schema.Types.Mixed,
      immutable: true,
    },
    requestId: {
      type: String,
      required: true,
      immutable: true,
    },
    sourceModule: {
      type: String,
      required: true,
      immutable: true,
    },
    correlationId: {
      type: String,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  { timestamps: true, strict: "throw" },
);

auditLogSchema.index({ tenantId: 1, occurredAt: 1 });
auditLogSchema.index({
  tenantId: 1,
  resourceType: 1,
  resourceId: 1,
  occurredAt: 1,
});
auditLogSchema.index({ tenantId: 1, requestId: 1 });
auditLogSchema.pre(
  ["updateOne", "findOneAndUpdate", "deleteOne", "findOneAndDelete"],
  function () {
    throw new Error("Audit logs are append-only");
  },
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
