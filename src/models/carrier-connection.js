const mongoose = require("mongoose");
const { Schema, currency } = require("./common");

const carrierConnectionSchema = new Schema(
  {
    requesterTenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    requesterEntityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    carrierTenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    carrierEntityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    connectionCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "rejected", "suspended", "revoked"],
      default: "pending",
    },
    supportedBillingModels: {
      type: [String],
      enum: ["DBA", "DBM", "DBC"],
      required: true,
    },
    settlementCurrency: currency,
    permissions: {
      submitBordereau: { type: Boolean, default: true },
      viewBordereau: { type: Boolean, default: true },
      acceptBordereau: { type: Boolean, default: false },
      postSettlement: { type: Boolean, default: false },
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedAt: { type: Date, default: Date.now, immutable: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    decisionComment: { type: String, trim: true, maxlength: 1000 },
    configuration: {
      carrierReference: { type: String, trim: true, maxlength: 120 },
      submissionFrequency: {
        type: String,
        enum: ["monthly", "quarterly", "ad_hoc"],
      },
      requiredFields: [{ type: String, trim: true }],
    },
  },
  { timestamps: true, strict: "throw" },
);

carrierConnectionSchema.index(
  {
    requesterTenantId: 1,
    requesterEntityId: 1,
    carrierTenantId: 1,
    carrierEntityId: 1,
  },
  { unique: true },
);
carrierConnectionSchema.index({ requesterTenantId: 1, status: 1 });
carrierConnectionSchema.index({ carrierTenantId: 1, status: 1 });

module.exports = mongoose.model("CarrierConnection", carrierConnectionSchema);
