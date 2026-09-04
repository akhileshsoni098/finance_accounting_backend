const mongoose = require("mongoose");
const { Schema, currency } = require("./common");

const bordereauTransactionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    bordereauId: { type: Schema.Types.ObjectId, ref: "Bordereau", required: true, immutable: true },
    policyId: { type: Schema.Types.ObjectId, ref: "Policy" },
    policyNumber: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
    insuredPartyId: { type: Schema.Types.ObjectId, ref: "Party" },
    transactionId: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    transactionType: {
      type: String,
      enum: ["bind", "endorsement", "renewal", "cancellation", "reinstatement", "adjustment", "claim"],
      required: true,
      immutable: true,
    },
    direction: { type: String, enum: ["original", "reversal"], default: "original", immutable: true },
    effectiveDate: { type: Date, required: true, immutable: true },
    state: { type: String, required: true, uppercase: true, trim: true, maxlength: 2 },
    lineOfBusiness: { type: String, required: true, trim: true, maxlength: 80 },
    grossPremiumMinor: { type: Number, required: true, min: 0 },
    brokerCommissionMinor: { type: Number, required: true, min: 0 },
    mgaFeeMinor: { type: Number, required: true, min: 0 },
    taxMinor: { type: Number, required: true, min: 0 },
    feesMinor: { type: Number, required: true, min: 0 },
    netCarrierSettlementMinor: { type: Number, required: true, min: 0 },
    currency,
    status: { type: String, enum: ["pending", "valid", "invalid", "posted"], default: "pending" },
    validationErrors: [{ code: String, message: String, field: String }],
    sourceRowNumber: { type: Number, min: 1 },
    accountingEventId: { type: Schema.Types.ObjectId, ref: "AccountingEvent" },
  },
  { timestamps: true, strict: "throw" },
);

bordereauTransactionSchema.pre("validate", function (next) {
  const expectedNet = this.grossPremiumMinor - this.brokerCommissionMinor - this.mgaFeeMinor - this.taxMinor - this.feesMinor;
  if (expectedNet !== this.netCarrierSettlementMinor) {
    return next(new Error("Net carrier settlement does not match transaction amounts"));
  }
  next();
});

bordereauTransactionSchema.index({ tenantId: 1, bordereauId: 1, transactionId: 1 }, { unique: true });
bordereauTransactionSchema.index({ tenantId: 1, bordereauId: 1, sourceRowNumber: 1 }, { unique: true, sparse: true });
bordereauTransactionSchema.index({ tenantId: 1, policyNumber: 1, effectiveDate: 1 });
bordereauTransactionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("BordereauTransaction", bordereauTransactionSchema);
