const mongoose = require("mongoose");
const { Schema, tenantFields } = require("./common");

const accountSchema = new Schema(
  {
    ...tenantFields,
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    code: { type: String, required: true, trim: true, maxlength: 32 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    accountGroup: {
      type: String,
      required: true,
      enum: ["asset", "liability", "equity", "revenue", "expense"],
    },
    normalBalance: { type: String, required: true, enum: ["debit", "credit"] },
    parentAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    isControl: { type: Boolean, default: false },
    isTrust: { type: Boolean, default: false },
    dimensions: [{ type: String, trim: true }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true, strict: "throw" },
);

accountSchema.index({ tenantId: 1, entityId: 1, code: 1 }, { unique: true });
accountSchema.index({ tenantId: 1, entityId: 1, parentAccountId: 1 });

module.exports = mongoose.model("Account", accountSchema);
