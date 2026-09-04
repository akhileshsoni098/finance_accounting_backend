const mongoose = require("mongoose");
const { Schema, currency } = require("./common");

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    businessType: {
      type: String,
      required: true,
      enum: ["agency", "broker", "mga", "carrier", "reinsurer", "business"],
    },
    baseCurrency: currency,
    fiscalYearStartMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      default: 1,
    },
    approvalThresholdMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 1000000,
    },
    enabledModules: [{ type: String, trim: true }],
    enabledDimensions: [{ type: String, trim: true }],
    setupStage: {
      type: String,
      enum: ["setup", "active", "suspended"],
      default: "setup",
    },
  },
  { timestamps: true, strict: "throw" },
);

tenantSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Tenant", tenantSchema);
