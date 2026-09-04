const mongoose = require("mongoose");
const { Schema, tenantFields } = require("./common");

const fiscalPeriodSchema = new Schema(
  {
    ...tenantFields,
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["future", "open", "closed", "locked"],
      default: "future",
    },
    closedAt: Date,
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lockedAt: Date,
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closeChecklist: [
      {
        key: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true, strict: "throw" },
);

fiscalPeriodSchema.path("endDate").validate(function (value) {
  return value > this.startDate;
}, "End date must be after start date");
fiscalPeriodSchema.index(
  { tenantId: 1, entityId: 1, startDate: 1, endDate: 1 },
  { unique: true },
);
fiscalPeriodSchema.index({ tenantId: 1, entityId: 1, status: 1, startDate: 1 });

module.exports = mongoose.model("FiscalPeriod", fiscalPeriodSchema);
