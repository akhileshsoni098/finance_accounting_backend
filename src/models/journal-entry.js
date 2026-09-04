const mongoose = require("mongoose");
const { Schema, tenantFields, moneyAmount, currency } = require("./common");

const journalLineSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      immutable: true,
    },
    debitMinor: { ...moneyAmount, default: 0 },
    creditMinor: { ...moneyAmount, default: 0 },
    currency,
    dimensions: { type: Map, of: String },
    counterpartyId: { type: Schema.Types.ObjectId, ref: "Party" },
    policyId: { type: Schema.Types.ObjectId, ref: "Policy" },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    description: { type: String, trim: true, maxlength: 500 },
  },
  { _id: true, strict: "throw" },
);

journalLineSchema.pre("validate", function (next) {
  const hasDebit = this.debitMinor > 0;
  const hasCredit = this.creditMinor > 0;
  if (hasDebit === hasCredit)
    return next(
      new Error(
        "A journal line must contain exactly one positive debit or credit",
      ),
    );
  next();
});

const journalEntrySchema = new Schema(
  {
    ...tenantFields,
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
      immutable: true,
    },
    entryNumber: { type: String, required: true, trim: true, immutable: true },
    entryDate: { type: Date, required: true, immutable: true },
    fiscalPeriodId: {
      type: Schema.Types.ObjectId,
      ref: "FiscalPeriod",
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["draft", "pending_approval", "posted", "rejected", "reversed"],
      default: "draft",
    },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    sourceType: { type: String, required: true, trim: true, immutable: true },
    sourceId: { type: Schema.Types.ObjectId, immutable: true },
    accountingEventId: {
      type: Schema.Types.ObjectId,
      ref: "AccountingEvent",
      immutable: true,
    },
    approvalRequestId: { type: Schema.Types.ObjectId, ref: "ApprovalRequest" },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },
    currency,
    lines: {
      type: [journalLineSchema],
      required: true,
      validate: {
        validator: (lines) => lines.length >= 2,
        message: "A journal entry requires at least two lines",
      },
    },
    totalDebitMinor: { ...moneyAmount, default: 0 },
    totalCreditMinor: { ...moneyAmount, default: 0 },
    postedAt: Date,
    postedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, strict: "throw" },
);

journalEntrySchema.pre("validate", function (next) {
  this.totalDebitMinor = this.lines.reduce(
    (total, line) => total + line.debitMinor,
    0,
  );
  this.totalCreditMinor = this.lines.reduce(
    (total, line) => total + line.creditMinor,
    0,
  );
  if (this.totalDebitMinor !== this.totalCreditMinor)
    return next(new Error("Journal entry debits and credits must balance"));
  next();
});

journalEntrySchema.pre(
  ["updateOne", "findOneAndUpdate", "deleteOne", "findOneAndDelete"],
  function (next) {
    if (this.getQuery().status === "posted")
      return next(new Error("Posted journal entries are immutable"));
    next();
  },
);

journalEntrySchema.index(
  { tenantId: 1, entityId: 1, entryNumber: 1 },
  { unique: true },
);
journalEntrySchema.index({ tenantId: 1, entityId: 1, entryDate: 1, status: 1 });
journalEntrySchema.index(
  { tenantId: 1, accountingEventId: 1 },
  { unique: true, sparse: true },
);
journalEntrySchema.index({ tenantId: 1, correlationId: 1 });

module.exports = mongoose.model("JournalEntry", journalEntrySchema);
