const mongoose = require("mongoose");

const { Schema } = mongoose;

const JOURNAL_STATUSES = ["draft", "posted", "reversed"];

const journalEntrySchema = new Schema(
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

    fiscalPeriodId: {
      type: Schema.Types.ObjectId,
      ref: "FiscalPeriod",
      required: true,
    },

    journalNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      match: /^JE-\d{6}$/,
    },

    entryDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: JOURNAL_STATUSES,
      default: "draft",
      index: true,
    },

    reference: {
      type: String,
      trim: true,
      maxlength: 100,
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

    totalDebit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    totalCredit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    source: {
      type: String,
      trim: true,
      maxlength: 60,
    },

    sourceId: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    reversalOfId: {
      type: Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: undefined,
    },

    reversedById: {
      type: Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: undefined,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    postedAt: {
      type: Date,
    },

    postedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

journalEntrySchema.index({ tenantId: 1, entityId: 1, journalNumber: 1 }, { unique: true });
journalEntrySchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
journalEntrySchema.index({ tenantId: 1, entityId: 1, status: 1 });
journalEntrySchema.index({ tenantId: 1, entityId: 1, entryDate: 1 });

module.exports = mongoose.model("JournalEntry", journalEntrySchema);