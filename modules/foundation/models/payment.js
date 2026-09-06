const mongoose = require("mongoose");

const { Schema } = mongoose;

const paymentSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        subscriptionId: {
            type: Schema.Types.ObjectId,
            ref: "Subscription",
            required: true,
        },
        plan: {
            type: String,
            required: true,
            trim: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "USD",
            uppercase: true,
        },
        method: {
            type: String,
            enum: ["card"],
            default: "card",
        },
        provider: {
            type: String,
            default: "dummy",
        },
        status: {
            type: String,
            enum: ["paid", "failed", "pending"],
            default: "paid",
        },
        reference: {
            type: String,
            unique: true,
            index: true,
        },
        cardLast4: {
            type: String,
            trim: true,
        },
        paidAt: {
            type: Date,
        },
    },
    { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);