const mongoose = require("mongoose");

const { Schema } = mongoose;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_RE = /^https?:\/\/.+/i;

const addressSchema = new Schema(
  {
    line1: { type: String, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 60 },
    postalCode: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const entitySchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      immutable: true,
      enum: ["mga", "broker", "carrier", "insured", "agency", "reinsurer"],
      index: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9]{2,12}$/,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    legalName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    registrationNumber: {
      type: String,
      trim: true,
      maxlength: 60,
    },

    taxId: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: (value) => EMAIL_RE.test(value),
        message: "email is invalid",
      },
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    website: {
      type: String,
      trim: true,
      maxlength: 200,
      validate: {
        validator: (value) => WEBSITE_RE.test(value),
        message: "website must be a valid URL",
      },
    },

    address: {
      type: addressSchema,
      default: undefined,
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "USD",
      match: /^[A-Z]{3}$/,
    },

    parentEntityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      default: undefined,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "inactive"],
      default: "active",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

entitySchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Entity", entitySchema);