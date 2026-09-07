const mongoose = require("mongoose");

const { Schema } = mongoose;

const journalNumberCounterSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },

    seq: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

journalNumberCounterSchema.index({ tenantId: 1, entityId: 1 }, { unique: true });

module.exports = mongoose.model("JournalNumberCounter", journalNumberCounterSchema);