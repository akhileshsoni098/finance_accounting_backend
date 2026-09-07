const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "entity";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");
const Role = require("../modules/foundation/models/role");
const User = require("../modules/foundation/models/user");
const Subscription = require("../modules/foundation/models/subscription");
const Entity = require("../modules/accounting/models/entity");

let server;
let baseUrl;

before(async () => {
    await connectTestDB();
    await Entity.init();
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
    await Entity.deleteMany({});
});

const registerBody = {
    tenant: {
        name: "Acme Insurance",
        code: "ACME01",
        businessType: "agency",
        email: "contact@acme.com",
        phone: "+1-555-0100",
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

async function register(overrides = {}) {
    const response = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, ...(overrides.tenant || {}) },
            admin: { ...registerBody.admin, ...(overrides.admin || {}) },
        },
    });
    assert.equal(response.status, 201);
    return response.body;
}

async function seedLimitedUser(tenantId, permissions) {
    const [role] = await Role.create([
        {
            tenantId,
            name: "Viewer",
            key: "viewer",
            permissions,
            status: "active",
        },
    ]);
    const [user] = await User.create([
        {
            tenantId,
            roleId: role._id,
            displayName: "Viewer User",
            email: "viewer@acme.com",
            passwordHash: await bcrypt.hash("viewer-pass-123", 10),
            status: "active",
            isEmailVerified: false,
        },
    ]);
    const login = await api("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "viewer-pass-123" },
    });
    assert.equal(login.status, 200);
    return login.body.token;
}

const baseEntity = {
    type: "mga",
    code: "ABC01",
    name: "ABC MGA",
    legalName: "ABC MGA Ltd",
    taxId: "TAX-123",
    email: "contact@abcmga.com",
    phone: "+1-555-1000",
    website: "https://abcmga.com",
    currency: "USD",
    address: {
        line1: "10 Main St",
        city: "Austin",
        state: "TX",
        country: "US",
        postalCode: "78701",
    },
    notes: "Test entity",
};

test("create entity returns 201", async () => {
    const registered = await register();

    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.entity.type, "mga");
    assert.equal(response.body.entity.code, "ABC01");
    assert.equal(response.body.entity.currency, "USD");
    assert.equal(response.body.entity.contact.email, "contact@abcmga.com");
    assert.equal(response.body.entity.contact.website, "https://abcmga.com");
    assert.equal(response.body.entity.address.city, "Austin");
    assert.equal(response.body.entity.parentEntityId, null);
    assert.ok(response.body.entity.id);
});

test("list returns only own tenant entities", async () => {
    const registered = await register({});
    await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const other = await register({
        tenant: { ...registerBody.tenant, code: "BETA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${other.token}` },
        body: { ...baseEntity, code: "BETA99", name: "Beta Broker" },
    });

    const response = await api("/api/entities", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.entities.length, 1);
    assert.equal(response.body.entities[0].code, "ABC01");
});

test("get own entity returns 200", async () => {
    const registered = await register();
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.entity.name, "ABC MGA");
});

test("update own entity returns 200", async () => {
    const registered = await register();
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { name: "ABC MGA Renamed", currency: "CAD", status: "suspended" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.entity.name, "ABC MGA Renamed");
    assert.equal(response.body.entity.currency, "CAD");
    assert.equal(response.body.entity.status, "suspended");
});

test("duplicate code within same tenant returns 409", async () => {
    const registered = await register();
    await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { limits: { entities: 5 } },
    });

    await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const duplicate = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, name: "ABC MGA 2" },
    });

    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "DUPLICATE_KEY");
});

test("same code in different tenant is allowed", async () => {
    const registered = await register();
    const other = await register({
        tenant: { ...registerBody.tenant, code: "BETA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });

    const first = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });
    assert.equal(first.status, 201);

    const second = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${other.token}` },
        body: { ...baseEntity, name: "Beta Same Code" },
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.entity.code, "ABC01");
});

test("foreign entity GET returns 404", async () => {
    const registered = await register();
    const other = await register({
        tenant: { ...registerBody.tenant, code: "BETA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${other.token}` },
        body: { ...baseEntity, code: "BET01", name: "Beta Broker" },
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

test("foreign entity PATCH returns 404", async () => {
    const registered = await register();
    const other = await register({
        tenant: { ...registerBody.tenant, code: "BETA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${other.token}` },
        body: { ...baseEntity, code: "BET01", name: "Beta Broker" },
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { name: "Hacked" },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

test("body tenantId injection is rejected", async () => {
    const registered = await register();

    const create = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, tenantId: registered.tenant.id },
    });
    assert.equal(create.status, 400);
    assert.match(create.body.error.message, /tenantId/);

    const entity = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });
    const update = await api(`/api/entities/${entity.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { tenantId: "507f1f77bcf86cd799439011" },
    });
    assert.equal(update.status, 400);
    assert.match(update.body.error.message, /tenantId/);
});

test("foreign parentEntityId is rejected", async () => {
    const registered = await register();
    const parentA = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const other = await register({
        tenant: { ...registerBody.tenant, code: "BETA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${other.token}` },
        body: { ...baseEntity, code: "BET01", name: "Beta Broker", parentEntityId: parentA.body.entity.id },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "ENTITY_FOREIGN_PARENT");
});

test("self parentEntityId is rejected", async () => {
    const registered = await register();
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { parentEntityId: created.body.entity.id },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "ENTITY_SELF_PARENT");
});

test("valid parent within tenant can be set and cleared", async () => {
    const registered = await register();
    await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { limits: { entities: 5 } },
    });

    const parent = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });
    const child = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "CHILD1", name: "Child Broker", parentEntityId: parent.body.entity.id },
    });
    assert.equal(child.status, 201);
    assert.equal(String(child.body.entity.parentEntityId), String(parent.body.entity.id));

    const cleared = await api(`/api/entities/${child.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { parentEntityId: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.entity.parentEntityId, null);
});

test("invalid type returns 400", async () => {
    const registered = await register();
    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, type: "konglomerat" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("invalid email returns 400", async () => {
    const registered = await register();
    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, email: "not-an-email" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("invalid code returns 400", async () => {
    const registered = await register();
    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "has spaces !!" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("invalid currency returns 400", async () => {
    const registered = await register();
    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, currency: "US Dollars" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("unknown field is rejected", async () => {
    const registered = await register();
    const create = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, hiddenFlag: "x" },
    });
    assert.equal(create.status, 400);
    assert.match(create.body.error.message, /hiddenFlag/);

    const entity = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });
    const update = await api(`/api/entities/${entity.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { hiddenFlag: "x" },
    });
    assert.equal(update.status, 400);
    assert.equal(update.body.error.code, "VALIDATION_ERROR");
});

test("code change attempt is rejected", async () => {
    const registered = await register();
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { code: "NEW99" },
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /code/);
});

test("type change attempt is rejected", async () => {
    const registered = await register();
    const created = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });

    const response = await api(`/api/entities/${created.body.entity.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { type: "carrier" },
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /type/);
});

test("missing accounting permission returns 403", async () => {
    const registered = await register();
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "users", actions: ["read"] },
    ]);

    const response = await api("/api/entities", {
        headers: { Authorization: `Bearer ${limitedToken}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("unauthenticated request returns 401", async () => {
    const response = await api("/api/entities");
    assert.equal(response.status, 401);
});

test("accounting module disabled returns 403 MODULE_NOT_ENABLED", async () => {
    const registered = await register();

    await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { modules: [{ key: "accounting", enabled: false }] },
    });

    const response = await api("/api/entities", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "MODULE_NOT_ENABLED");
});

test("missing subscription returns 403 SUBSCRIPTION_NOT_FOUND", async () => {
    const registered = await register();
    await Subscription.deleteMany({});

    const response = await api("/api/entities", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "SUBSCRIPTION_NOT_FOUND");
});

test("entity limit is enforced and respects updated subscription limits", async () => {
    const registered = await register();

    const first = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });
    assert.equal(first.status, 201);

    const blocked = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "SEC02", name: "Second" },
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "ENTITY_LIMIT_REACHED");
    assert.match(blocked.body.error.message, /\(1\)/);

    await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { limits: { entities: 3 } },
    });

    const two = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "SEC02", name: "Second" },
    });
    assert.equal(two.status, 201);

    const three = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "THR03", name: "Third" },
    });
    assert.equal(three.status, 201);

    const beyond = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "FOU04", name: "Fourth" },
    });
    assert.equal(beyond.status, 403);
    assert.equal(beyond.body.error.code, "ENTITY_LIMIT_REACHED");
});

test("unknown plan falls back to a deterministic entity limit", async () => {
    const registered = await register();

    await Subscription.updateOne(
        { _id: registered.subscription.id },
        { $set: { plan: "ultra" }, $unset: { "limits.entities": "" } },
    );

    const first = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: baseEntity,
    });
    assert.equal(first.status, 201);

    const blocked = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { ...baseEntity, code: "SEC02", name: "Second" },
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "ENTITY_LIMIT_REACHED");
});