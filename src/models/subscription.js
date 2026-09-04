const mongoose = require("mongoose");
const { Schema } = require("./common");

const subscriptionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    plan: { type: String, enum: ["trial", "starter", "professional", "enterprise"], required: true },
    status: { type: String, enum: ["trialing", "active", "past_due", "cancelled", "suspended"], default: "trialing" },
    provider: { type: String, enum: ["manual", "stripe", "razorpay"], default: "manual" },
    providerCustomerId: { type: String, trim: true, maxlength: 200 },
    providerSubscriptionId: { type: String, trim: true, maxlength: 200 },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    limits: {
      users: { type: Number, min: 1 },
      entities: { type: Number, min: 1 },
      monthlyBordereaux: { type: Number, min: 0 },
    },
    cancelledAt: Date,
  },
  { timestamps: true, strict: "throw" },
);

subscriptionSchema.path("currentPeriodEnd").validate(function (value) {
  return value > this.currentPeriodStart;
}, "Subscription period end must be after period start");
subscriptionSchema.index({ tenantId: 1 }, { unique: true });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ provider: 1, providerSubscriptionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);
