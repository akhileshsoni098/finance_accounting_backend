const mongoose = require("mongoose");

const { Schema } = mongoose;

const journalLineSchema = new Schema(
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

    journalEntryId: {
      type: Schema.Types.ObjectId,
      ref: "JournalEntry",
      required: true,
      immutable: true,
      index: true,
    },

    lineNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },

    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      immutable: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    currency: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    debit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    credit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

journalLineSchema.index({ tenantId: 1, entityId: 1, journalEntryId: 1, lineNumber: 1 });
journalLineSchema.index({ tenantId: 1, entityId: 1, accountId: 1 });

module.exports = mongoose.model("JournalLine", journalLineSchema);