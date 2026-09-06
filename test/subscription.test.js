const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "subscription";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");
const Role = require("../modules/foundation/models/role");
const User = require("../modules/foundation/models/user");

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

async function seedLimitedUser(tenantId, permissions) {
    const [role] = await Role.create([
        {
            tenantId,
            name: "Sub View",
            key: "sub_view",
            permissions,
            status: "active",
        },
    ]);
    const [user] = await User.create([
        {
            tenantId,
            roleId: role._id,
            displayName: "Sub Viewer",
            email: "subviewer@acme.com",
            passwordHash: await bcrypt.hash("subviewer-pass-123", 10),
            status: "active",
            isEmailVerified: false,
        },
    ]);
    const login = await api("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "subviewer-pass-123" },
    });
    assert.equal(login.status, 200);
    return login.body.token;
}

test("GET /api/subscriptions returns own trial subscription", async () => {
    const registered = await register();

    const response = await api("/api/subscriptions", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.subscription.id, registered.subscription.id);
    assert.equal(response.body.subscription.plan, "trial");
    assert.equal(response.body.subscription.status, "trialing");
    assert.equal(response.body.subscription.billingCycle, "monthly");
    assert.deepEqual(response.body.subscription.modules, [
        { key: "accounting", enabled: true, features: ["PAS", "MGA"] },
    ]);
    assert.deepEqual(response.body.subscription.limits.users, 5);
    assert.deepEqual(response.body.subscription.limits.storageGB, 10);
    assert.ok(response.body.subscription.endDate > response.body.subscription.startDate);
});

test("PATCH /api/subscriptions/:id updates plan, cycle, and merges limits", async () => {
    const registered = await register();

    const response = await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            plan: "professional",
            billingCycle: "yearly",
            modules: [
                { key: "accounting", enabled: true },
                { key: "insurance", enabled: true },
            ],
            limits: { users: 20 },
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.subscription.plan, "professional");
    assert.equal(response.body.subscription.billingCycle, "yearly");
    assert.equal(response.body.subscription.modules.length, 2);
    assert.equal(response.body.subscription.limits.users, 20);
    assert.equal(response.body.subscription.limits.storageGB, 10);
});

test("PATCH rejects invalid plan and invalid limits with 400", async () => {
    const registered = await register();

    const badPlan = await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { plan: "ultra" },
    });
    assert.equal(badPlan.status, 400);
    assert.equal(badPlan.body.error.code, "INVALID_INPUT");

    const badLimits = await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { limits: { users: -5 } },
    });
    assert.equal(badLimits.status, 400);
});

test("PATCH foreign subscription returns 404", async () => {
    const registered = await register();

    const other = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, code: "OTHER02", email: "info@other.com" },
            admin: { displayName: "Neeraj", email: "neeraj@other.com", password: "secure-pass-123" },
        },
    });

    const response = await api(`/api/subscriptions/${other.body.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { plan: "enterprise" },
    });
    assert.equal(response.status, 404);
});

test("subscription routes require auth and respect permission guards", async () => {
    const noAuth = await api("/api/subscriptions");
    assert.equal(noAuth.status, 401);

    const registered = await register();
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "subscriptions", actions: ["read"] },
    ]);

    const denied = await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: { plan: "enterprise" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");
});