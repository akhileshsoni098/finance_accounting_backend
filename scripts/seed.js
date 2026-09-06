const { connectDB } = require("../config/db");
const planRepository = require("../modules/foundation/repositories/plan.repository");

const PLANS = [
    {
        key: "trial",
        name: "Trial",
        description: "Free 14-day trial with the Accounting module",
        price: 0,
        currency: "USD",
        billingCycle: "monthly",
        limits: { users: 5, storageGB: 10, entities: 1, monthlyBordereaux: 100 },
        modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
        status: "active",
    },
    {
        key: "starter",
        name: "Starter",
        description: "For small insurance agencies and MGAs",
        price: 99,
        currency: "USD",
        billingCycle: "monthly",
        limits: { users: 10, storageGB: 25, entities: 3, monthlyBordereaux: 1000 },
        modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
        status: "active",
    },
    {
        key: "professional",
        name: "Professional",
        description: "For growing insurance operations",
        price: 299,
        currency: "USD",
        billingCycle: "monthly",
        limits: { users: 25, storageGB: 100, entities: 10, monthlyBordereaux: 10000 },
        modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
        status: "active",
    },
    {
        key: "enterprise",
        name: "Enterprise",
        description: "For carriers and large-scale operations",
        price: 999,
        currency: "USD",
        billingCycle: "monthly",
        limits: { users: 100, storageGB: 500, entities: 50, monthlyBordereaux: 100000 },
        modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
        status: "active",
    },
];

async function seed() {
    await connectDB();
    for (const plan of PLANS) {
        await planRepository.upsertByKey(plan);
        console.log(`seeded plan: ${plan.key} ($${plan.price}/${plan.billingCycle})`);
    }
    console.log("Plan catalog seeded. Platform owner controls pricing/limits here.");
    const mongoose = require("mongoose");
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
});