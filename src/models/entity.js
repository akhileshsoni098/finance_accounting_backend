const mongoose = require("mongoose");
const { Schema, tenantFields, currency } = require("./common");

const entitySchema = new Schema(
  {
    ...tenantFields,
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 32,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    type: {
      type: String,
      required: true,
      enum: [
        "broker",
        "mga",
        "carrier",
        "reinsurer",
        "insured",
        "branch",
        "legal",
      ],
    },
    baseCurrency: currency,
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true, strict: "throw" },
);

entitySchema.index({ tenantId: 1, code: 1 }, { unique: true });
entitySchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model("Entity", entitySchema);
