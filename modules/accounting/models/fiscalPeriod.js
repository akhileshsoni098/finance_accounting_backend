const mongoose = require("mongoose");

const { Schema } = mongoose;

const PERIOD_STATUSES = ["open", "closed", "locked"];

const fiscalPeriodSchema = new Schema(
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

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9-_]{1,30}$/,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    fiscalYear: {
      type: Number,
      min: 1900,
      max: 2100,
    },

    status: {
      type: String,
      enum: PERIOD_STATUSES,
      default: "open",
      index: true,
    },

    isCurrent: {
      type: Boolean,
      default: false,
    },

    closedAt: {
      type: Date,
    },

    closedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    lockedAt: {
      type: Date,
    },

    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

fiscalPeriodSchema.index({ tenantId: 1, entityId: 1, code: 1 }, { unique: true });
fiscalPeriodSchema.index({ tenantId: 1, entityId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("FiscalPeriod", fiscalPeriodSchema);