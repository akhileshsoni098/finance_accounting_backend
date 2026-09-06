const mongoose = require("mongoose");

const { Schema } = mongoose;

const planModuleSchema = new Schema(
    {
        key: {
            type: String,
            required: true,
            trim: true,
        },
        features: {
            type: [String],
            default: [],
        },
    },
    { _id: false },
);

const planSchema = new Schema(
    {
        key: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            lowercase: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "USD",
            uppercase: true,
        },
        billingCycle: {
            type: String,
            enum: ["monthly", "quarterly", "yearly"],
            default: "monthly",
        },
        limits: {
            users: { type: Number, min: 1 },
            storageGB: { type: Number, min: 1 },
            entities: { type: Number, min: 0 },
            monthlyBordereaux: { type: Number, min: 0 },
        },
        modules: {
            type: [planModuleSchema],
            default: [],
        },
        status: {
            type: String,
            enum: ["active", "archived"],
            default: "active",
        },
    },
    { timestamps: true },
);

module.exports = mongoose.model("SubscriptionPlan", planSchema);