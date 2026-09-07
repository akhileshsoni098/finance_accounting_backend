const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.TEST_DB_SUFFIX = "payment";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");
const Subscription = require("../modules/foundation/models/subscription");
const SubscriptionPlan = require("../modules/foundation/models/plan");

let server;
let baseUrl;

before(async () => {
    await connectTestDB();
    await cleanCollections();
    server = app.listen(0);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectTestDB();
});

beforeEach(async () => {
    await cleanCollections();
});

const registerBody = {
    tenant: {
        name: "Acme Insurance",
        code: "ACME01",
        businessType: "agency",
        email: "contact@acme.com",
        phone: "+1-555-0100",
        website: "https://acme.com",
    },
    admin: {
        displayName: "Ravi Kumar",
        email: "ravi.kumar@acme.com",
        password: "secure-pass-123",
    },
};

const card = {
    cardholderName: "Ravi Kumar",
    cardNumber: "4242 4242 4242 4242",
    expiry: "12/29",
    cvv: "123",
};

async function api(path, options = {}) {
    const { headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { "Content-Type": "application/json", ...(headers || {}) },
        body: rest.body ? JSON.stringify(rest.body) : undefined,
    });
    let body = null;
    try {
        body = await response.json();
    } catch (error) {
        body = null;
    }
    return { status: response.status, body };
}

async function register() {
    const response = await api("/api/auth/register", { method: "POST", body: registerBody });
    assert.equal(response.status, 201);
    return response.body;
}

async function seedPlans() {
    await SubscriptionPlan.create([
        {
            key: "trial",
            name: "Trial",
            description: "Free trial",
            price: 0,
            billingCycle: "monthly",
            limits: { users: 5, storageGB: 10, entities: 1, monthlyBordereaux: 100 },
            modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
            status: "active",
        },
        {
            key: "starter",
            name: "Starter",
            description: "For small agencies",
            price: 99,
            billingCycle: "monthly",
            limits: { users: 10, storageGB: 25, entities: 3, monthlyBordereaux: 1000 },
            modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
            status: "active",
        },
        {
            key: "enterprise",
            name: "Enterprise",
            description: "For carriers",
            price: 999,
            billingCycle: "yearly",
            limits: { users: 100, storageGB: 500, entities: 50, monthlyBordereaux: 100000 },
            modules: [{ key: "accounting", features: ["PAS", "MGA"] }],
            status: "archived",
        },
    ]);
}

test("GET /api/plans returns the seeded plan catalog", async () => {
    await seedPlans();
    const registered = await register();

    const response = await api("/api/plans", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.plans.length, 2);
    const keys = response.body.plans.map((plan) => plan.key);
    assert.deepEqual(keys, ["trial", "starter"]);
    assert.equal(response.body.plans[1].modules[0].features[0], "PAS");
});

test("dummy payment upgrades the subscription and records a payment", async () => {
    await seedPlans();
    const registered = await register();

    const response = await api(`/api/subscriptions/${registered.subscription.id}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { subscriptionId: registered.subscription.id, planKey: "starter", card },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.subscription.plan, "starter");
    assert.equal(response.body.subscription.status, "active");
    assert.equal(response.body.subscription.billingCycle, "monthly");
    assert.equal(response.body.subscription.limits.users, 10);
    assert.equal(response.body.subscription.limits.monthlyBordereaux, 1000);
    assert.deepEqual(response.body.subscription.modules, [
        { key: "accounting", enabled: true, features: ["PAS", "MGA"] },
    ]);

    assert.equal(response.body.payment.plan, "starter");
    assert.equal(response.body.payment.amount, 99);
    assert.equal(response.body.payment.status, "paid");
    assert.ok(response.body.payment.reference.startsWith("DMP-"));

    const persisted = await Subscription.findById(registered.subscription.id);
    assert.equal(persisted.plan, "starter");
    assert.equal(persisted.status, "active");
    assert.deepEqual(persisted.modules[0].features.toObject(), ["PAS", "MGA"]);
});

test("dummy payment rejects unavailable plan and invalid card", async () => {
    await seedPlans();
    const registered = await register();

    const archivedPlan = await api(`/api/subscriptions/${registered.subscription.id}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { subscriptionId: registered.subscription.id, planKey: "enterprise", card },
    });
    assert.equal(archivedPlan.status, 400);
    assert.equal(archivedPlan.body.error.code, "PLAN_UNAVAILABLE");

    const badCard = await api(`/api/subscriptions/${registered.subscription.id}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            subscriptionId: registered.subscription.id,
            planKey: "starter",
            card: { ...card, cardNumber: "123", expiry: "13/99", cvv: "1" },
        },
    });
    assert.equal(badCard.status, 400);
    assert.equal(badCard.body.error.code, "INVALID_INPUT");
});

test("expired subscription is blocked by middleware and auto-cancelled", async () => {
    await seedPlans();
    const registered = await register();

    await Subscription.updateOne(
        { _id: registered.subscription.id },
        {
            $set: {
                endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                status: "trialing",
            },
        },
    );

    const response = await api("/api/roles", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "SUBSCRIPTION_EXPIRED");

    const subscription = await Subscription.findById(registered.subscription.id);
    assert.equal(subscription.status, "cancelled");

    const me = await api("/api/auth/me", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.subscription.status, "cancelled");
});

test("pay for a foreign subscription returns 404", async () => {
    await seedPlans();
    const registered = await register();

    const other = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, code: "OTHER02", email: "info@other.com" },
            admin: { displayName: "Neeraj", email: "neeraj@other.com", password: "secure-pass-123" },
        },
    });
    assert.equal(other.status, 201);

    const response = await api(`/api/subscriptions/${registered.subscription.id}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${other.body.token}` },
        body: { subscriptionId: registered.subscription.id, planKey: "starter", card },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "SUBSCRIPTION_NOT_FOUND");
});