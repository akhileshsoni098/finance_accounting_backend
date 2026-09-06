const mongoose = require("mongoose");

const { Schema } = mongoose;

const tenantSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9]{2,12}$/,
      unique: true,
    },

    businessType: {
      type: String,
      required: true,
      enum: [
        "agency",
        "mga",
        "broker",
        "carrier",
        "reinsurer",
        "insured",
        "business",
      ],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
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
    },

    logo: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "inactive"],
      default: "active",
      index: true,
    },

    setupStage: {
      type: String,
      enum: [
        "registration",
        "organization",
        "accounting",
        "complete",
      ],
      default: "registration",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);