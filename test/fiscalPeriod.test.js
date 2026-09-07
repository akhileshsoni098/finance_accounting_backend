const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "fiscalperiod";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");
const Role = require("../modules/foundation/models/role");
const User = require("../modules/foundation/models/user");
const Entity = require("../modules/accounting/models/entity");
const FiscalPeriod = require("../modules/accounting/models/fiscalPeriod");
const fiscalPeriodService = require("../modules/accounting/services/fiscalPeriod.service");

let server;
let baseUrl;

before(async () => {
    await connectTestDB();
    await Entity.init();
    await FiscalPeriod.init();
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
    await FiscalPeriod.deleteMany({});
});

const registerBody = {
    tenant: {
        name: "Acme Insurance",
        code: "ACME03",
        businessType: "agency",
        email: "contact@acme3.com",
        phone: "+1-555-0200",
    },
    admin: {
        displayName: "Ravi Kumar",
        email: "ravi.kumar@acme3.com",
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

async function seedLimitedUser(tenantId, permissions, email) {
    const [role] = await Role.create([
        {
            tenantId,
            name: "Viewer",
            key: "viewer",
            permissions,
            status: "active",
        },
    ]);
    const loginEmail = email || "viewer@fpy.com";
    const [user] = await User.create([
        {
            tenantId,
            roleId: role._id,
            displayName: "Viewer User",
            email: loginEmail,
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

async function bumpEntityLimit(registered, value) {
    const response = await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { limits: { entities: value } },
    });
    assert.equal(response.status, 200);
}

async function createEntity(registered, overrides = {}) {
    const response = await api("/api/entities", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            type: "mga",
            code: `FP${String(Math.floor(Math.random() * 9000 + 1000))}`,
            name: "FP Entity",
            currency: "USD",
            ...overrides,
        },
    });
    assert.equal(response.status, 201);
    return response.body.entity;
}

async function createPeriod(registered, entityId, payload, expectStatus = 201) {
    const response = await api(`/api/entities/${entityId}/fiscal-periods`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: payload,
    });
    assert.equal(response.status, expectStatus);
    return response;
}

const aprPayload = { code: "APR-2026", name: "April 2026", startDate: "2026-04-01", endDate: "2026-04-30" };
const mayPayload = { code: "MAY-2026", name: "May 2026", startDate: "2026-05-01", endDate: "2026-05-31" };

async function seedAprAndMay(registered) {
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const may = await createPeriod(registered, entity.id, mayPayload);
    return { entity, apr: apr.body.fiscalPeriod, may: may.body.fiscalPeriod };
}

// ---------------------------------------------------------------- CREATE

test("create open period returns 201 with open status", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, aprPayload);

    assert.equal(response.body.fiscalPeriod.status, "open");
    assert.equal(response.body.fiscalPeriod.isCurrent, false);
    assert.equal(response.body.fiscalPeriod.entityId, entity.id);
});

test("create period stores code uppercased", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, code: "apr-2026" });

    assert.equal(response.body.fiscalPeriod.code, "APR-2026");
});

test("missing name/code/date returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const missingName = await createPeriod(registered, entity.id, { code: "P1", startDate: "2026-04-01", endDate: "2026-04-30" }, 400);
    assert.match(missingName.body.error.message, /name/);

    const missingCode = await createPeriod(registered, entity.id, { name: "April", startDate: "2026-04-01", endDate: "2026-04-30" }, 400);
    assert.match(missingCode.body.error.message, /code/);

    const missingStart = await createPeriod(registered, entity.id, { code: "P2", name: "April", endDate: "2026-04-30" }, 400);
    assert.match(missingStart.body.error.message, /startDate/);

    const missingEnd = await createPeriod(registered, entity.id, { code: "P3", name: "April", startDate: "2026-04-01" }, 400);
    assert.match(missingEnd.body.error.message, /endDate/);
});

test("end before start returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, endDate: "2026-03-31" }, 400);
    assert.match(response.body.error.message, /endDate must be on or after startDate/);
});

test("duplicate code same entity returns 409", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    await createPeriod(registered, entity.id, aprPayload);
    const dup = await createPeriod(registered, entity.id, aprPayload, 409);
    assert.equal(dup.body.error.code, "DUPLICATE_KEY");
});

test("same code different entity within same tenant is allowed", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);

    await createPeriod(registered, entityA.id, aprPayload);
    const response = await createPeriod(registered, entityB.id, aprPayload);
    assert.equal(response.status, 201);
});

test("same code different tenant is allowed", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA03", name: "Beta Corp", email: "beta3@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita3@beta.com", password: "secure-pass-123" },
    });

    const entityA = await createEntity(registeredA);
    await createPeriod(registeredA, entityA.id, aprPayload);

    const entityB = await createEntity(registeredB);
    const response = await createPeriod(registeredB, entityB.id, aprPayload);
    assert.equal(response.status, 201);
});

// ---------------------------------------------------------------- OVERLAP

test("exact overlap rejected with FISCAL_PERIOD_OVERLAP", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    await createPeriod(registered, entity.id, aprPayload);
    const response = await createPeriod(registered, entity.id, { ...aprPayload, code: "APR-X" }, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_OVERLAP");
});

test("partial overlap rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    await createPeriod(registered, entity.id, aprPayload);
    const response = await createPeriod(registered, entity.id, { code: "P-15", name: "Mid", startDate: "2026-04-15", endDate: "2026-05-15" }, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_OVERLAP");
});

test("containing overlap rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    await createPeriod(registered, entity.id, aprPayload);
    const response = await createPeriod(registered, entity.id, { code: "APR-MID", name: "Mid April", startDate: "2026-04-10", endDate: "2026-04-20" }, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_OVERLAP");
});

test("endpoint overlap rejected (inclusive dates)", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    await createPeriod(registered, entity.id, aprPayload);
    const response = await createPeriod(registered, entity.id, { code: "APR-TAIL", name: "Apr tail", startDate: "2026-04-30", endDate: "2026-05-15" }, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_OVERLAP");
});

test("adjacent period is allowed", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    await createPeriod(registered, entity.id, aprPayload);
    const response = await createPeriod(registered, entity.id, mayPayload);
    assert.equal(response.status, 201);
});

test("overlap in different entity is allowed", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);

    await createPeriod(registered, entityA.id, aprPayload);
    const response = await createPeriod(registered, entityB.id, aprPayload);
    assert.equal(response.status, 201);
});

// ---------------------------------------------------------------- ISOLATION

test("foreign entity create returns 404", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA03", name: "Beta Corp", email: "beta3@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita3@beta.com", password: "secure-pass-123" },
    });
    const entityB = await createEntity(registeredB);

    const response = await createPeriod(registeredA, entityB.id, aprPayload, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

test("foreign period GET returns 404", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);
    const apr = await createPeriod(registered, entityA.id, aprPayload);

    const response = await api(`/api/entities/${entityB.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_FOUND");
});

test("foreign period PATCH returns 404", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);
    const apr = await createPeriod(registered, entityA.id, aprPayload);

    const response = await api(`/api/entities/${entityB.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { name: "Nope" },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_FOUND");
});

test("foreign period CLOSE returns 404", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);
    const apr = await createPeriod(registered, entityA.id, aprPayload);

    const response = await api(`/api/entities/${entityB.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_FOUND");
});

test("foreign period REOPEN returns 404", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);
    const apr = await createPeriod(registered, entityA.id, aprPayload);

    const response = await api(`/api/entities/${entityB.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/reopen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_FOUND");
});

test("foreign period LOCK returns 404", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);
    const apr = await createPeriod(registered, entityA.id, aprPayload);

    const response = await api(`/api/entities/${entityB.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_FOUND");
});

test("tenantId injection rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, tenantId: "507f1f77bcf86cd799439011" }, 400);
    assert.match(response.body.error.message, /tenantId/);
});

test("entityId injection rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, entityId: "507f1f77bcf86cd799439011" }, 400);
    assert.match(response.body.error.message, /entityId/);
});

// ---------------------------------------------------------------- CREATE METADATA

test("closedAt cannot be client supplied", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, closedAt: "2026-05-01" }, 400);
    assert.match(response.body.error.message, /closedAt/);
});

test("closedBy cannot be client supplied", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, closedBy: "507f1f77bcf86cd799439011" }, 400);
    assert.match(response.body.error.message, /closedBy/);
});

test("lockedAt cannot be client supplied", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, lockedAt: "2026-05-01" }, 400);
    assert.match(response.body.error.message, /lockedAt/);
});

test("lockedBy cannot be client supplied", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createPeriod(registered, entity.id, { ...aprPayload, lockedBy: "507f1f77bcf86cd799439011" }, 400);
    assert.match(response.body.error.message, /lockedBy/);
});

// ---------------------------------------------------------------- UPDATE

test("open period dates can be updated when no overlap", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { startDate: "2026-04-02", endDate: "2026-04-29", name: "April trimmed" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.fiscalPeriod.name, "April trimmed");
    assert.equal(response.body.fiscalPeriod.startDate.slice(0, 10), "2026-04-02");
});

test("open date update creating overlap is rejected", async () => {
    const registered = await register();
    const { entity, apr } = await seedAprAndMay(registered);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { endDate: "2026-05-15" },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_OVERLAP");
});

test("closed period dates cannot be changed", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { endDate: "2026-04-29" },
    });

    assert.equal(response.status, 400);
});

test("code change rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { code: "NEW-CODE" },
    });

    assert.equal(response.status, 400);
});

test("entityId change rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { entityId: "507f1f77bcf86cd799439011" },
    });

    assert.equal(response.status, 400);
});

test("tenantId change rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { tenantId: "507f1f77bcf86cd799439011" },
    });

    assert.equal(response.status, 400);
});

// ---------------------------------------------------------------- LIFECYCLE

test("open period closes and stores closedAt/closedBy", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.fiscalPeriod.status, "closed");
    assert.ok(response.body.fiscalPeriod.closedAt);
    assert.equal(response.body.fiscalPeriod.closedBy, registered.user.id);
});

test("close twice is rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const close = `Bearer ${registered.token}`;
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: { Authorization: close },
    });

    const again = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: { Authorization: close },
    });

    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, "FISCAL_PERIOD_ALREADY_CLOSED");
});

test("closed period reopens and clears closed metadata", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const auth = { Authorization: `Bearer ${registered.token}` };
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: auth,
    });

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/reopen`, {
        method: "POST",
        headers: auth,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.fiscalPeriod.status, "open");
    assert.equal(response.body.fiscalPeriod.closedAt, null);
    assert.equal(response.body.fiscalPeriod.closedBy, null);
});

test("closed period locks and stores lockedAt/lockedBy", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const auth = { Authorization: `Bearer ${registered.token}` };
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, {
        method: "POST",
        headers: auth,
    });

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, {
        method: "POST",
        headers: auth,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.fiscalPeriod.status, "locked");
    assert.ok(response.body.fiscalPeriod.lockedAt);
    assert.equal(response.body.fiscalPeriod.lockedBy, registered.user.id);
});

test("locked period cannot reopen", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const auth = { Authorization: `Bearer ${registered.token}` };
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, { method: "POST", headers: auth });
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, { method: "POST", headers: auth });

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/reopen`, {
        method: "POST",
        headers: auth,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_LOCKED");
});

test("locked period rejects accounting-significant update", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const auth = { Authorization: `Bearer ${registered.token}` };
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, { method: "POST", headers: auth });
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, { method: "POST", headers: auth });

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: auth,
        body: { startDate: "2026-04-01" },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_LOCKED");
});

test("locked period cannot lock again", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const auth = { Authorization: `Bearer ${registered.token}` };
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/close`, { method: "POST", headers: auth });
    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, { method: "POST", headers: auth });

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, {
        method: "POST",
        headers: auth,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_LOCKED");
});

test("open period cannot lock directly", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/lock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_CLOSED");
});

// ---------------------------------------------------------------- CURRENT

test("set current works", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.fiscalPeriod.isCurrent, true);
});

test("second current unsets previous", async () => {
    const registered = await register();
    const { entity, apr, may } = await seedAprAndMay(registered);
    const auth = { Authorization: `Bearer ${registered.token}` };

    await api(`/api/entities/${entity.id}/fiscal-periods/${apr.id}/current`, { method: "POST", headers: auth });
    await api(`/api/entities/${entity.id}/fiscal-periods/${may.id}/current`, { method: "POST", headers: auth });

    const list = await api(`/api/entities/${entity.id}/fiscal-periods`, { headers: auth });
    const byCode = Object.fromEntries(list.body.fiscalPeriods.map((p) => [p.code, p.isCurrent]));
    assert.equal(byCode["APR-2026"], false);
    assert.equal(byCode["MAY-2026"], true);
});

test("current status is entity-scoped", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered);
    const auth = { Authorization: `Bearer ${registered.token}` };

    const aprA = await createPeriod(registered, entityA.id, aprPayload);
    const aprB = await createPeriod(registered, entityB.id, aprPayload);
    await api(`/api/entities/${entityA.id}/fiscal-periods/${aprA.body.fiscalPeriod.id}/current`, { method: "POST", headers: auth });

    const listB = await api(`/api/entities/${entityB.id}/fiscal-periods`, { headers: auth });
    assert.equal(listB.body.fiscalPeriods[0].isCurrent, false);
});

test("foreign tenant cannot set another tenant's period current", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA03", name: "Beta Corp", email: "beta3@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita3@beta.com", password: "secure-pass-123" },
    });
    const entityA = await createEntity(registeredA);
    const apr = await createPeriod(registeredA, entityA.id, aprPayload);

    const response = await api(`/api/entities/${entityA.id}/fiscal-periods/${apr.body.fiscalPeriod.id}/current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registeredB.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

// ---------------------------------------------------------------- PERMISSIONS

test("missing accounting:read returns 403", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "accounting", actions: ["create"] },
    ], "noread@fpy.com");

    const response = await api(`/api/entities/${entity.id}/fiscal-periods`, {
        headers: { Authorization: `Bearer ${limitedToken}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("missing accounting:create returns 403", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "accounting", actions: ["read"] },
    ], "nocreate@fpy.com");

    const response = await api(`/api/entities/${entity.id}/fiscal-periods`, {
        method: "POST",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: aprPayload,
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("missing accounting:update returns 403", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "accounting", actions: ["read"] },
    ], "noupdate@fpy.com");

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: { name: "Nope" },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

// ---------------------------------------------------------------- AUTH / MODULE

test("unauthenticated request returns 401", async () => {
    const response = await api("/api/entities/507f1f77bcf86cd799439011/fiscal-periods");
    assert.equal(response.status, 401);
});

test("accounting module disabled returns 403 MODULE_NOT_ENABLED", async () => {
    const registered = await register();

    await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { modules: [{ key: "accounting", enabled: false }] },
    });

    const response = await api("/api/entities/507f1f77bcf86cd799439011/fiscal-periods", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "MODULE_NOT_ENABLED");
});

// ---------------------------------------------------------------- DATE LOOKUP

test("date lookup returns the containing period", async () => {
    const registered = await register();
    const { entity, apr } = await seedAprAndMay(registered);

    const found = await fiscalPeriodService.findPeriodForDate(registered.tenant.id, entity.id, new Date("2026-04-15"));
    assert.equal(String(found._id), String(apr.id));
});

test("date lookup returns null outside any period", async () => {
    const registered = await register();
    const { entity } = await seedAprAndMay(registered);

    const found = await fiscalPeriodService.findPeriodForDate(registered.tenant.id, entity.id, new Date("2026-06-01"));
    assert.equal(found, null);
});

test("date lookup resolves adjacent boundaries inclusively", async () => {
    const registered = await register();
    const { entity, apr, may } = await seedAprAndMay(registered);

    const lastApr = await fiscalPeriodService.findPeriodForDate(registered.tenant.id, entity.id, new Date("2026-04-30"));
    const firstMay = await fiscalPeriodService.findPeriodForDate(registered.tenant.id, entity.id, new Date("2026-05-01"));
    const midMay = await fiscalPeriodService.findPeriodForDate(registered.tenant.id, entity.id, new Date("2026-05-31"));

    assert.equal(String(lastApr._id), String(apr.id));
    assert.equal(String(firstMay._id), String(may.id));
    assert.equal(String(midMay._id), String(may.id));
});

test("overlap rejection keeps date lookup unambiguous", async () => {
    const registered = await register();
    const { entity, apr } = await seedAprAndMay(registered);
    const dup = await createPeriod(registered, entity.id, { code: "APR-2", name: "Dup", startDate: "2026-04-10", endDate: "2026-04-20" }, 400);

    assert.equal(dup.body.error.code, "FISCAL_PERIOD_OVERLAP");
    const found = await fiscalPeriodService.findPeriodForDate(registered.tenant.id, entity.id, new Date("2026-04-15"));
    assert.equal(String(found._id), String(apr.id));
});

// ---------------------------------------------------------------- NO DELETE

test("DELETE endpoint does not exist", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
});

// ---------------------------------------------------------------- LIST / GET

test("list is ordered by start date", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    await createPeriod(registered, entity.id, publicPeriod({ code: "JUN", startDate: "2026-06-01", endDate: "2026-06-30" }));
    await createPeriod(registered, entity.id, aprPayload);
    await createPeriod(registered, entity.id, mayPayload);

    const list = await api(`/api/entities/${entity.id}/fiscal-periods`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(list.status, 200);
    assert.deepEqual(list.body.fiscalPeriods.map((p) => p.code), ["APR-2026", "MAY-2026", "JUN"]);
});

function publicPeriod(overrides) {
    return { name: "Period", startDate: "2026-04-01", endDate: "2026-04-30", ...overrides };
}

test("get one returns the period", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const apr = await createPeriod(registered, entity.id, aprPayload);

    const response = await api(`/api/entities/${entity.id}/fiscal-periods/${apr.body.fiscalPeriod.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.fiscalPeriod.code, "APR-2026");
    assert.equal(response.body.fiscalPeriod.id, apr.body.fiscalPeriod.id);
});