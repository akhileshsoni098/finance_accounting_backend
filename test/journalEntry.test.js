const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

process.env.TEST_DB_SUFFIX = "journalentry";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");
const Role = require("../modules/foundation/models/role");
const User = require("../modules/foundation/models/user");
const Subscription = require("../modules/foundation/models/subscription");
const Entity = require("../modules/accounting/models/entity");
const Account = require("../modules/accounting/models/account");
const FiscalPeriod = require("../modules/accounting/models/fiscalPeriod");
const JournalEntry = require("../modules/accounting/models/journalEntry");
const JournalLine = require("../modules/accounting/models/journalLine");
const JournalNumberCounter = require("../modules/accounting/models/journalNumberCounter");

let server;
let baseUrl;

before(async () => {
    await connectTestDB();
    await Entity.init();
    await Account.init();
    await FiscalPeriod.init();
    await JournalEntry.init();
    await JournalLine.init();
    await JournalNumberCounter.init();
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
    await Account.deleteMany({});
    await FiscalPeriod.deleteMany({});
    await JournalEntry.deleteMany({});
    await JournalLine.deleteMany({});
    await JournalNumberCounter.deleteMany({});
});

const registerBody = {
    tenant: {
        name: "Acme Insurance",
        code: "JNL01",
        businessType: "agency",
        email: "contact@jnl1.com",
        phone: "+1-555-0300",
    },
    admin: {
        displayName: "Ravi Kumar",
        email: "ravi.kumar@jnl1.com",
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
    const loginEmail = email || "viewer@jnl1.com";
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
            code: `JE${String(Math.floor(Math.random() * 9000 + 1000))}`,
            name: "JE Entity",
            currency: "USD",
            ...overrides,
        },
    });
    assert.equal(response.status, 201);
    return response.body.entity;
}

async function createAccount(registered, entityId, code, accountType, normalBalance, overrides = {}) {
    const response = await api(`/api/entities/${entityId}/accounts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            code,
            name: `Account ${code}`,
            accountType,
            normalBalance,
            ...overrides,
        },
    });
    assert.equal(response.status, 201);
    return response.body.account;
}

async function createPeriod(registered, entityId, payload) {
    const response = await api(`/api/entities/${entityId}/fiscal-periods`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: payload,
    });
    assert.equal(response.status, 201);
    return response.body.fiscalPeriod;
}

async function closePeriod(registered, entityId, periodId) {
    const response = await api(`/api/entities/${entityId}/fiscal-periods/${periodId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 200);
    return response.body.fiscalPeriod;
}

async function lockPeriod(registered, entityId, periodId) {
    const response = await api(`/api/entities/${entityId}/fiscal-periods/${periodId}/lock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 200);
    return response.body.fiscalPeriod;
}

const aprPayload = { code: "APR-2026", name: "April 2026", startDate: "2026-04-01", endDate: "2026-04-30" };
const mayPayload = { code: "MAY-2026", name: "May 2026", startDate: "2026-05-01", endDate: "2026-05-31" };

async function seedBase(registered) {
    const entity = await createEntity(registered);
    const cash = await createAccount(registered, entity.id, "1100", "asset", "debit");
    const revenue = await createAccount(registered, entity.id, "4000", "revenue", "credit");
    const apr = await createPeriod(registered, entity.id, aprPayload);
    return { entity, cash, revenue, apr };
}

function twoLineBody(accountA, accountB, amount = 100000) {
    return {
        entryDate: "2026-04-15",
        reference: "JE-001",
        description: "Test journal",
        lines: [
            { accountId: accountA.id, description: "Debit leg", debit: amount, credit: 0 },
            { accountId: accountB.id, description: "Credit leg", debit: 0, credit: amount },
        ],
    };
}

async function createJournal(registered, entityId, body, expectStatus = 201, headers = {}) {
    const response = await api(`/api/entities/${entityId}/journal-entries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}`, ...headers },
        body,
    });
    if (expectStatus !== null && expectStatus !== undefined) {
        assert.equal(response.status, expectStatus);
    }
    return response;
}

function assertErrorCode(response, status, code) {
    assert.equal(response.status, status);
    assert.equal(response.body.error.code, code);
}

// ---------------------------------------------------------------- AUTH & PERMISSIONS

test("journal list requires authentication (401)", async () => {
    const response = await api("/api/entities/507f1f77bcf86cd799439011/journal-entries");
    assert.equal(response.status, 401);
});

test("journal routes blocked when accounting module is not enabled (403)", async () => {
    const registered = await register();
    const { entity } = await seedBase(registered);
    await Subscription.updateOne(
        { _id: registered.subscription.id },
        { $set: { modules: [{ key: "insurance", enabled: true }] } },
    );
    const response = await api(`/api/entities/${entity.id}/journal-entries`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assertErrorCode(response, 403, "MODULE_NOT_ENABLED");
});

test("read, create, and update permissions are enforced (403)", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const viewer = await seedLimitedUser(registered.tenant.id, [
        { module: "accounting", actions: ["read"] },
    ]);

    const canRead = await api(`/api/entities/${entity.id}/journal-entries`, {
        headers: { Authorization: `Bearer ${viewer}` },
    });
    assert.equal(canRead.status, 200);

    const noCreate = await api(`/api/entities/${entity.id}/journal-entries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${viewer}` },
        body: twoLineBody(cash, revenue),
    });
    assert.equal(noCreate.status, 403);

    const noUpdate = await api(`/api/entities/${entity.id}/journal-entries/507f1f77bcf86cd799439011`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${viewer}` },
        body: { notes: "nope" },
    });
    assert.equal(noUpdate.status, 403);

    const noPost = await api(`/api/entities/${entity.id}/journal-entries/507f1f77bcf86cd799439011/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${viewer}` },
    });
    assert.equal(noPost.status, 403);
});

// ---------------------------------------------------------------- CREATE

test("balanced draft create returns 201 with JE-000001 and stored totals", async () => {
    const registered = await register();
    const { entity, cash, revenue, apr } = await seedBase(registered);

    const response = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const journal = response.body.journal;
    assert.equal(journal.journalNumber, "JE-000001");
    assert.equal(journal.status, "draft");
    assert.equal(journal.totalDebit, 100000);
    assert.equal(journal.totalCredit, 100000);
    assert.equal(journal.currency, "USD");
    assert.equal(String(journal.fiscalPeriodId), apr.id);
    assert.equal(new Date(journal.entryDate).toISOString().slice(0, 10), "2026-04-15");
    assert.equal(journal.lines.length, 2);
    assert.equal(journal.lines[0].debit, 100000);
    assert.equal(journal.lines[0].credit, 0);
    assert.equal(journal.lines[1].credit, 100000);
    assert.equal(journal.lines[1].debit, 0);
});

test("matching currency is accepted in any case and uppercased", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const response = await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), currency: "usd" });

    assert.equal(response.status, 201);
    assert.equal(response.body.journal.currency, "USD");
});

test("foreign entity journal create returns 404", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "JNL02", name: "Beta Corp", email: "beta@jnl2.com" },
        admin: { displayName: "Sita Rao", email: "sita@jnl2.com", password: "secure-pass-123" },
    });
    const { entity, cash, revenue } = await seedBase(registeredA);

    const response = await api(`/api/entities/${entity.id}/journal-entries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registeredB.token}` },
        body: twoLineBody(cash, revenue),
    });
    assertErrorCode(response, 404, "ENTITY_NOT_FOUND");
});

test("journal created with foreign-tenant account is rejected (404)", async () => {
    const registeredA = await register();
    const { entity, cash, revenue } = await seedBase(registeredA);

    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "JNL03", name: "Gamma Corp", email: "gamma@jnl3.com" },
        admin: { displayName: "Omar Ali", email: "omar@jnl3.com", password: "secure-pass-123" },
    });
    const entityB = await createEntity(registeredB);
    const foreignAccount = await createAccount(registeredB, entityB.id, "1100", "asset", "debit");

    const response = await createJournal(registeredA, entity.id, twoLineBody(cash, { id: foreignAccount.id }), 404);
    assert.equal(response.body.error.code, "ACCOUNT_NOT_FOUND");
});

// ---------------------------------------------------------------- PAYLOAD VALIDATION

test("missing lines rejected (400)", async () => {
    const registered = await register();
    const { entity } = await seedBase(registered);
    const response = await createJournal(registered, entity.id, { entryDate: "2026-04-15", description: "x" }, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("empty and single-line journals rejected with INVALID_JOURNAL", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const empty = await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), lines: [] }, 400);
    assert.equal(empty.body.error.code, "INVALID_JOURNAL");

    const single = await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), lines: [twoLineBody(cash, revenue).lines[0]] }, 400);
    assert.equal(single.body.error.code, "INVALID_JOURNAL");
});

test("more than 100 lines rejected with INVALID_JOURNAL", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const lines = [];
    for (let i = 0; i < 101; i += 1) {
        lines.push({ accountId: cash.id, debit: 100, credit: 0 });
        lines.push({ accountId: revenue.id, debit: 0, credit: 100 });
    }
    const response = await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), lines }, 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL");
});

test("unbalanced journal rejected with JOURNAL_NOT_BALANCED", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const body = twoLineBody(cash, revenue);
    body.lines[1].credit = 90000;
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "JOURNAL_NOT_BALANCED");
});

test("line with both zero rejected with INVALID_JOURNAL_LINE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const response = await createJournal(registered, entity.id, twoLineBody(cash, revenue, 0), 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL_LINE");
});

test("line with both sides positive rejected with INVALID_JOURNAL_LINE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: revenue.id, debit: 100000, credit: 100000 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL_LINE");
});

test("negative amount rejected with INVALID_JOURNAL_LINE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: revenue.id, debit: 0, credit: -100000 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL_LINE");
});

test("decimal amount rejected with INVALID_JOURNAL_LINE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: revenue.id, debit: 0, credit: 100.5 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL_LINE");
});

test("amount above safe integer rejected with INVALID_JOURNAL_LINE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: revenue.id, debit: 0, credit: Number.MAX_SAFE_INTEGER + 1 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL_LINE");
});

test("invalid account id rejected with INVALID_JOURNAL_LINE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: "not-an-oid", debit: 0, credit: 100000 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "INVALID_JOURNAL_LINE");
});

test("server-managed fields rejected on create (400)", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const response = await createJournal(
        registered,
        entity.id,
        { ...twoLineBody(cash, revenue), journalNumber: "JE-999999", tenantId: entity.id, totalDebit: 1 },
        400,
    );
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("failed create leaves no orphan header or lines", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const inactive = await createAccount(registered, entity.id, "1200", "asset", "debit", {
        status: "inactive",
    });
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: inactive.id, debit: 0, credit: 100000 };

    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "ACCOUNT_INACTIVE");
    assert.equal(await JournalEntry.countDocuments({}), 0);
    assert.equal(await JournalLine.countDocuments({}), 0);
});

// ---------------------------------------------------------------- FISCAL PERIOD GATES

test("no matching period for entry date rejected (404)", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const cash = await createAccount(registered, entity.id, "1100", "asset", "debit");
    const revenue = await createAccount(registered, entity.id, "4000", "revenue", "credit");

    const response = await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), entryDate: "2026-05-15" }, 404);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_NOT_FOUND");
});

test("create into closed period rejected with FISCAL_PERIOD_CLOSED", async () => {
    const registered = await register();
    const { entity, cash, revenue, apr } = await seedBase(registered);
    await closePeriod(registered, entity.id, apr.id);
    const response = await createJournal(registered, entity.id, twoLineBody(cash, revenue), 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_CLOSED");
});

test("create into locked period rejected with FISCAL_PERIOD_LOCKED", async () => {
    const registered = await register();
    const { entity, cash, revenue, apr } = await seedBase(registered);
    await closePeriod(registered, entity.id, apr.id);
    await lockPeriod(registered, entity.id, apr.id);
    const response = await createJournal(registered, entity.id, twoLineBody(cash, revenue), 400);
    assert.equal(response.body.error.code, "FISCAL_PERIOD_LOCKED");
});

// ---------------------------------------------------------------- ACCOUNT RULES

test("unknown account rejected with ACCOUNT_NOT_FOUND", async () => {
    const registered = await register();
    const { entity, cash } = await seedBase(registered);
    const ghost = String(new mongoose.Types.ObjectId());
    const body = twoLineBody(cash, { id: ghost });
    const response = await createJournal(registered, entity.id, body, 404);
    assert.equal(response.body.error.code, "ACCOUNT_NOT_FOUND");
});

test("inactive account rejected with ACCOUNT_INACTIVE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const inactive = await createAccount(registered, entity.id, "1200", "asset", "debit", {
        status: "inactive",
    });
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: inactive.id, debit: 0, credit: 100000 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "ACCOUNT_INACTIVE");
});

test("non-posting account rejected with ACCOUNT_NOT_POSTABLE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const control = await createAccount(registered, entity.id, "1300", "asset", "debit", {
        allowPosting: false,
    });
    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: control.id, debit: 0, credit: 100000 };
    const response = await createJournal(registered, entity.id, body, 400);
    assert.equal(response.body.error.code, "ACCOUNT_NOT_POSTABLE");
});

test("account from sibling entity rejected with ACCOUNT_NOT_FOUND", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 2);
    const { entity, cash, revenue } = await seedBase(registered);
    const entityB = await createEntity(registered);
    const foreignAccount = await createAccount(registered, entityB.id, "1100", "asset", "debit");

    const body = twoLineBody(cash, revenue);
    body.lines[1] = { accountId: foreignAccount.id, debit: 0, credit: 100000 };
    const response = await createJournal(registered, entity.id, body, 404);
    assert.equal(response.body.error.code, "ACCOUNT_NOT_FOUND");
});

test("currency mismatch rejected with CURRENCY_MISMATCH", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const response = await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), currency: "INR" }, 400);
    assert.equal(response.body.error.code, "CURRENCY_MISMATCH");
});

// ---------------------------------------------------------------- IDEMPOTENCY

test("idempotency header replays and returns the same journal (200)", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const first = await createJournal(registered, entity.id, twoLineBody(cash, revenue), 201, {
        "Idempotency-Key": "key-1",
    });
    const second = await createJournal(registered, entity.id, twoLineBody(cash, revenue), 200, {
        "Idempotency-Key": "key-1",
    });

    assert.equal(second.body.journal.id, first.body.journal.id);
    const list = await api(`/api/entities/${entity.id}/journal-entries`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(list.body.journalEntries.length, 1);
});

test("idempotency key in body deduplicates as well", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const body = { ...twoLineBody(cash, revenue), idempotencyKey: "body-key-1" };
    const first = await createJournal(registered, entity.id, body, 201);
    const second = await createJournal(registered, entity.id, body, 200);

    assert.equal(second.body.journal.id, first.body.journal.id);
});

test("different idempotency keys create separate journals", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const first = await createJournal(registered, entity.id, twoLineBody(cash, revenue), 201, {
        "Idempotency-Key": "key-a",
    });
    const second = await createJournal(registered, entity.id, twoLineBody(cash, revenue), 201, {
        "Idempotency-Key": "key-b",
    });

    assert.notEqual(second.body.journal.id, first.body.journal.id);
    assert.equal(second.body.journal.journalNumber, "JE-000002");
});

test("overlong idempotency key rejected (400)", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const response = await createJournal(
        registered,
        entity.id,
        { ...twoLineBody(cash, revenue), idempotencyKey: "x".repeat(101) },
        400,
    );
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

// ---------------------------------------------------------------- UPDATE

test("update draft modifies header fields", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { reference: "JE-777", description: "Updated", notes: "tweaked" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.journal.reference, "JE-777");
    assert.equal(response.body.journal.description, "Updated");
    assert.equal(response.body.journal.notes, "tweaked");
    assert.equal(response.body.journal.status, "draft");
});

test("update moves entryDate into another open period", async () => {
    const registered = await register();
    const { entity, cash, revenue, apr } = await seedBase(registered);
    const may = await createPeriod(registered, entity.id, mayPayload);
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { entryDate: "2026-05-10" },
    });

    assert.equal(response.status, 200);
    assert.equal(new Date(response.body.journal.entryDate).toISOString().slice(0, 10), "2026-05-10");
    assert.equal(String(response.body.journal.fiscalPeriodId), may.id);
    assert.notEqual(String(response.body.journal.fiscalPeriodId), apr.id);
});

test("update to a date with no period rejected (404)", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { entryDate: "2026-06-15" },
    });
    assertErrorCode(response, 404, "FISCAL_PERIOD_NOT_FOUND");
});

test("update into a closed period rejected with FISCAL_PERIOD_CLOSED", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const may = await createPeriod(registered, entity.id, mayPayload);
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await closePeriod(registered, entity.id, may.id);

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { entryDate: "2026-05-10" },
    });
    assertErrorCode(response, 400, "FISCAL_PERIOD_CLOSED");
});

test("update replaces lines in bulk and recomputes totals", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            lines: [
                { accountId: revenue.id, description: "rev leg", debit: 150000, credit: 0 },
                { accountId: cash.id, description: "cash leg", debit: 0, credit: 150000 },
            ],
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.journal.totalDebit, 150000);
    assert.equal(response.body.journal.totalCredit, 150000);
    assert.equal(response.body.journal.lines.length, 2);
    assert.equal(response.body.journal.lines[0].accountId, revenue.id);
    assert.equal(await JournalLine.countDocuments({ journalEntryId: body.journal.id }), 2);
});

test("update to unbalanced lines rejected and journal unchanged", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            lines: [
                { accountId: cash.id, debit: 100000, credit: 0 },
                { accountId: revenue.id, debit: 0, credit: 50000 },
            ],
        },
    });
    assertErrorCode(response, 400, "JOURNAL_NOT_BALANCED");

    const fetched = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(fetched.body.journal.totalDebit, 100000);
    assert.equal(fetched.body.journal.totalCredit, 100000);
    assert.equal(fetched.body.journal.lines.length, 2);
});

test("update with inactive account in replacement lines rejected", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const inactive = await createAccount(registered, entity.id, "1200", "asset", "debit", {
        status: "inactive",
    });
    const { body } = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            lines: [
                { accountId: cash.id, debit: 100000, credit: 0 },
                { accountId: inactive.id, debit: 0, credit: 100000 },
            ],
        },
    });
    assertErrorCode(response, 400, "ACCOUNT_INACTIVE");
    assert.equal(await JournalLine.countDocuments({ journalEntryId: body.journal.id }), 2);
});

test("update posted journal rejected with JOURNAL_POSTED_IMMUTABLE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    const response = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { notes: "should fail" },
    });
    assertErrorCode(response, 400, "JOURNAL_POSTED_IMMUTABLE");
});

test("update rejects server-managed fields (400 VALIDATION_ERROR)", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    for (const patch of [{ status: "posted" }, { journalNumber: "JE-9" }, { totalDebit: 5 }, { idempotencyKey: "z" }]) {
        const response = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${registered.token}` },
            body: patch,
        });
        assert.equal(response.status, 400, JSON.stringify(patch));
        assert.equal(response.body.error.code, "VALIDATION_ERROR");
    }
});

// ---------------------------------------------------------------- POST

test("post draft transitions to posted with postedBy", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.journal.status, "posted");
    assert.ok(response.body.journal.postedAt);
    assert.equal(String(response.body.journal.postedBy), registered.user.id);
    assert.equal(response.body.journal.journalNumber, "JE-000001");
    assert.equal(response.body.journal.totalDebit, 100000);
    assert.equal(response.body.journal.lines.length, 2);
});

test("second post rejected with JOURNAL_POSTED_IMMUTABLE", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    const second = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assertErrorCode(second, 400, "JOURNAL_POSTED_IMMUTABLE");
});

test("post into a closed period rejected with FISCAL_PERIOD_CLOSED", async () => {
    const registered = await register();
    const { entity, cash, revenue, apr } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await closePeriod(registered, entity.id, apr.id);

    const response = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assertErrorCode(response, 400, "FISCAL_PERIOD_CLOSED");
});

test("post blocked when a line account is deactivated", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await Account.updateOne({ _id: revenue.id }, { $set: { status: "inactive" } });

    const response = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assertErrorCode(response, 400, "ACCOUNT_INACTIVE");
});

test("DELETE has no endpoint (404)", async () => {
    const registered = await register();
    const { entity } = await seedBase(registered);
    const response = await api(`/api/entities/${entity.id}/journal-entries/507f1f77bcf86cd799439011`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 404);
});

test("concurrent posts allow exactly one success", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const [a, b] = await Promise.all([
        api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
            method: "POST",
            headers: { Authorization: `Bearer ${registered.token}` },
        }),
        api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}/post`, {
            method: "POST",
            headers: { Authorization: `Bearer ${registered.token}` },
        }),
    ]);

    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 400]);

    const fetched = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(fetched.body.journal.status, "posted");
});

test("concurrent idempotent creates produce a single journal", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const [a, b] = await Promise.all([
        createJournal(registered, entity.id, twoLineBody(cash, revenue), null, { "Idempotency-Key": "race-key" }),
        createJournal(registered, entity.id, twoLineBody(cash, revenue), null, { "Idempotency-Key": "race-key" }),
    ]);

    assert.ok([a.status, b.status].every((s) => s === 200 || s === 201));
    assert.equal(a.body.journal.id, b.body.journal.id);
    assert.equal(await JournalEntry.countDocuments({}), 1);
    assert.equal(await JournalLine.countDocuments({}), 2);
});

// ---------------------------------------------------------------- NUMBERS & LIST

test("journal numbers are sequential and per-entity", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);

    const one = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    const two = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    const three = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    assert.equal(one.body.journal.journalNumber, "JE-000001");
    assert.equal(two.body.journal.journalNumber, "JE-000002");
    assert.equal(three.body.journal.journalNumber, "JE-000003");

    await bumpEntityLimit(registered, 2);
    const entityB = await createEntity(registered);
    const cashB = await createAccount(registered, entityB.id, "1100", "asset", "debit");
    const revenueB = await createAccount(registered, entityB.id, "4000", "revenue", "credit");
    await createPeriod(registered, entityB.id, aprPayload);
    const firstB = await createJournal(registered, entityB.id, twoLineBody(cashB, revenueB));

    assert.equal(firstB.body.journal.journalNumber, "JE-000001");
    assert.equal(firstB.body.journal.entityId, entityB.id);
});

test("get single journal returns header plus lines", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const created = await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries/${created.body.journal.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.journal.id, created.body.journal.id);
    assert.equal(response.body.journal.lines.length, 2);
    assert.equal(response.body.journal.lines[0].accountId, cash.id);
});

test("list returns summaries without lines", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await createJournal(registered, entity.id, twoLineBody(cash, revenue));

    const response = await api(`/api/entities/${entity.id}/journal-entries`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.body.journalEntries.length, 2);
    assert.equal(response.body.journalEntries[0].journalNumber, "JE-000002");
    assert.equal(response.body.journalEntries[1].journalNumber, "JE-000001");
    assert.equal(response.body.journalEntries[0].lines, undefined);
});

test("list filters by status", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const one = await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await api(`/api/entities/${entity.id}/journal-entries/${one.body.journal.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    const drafts = await api(`/api/entities/${entity.id}/journal-entries?status=draft`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    const posted = await api(`/api/entities/${entity.id}/journal-entries?status=posted`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(drafts.body.journalEntries.length, 1);
    assert.equal(posted.body.journalEntries.length, 1);
});

test("list filters by date range", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    await createPeriod(registered, entity.id, mayPayload);
    await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), entryDate: "2026-04-15" });
    await createJournal(registered, entity.id, { ...twoLineBody(cash, revenue), entryDate: "2026-05-10" });

    const fromMay = await api(`/api/entities/${entity.id}/journal-entries?dateFrom=2026-05-01`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(fromMay.body.journalEntries.length, 1);

    const toApr = await api(`/api/entities/${entity.id}/journal-entries?dateTo=2026-04-30`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(toApr.body.journalEntries.length, 1);

    const invalid = await api(`/api/entities/${entity.id}/journal-entries?dateFrom=notadate`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(invalid.status, 400);
});

test("list filters by accountId", async () => {
    const registered = await register();
    const { entity, cash, revenue } = await seedBase(registered);
    const receivable = await createAccount(registered, entity.id, "1200", "asset", "debit");
    await createJournal(registered, entity.id, twoLineBody(cash, revenue));
    await createJournal(registered, entity.id, {
        entryDate: "2026-04-16",
        reference: "JE-RECV",
        lines: [
            { accountId: receivable.id, debit: 50000, credit: 0 },
            { accountId: revenue.id, debit: 0, credit: 50000 },
        ],
    });

    const response = await api(`/api/entities/${entity.id}/journal-entries?accountId=${receivable.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.body.journalEntries.length, 1);
    assert.equal(response.body.journalEntries[0].reference, "JE-RECV");
});

test("list is empty for an entity without journals", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const response = await api(`/api/entities/${entity.id}/journal-entries`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.deepEqual(response.body.journalEntries, []);
});

test("tenant isolation: journals are not visible across tenants", async () => {
    const registeredA = await register();
    const { entity, cash, revenue } = await seedBase(registeredA);
    await createJournal(registeredA, entity.id, twoLineBody(cash, revenue));

    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "JNL04", name: "Delta Corp", email: "delta@jnl4.com" },
        admin: { displayName: "Nina Das", email: "nina@jnl4.com", password: "secure-pass-123" },
    });
    const { entity: entityB } = await seedBase(registeredB);

    const response = await api(`/api/entities/${entityB.id}/journal-entries`, {
        headers: { Authorization: `Bearer ${registeredB.token}` },
    });
    assert.deepEqual(response.body.journalEntries, []);
});