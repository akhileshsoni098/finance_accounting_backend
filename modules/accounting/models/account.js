const mongoose = require("mongoose");

const { Schema } = mongoose;

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];
const NORMAL_BALANCES = ["debit", "credit"];

const accountSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
      index: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9-_]{2,20}$/,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    accountType: {
      type: String,
      required: true,
      immutable: true,
      enum: ACCOUNT_TYPES,
      index: true,
    },

    accountSubtype: {
      type: String,
      trim: true,
      maxlength: 80,
    },

    parentAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: undefined,
    },

    normalBalance: {
      type: String,
      required: true,
      enum: NORMAL_BALANCES,
    },

    isControlAccount: {
      type: Boolean,
      default: false,
    },

    allowPosting: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

accountSchema.index({ tenantId: 1, entityId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Account", accountSchema);