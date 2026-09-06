const mongoose = require("mongoose");

const { Schema } = mongoose;

const moduleSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const subscriptionSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      immutable: true,
      index: true,
    },

    plan: {
      type: String,
      enum: [
        "trial",
        "starter",
        "professional",
        "enterprise",
      ],
      default: "trial",
    },

    status: {
      type: String,
      enum: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "suspended",
      ],
      default: "trialing",
      index: true,
    },

    modules: {
      type: [moduleSchema],
      default: [
        {
          key: "accounting",
          enabled: true,
        },
      ],
    },

    limits: {
      users: {
        type: Number,
        min: 1,
        default: 5,
      },

      storageGB: {
        type: Number,
        min: 1,
        default: 10,
      },

      entities: {
        type: Number,
        min: 1,
      },

      monthlyBordereaux: {
        type: Number,
        min: 0,
      },
    },

    billingCycle: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      default: "monthly",
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

subscriptionSchema.path("endDate").validate(function (value) {
  return value > this.startDate;
}, "Subscription end date must be after start date");

module.exports = mongoose.model(
  "Subscription",
  subscriptionSchema
);