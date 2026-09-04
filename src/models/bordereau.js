const mongoose = require("mongoose");
const { Schema, currency } = require("./common");

const bordereauSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    mgaEntityId: { type: Schema.Types.ObjectId, ref: "Entity", required: true, immutable: true },
    carrierConnectionId: { type: Schema.Types.ObjectId, ref: "CarrierConnection", required: true, immutable: true },
    carrierTenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    carrierEntityId: { type: Schema.Types.ObjectId, ref: "Entity", required: true, immutable: true },
    bordereauNumber: { type: String, required: true, trim: true, immutable: true, maxlength: 80 },
    bordereauType: { type: String, enum: ["production", "settlement", "claims", "commission"], required: true },
    billingModel: { type: String, enum: ["DBA", "DBM", "DBC"], required: true, immutable: true },
    periodStart: { type: Date, required: true, immutable: true },
    periodEnd: { type: Date, required: true, immutable: true },
    currency,
    status: {
      type: String,
      enum: ["draft", "submitted", "validating", "accepted", "rejected", "ingested", "posted"],
      default: "draft",
    },
    transactionCount: { type: Number, min: 0, default: 0 },
    grossPremiumMinor: { type: Number, min: 0, default: 0 },
    brokerCommissionMinor: { type: Number, min: 0, default: 0 },
    mgaFeeMinor: { type: Number, min: 0, default: 0 },
    taxMinor: { type: Number, min: 0, default: 0 },
    feesMinor: { type: Number, min: 0, default: 0 },
    netCarrierSettlementMinor: { type: Number, min: 0, default: 0 },
    sourceFileId: { type: Schema.Types.ObjectId, ref: "Document" },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    submittedAt: Date,
    acceptedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acceptedAt: Date,
    correlationId: { type: String, required: true, immutable: true, trim: true },
  },
  { timestamps: true, strict: "throw" },
);

bordereauSchema.path("periodEnd").validate(function (value) {
  return value > this.periodStart;
}, "Bordereau period end must be after period start");
bordereauSchema.index({ tenantId: 1, bordereauNumber: 1 }, { unique: true });
bordereauSchema.index({ tenantId: 1, status: 1, periodStart: -1 });
bordereauSchema.index({ carrierTenantId: 1, carrierEntityId: 1, status: 1 });
bordereauSchema.index({ tenantId: 1, carrierConnectionId: 1, periodStart: -1 });

module.exports = mongoose.model("Bordereau", bordereauSchema);
