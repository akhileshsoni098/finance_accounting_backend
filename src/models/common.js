const mongoose = require("mongoose");

const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;

const tenantFields = {
  tenantId: { type: objectId, ref: "Tenant", required: true, immutable: true },
  entityId: { type: objectId, ref: "Entity" },
};

const moneyAmount = {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be an integer minor unit",
  },
};

const currency = {
  type: String,
  required: true,
  uppercase: true,
  match: /^[A-Z]{3}$/,
};

module.exports = { Schema, objectId, tenantFields, moneyAmount, currency };
