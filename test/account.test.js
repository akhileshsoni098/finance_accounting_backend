const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "account";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");
const Role = require("../modules/foundation/models/role");
const User = require("../modules/foundation/models/user");
const Entity = require("../modules/accounting/models/entity");
const Account = require("../modules/accounting/models/account");

let server;
let baseUrl;

before(async () => {
    await connectTestDB();
    await Entity.init();
    await Account.init();
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
});

const registerBody = {
    tenant: {
        name: "Acme Insurance",
        code: "ACME02",
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
            email: "viewer@coa.com",
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
            code: `ENT${String(Math.floor(Math.random() * 9000 + 1000))}`,
            name: "COA Entity",
            currency: "USD",
            ...overrides,
        },
    });
    assert.equal(response.status, 201);
    return response.body.entity;
}

async function createAccount(registered, entityId, payload, expectStatus = 201) {
    const response = await api(`/api/entities/${entityId}/accounts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: payload,
    });
    assert.equal(response.status, expectStatus);
    return response;
}

const accountPayloads = {
    asset: { code: "1000", name: "Operating Bank", accountType: "asset" },
    liability: { code: "2000", name: "Carrier Payable", accountType: "liability" },
    revenue: { code: "4000", name: "Premium Revenue", accountType: "revenue" },
    expense: { code: "5000", name: "Claims Expense", accountType: "expense" },
};

test("create asset account returns 201 with derived debit balance", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, accountPayloads.asset);

    assert.equal(response.status, 201);
    assert.equal(response.body.account.accountType, "asset");
    assert.equal(response.body.account.normalBalance, "debit");
    assert.equal(response.body.account.allowPosting, true);
    assert.equal(response.body.account.isControlAccount, false);
    assert.equal(response.body.account.status, "active");
});

test("create liability account returns 201 with derived credit balance", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, accountPayloads.liability);

    assert.equal(response.status, 201);
    assert.equal(response.body.account.normalBalance, "credit");
});

test("create revenue account returns 201 with derived credit balance", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, accountPayloads.revenue);

    assert.equal(response.status, 201);
    assert.equal(response.body.account.normalBalance, "credit");
});

test("create expense account returns 201 with derived debit balance", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, accountPayloads.expense);

    assert.equal(response.status, 201);
    assert.equal(response.body.account.normalBalance, "debit");
});

test("explicit matching normalBalance is accepted and conflicting is rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const explicit = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        normalBalance: "debit",
    });
    assert.equal(explicit.status, 201);

    const conflicting = await createAccount(registered, entity.id, {
        ...accountPayloads.liability,
        normalBalance: "debit",
    }, 400);
    assert.equal(conflicting.body.error.code, "INVALID_INPUT");
    assert.match(conflicting.body.error.message, /normalBalance/);
});

test("tenant A can create for its own entity, tenant B entity returns 404", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const entityB = await createEntity(registeredB);

    const own = await createAccount(registeredA, (await createEntity(registeredA)).id, accountPayloads.asset);
    assert.equal(own.status, 201);

    const foreign = await createAccount(registeredA, entityB.id, accountPayloads.asset, 404);
    assert.equal(foreign.body.error.code, "ENTITY_NOT_FOUND");
});

test("tenant A cannot list tenant B accounts (404)", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const entityB = await createEntity(registeredB);
    await createAccount(registeredB, entityB.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entityB.id}/accounts`, {
        headers: { Authorization: `Bearer ${registeredA.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

test("tenant A cannot get tenant B account (404)", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const entityB = await createEntity(registeredB);
    const accountB = await createAccount(registeredB, entityB.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entityB.id}/accounts/${accountB.body.account.id}`, {
        headers: { Authorization: `Bearer ${registeredA.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

test("tenant A cannot update tenant B account (404)", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const entityB = await createEntity(registeredB);
    const accountB = await createAccount(registeredB, entityB.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entityB.id}/accounts/${accountB.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registeredA.token}` },
        body: { name: "Hacked" },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ENTITY_NOT_FOUND");
});

test("cardinal account not found returns 404 ACCOUNT_NOT_FOUND", async () => {
    const registered = await register();
    const entityA = await createEntity(registered);

    const response = await api(`/api/entities/${entityA.id}/accounts/507f1f77bcf86cd799439011`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ACCOUNT_NOT_FOUND");
});

test("duplicate code in same entity returns 409", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    await createAccount(registered, entity.id, accountPayloads.asset);

    const duplicate = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        name: "Operating Bank Two",
    }, 409);
    assert.equal(duplicate.body.error.code, "DUPLICATE_KEY");
});

test("same code in different entity within tenant is allowed", async () => {
    const registered = await register();
    await bumpEntityLimit(registered, 3);
    const entityA = await createEntity(registered);
    const entityB = await createEntity(registered, { code: "ENT2000", name: "COA Entity B" });

    const a = await createAccount(registered, entityA.id, accountPayloads.asset);
    assert.equal(a.status, 201);

    const b = await createAccount(registered, entityB.id, accountPayloads.asset);
    assert.equal(b.status, 201);
    assert.equal(b.body.account.code, "1000");
});

test("same code in different tenant and entity is allowed", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const entityA = await createEntity(registeredA);
    const entityB = await createEntity(registeredB);

    const a = await createAccount(registeredA, entityA.id, accountPayloads.asset);
    assert.equal(a.status, 201);

    const b = await createAccount(registeredB, entityB.id, accountPayloads.asset);
    assert.equal(b.status, 201);
    assert.equal(b.body.account.code, "1000");
});

test("invalid object id returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await api(`/api/entities/${entity.id}/accounts/not-an-id`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("invalid accountType returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        accountType: "basket",
    }, 400);

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("invalid code returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        code: "no good code !!",
    }, 400);

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /code/);
});

test("unknown field returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const create = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        currency: "USD",
    }, 400);
    assert.equal(create.body.error.code, "INVALID_INPUT");
    assert.match(create.body.error.message, /currency/);

    const account = await createAccount(registered, entity.id, accountPayloads.asset);
    const update = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { hiddenFlag: true },
    });
    assert.equal(update.status, 400);
    assert.equal(update.body.error.code, "VALIDATION_ERROR");
});

test("missing name returns 400", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const { code, accountType } = accountPayloads.asset;
    const response = await createAccount(registered, entity.id, { code, accountType }, 400);

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /name/);
});

test("code change attempt is rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const account = await createAccount(registered, entity.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { code: "2000" },
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /code/);
});

test("tenantId injection is rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const create = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        tenantId: registered.tenant.id,
    }, 400);
    assert.equal(create.body.error.code, "INVALID_INPUT");
    assert.match(create.body.error.message, /tenantId/);

    const account = await createAccount(registered, entity.id, accountPayloads.asset);
    const update = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { tenantId: "507f1f77bcf86cd799439011" },
    });
    assert.equal(update.status, 400);
    assert.equal(update.body.error.code, "VALIDATION_ERROR");
    assert.match(update.body.error.message, /tenantId/);
});

test("entityId change attempt is rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const account = await createAccount(registered, entity.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { entityId: "507f1f77bcf86cd799439011" },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.match(response.body.error.message, /entityId/);
});

test("accountType change attempt is rejected with ACCOUNT_TYPE_IMMUTABLE", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const account = await createAccount(registered, entity.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { accountType: "revenue" },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "ACCOUNT_TYPE_IMMUTABLE");
});

test("parent account within same entity is allowed", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    await bumpEntityLimit(registered, 3);
    const parent = await createAccount(registered, entity.id, { ...accountPayloads.asset, allowPosting: false });

    const child = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        code: "1100",
        name: "Premium Receivable",
        parentAccountId: parent.body.account.id,
    });

    assert.equal(child.status, 201);
    assert.equal(String(child.body.account.parentAccountId), String(parent.body.account.id));
});

test("foreign entity parent is rejected", async () => {
    const registeredA = await register();
    const registeredB = await register({
        tenant: { ...registerBody.tenant, code: "BTA02", name: "Beta Corp", email: "beta@beta.com" },
        admin: { displayName: "Sita Rao", email: "sita@beta.com", password: "secure-pass-123" },
    });
    const entityA = await createEntity(registeredA);
    const parentA = await createAccount(registeredA, entityA.id, accountPayloads.asset);
    const entityB = await createEntity(registeredB);

    const foreignParentA = await createAccount(registeredB, entityB.id, {
        ...accountPayloads.asset,
        parentAccountId: parentA.body.account.id,
    }, 400);
    assert.equal(foreignParentA.body.error.code, "ACCOUNT_FOREIGN_PARENT");

    const parentB = await createAccount(registeredB, entityB.id, { ...accountPayloads.liability });
    const foreignParentB = await createAccount(registeredA, entityA.id, {
        ...accountPayloads.liability,
        code: "2100",
        name: "Broker Payable",
        parentAccountId: parentB.body.account.id,
    }, 400);
    assert.equal(foreignParentB.body.error.code, "ACCOUNT_FOREIGN_PARENT");
});

test("self-parent is rejected", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const account = await createAccount(registered, entity.id, accountPayloads.asset);

    const response = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { parentAccountId: account.body.account.id },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "ACCOUNT_SELF_PARENT");
});

test("missing accounting:read permission returns 403", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "users", actions: ["read"] },
    ]);

    const response = await api(`/api/entities/${entity.id}/accounts`, {
        headers: { Authorization: `Bearer ${limitedToken}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("missing accounting:create permission returns 403", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "accounting", actions: ["read"] },
    ]);

    const response = await api(`/api/entities/${entity.id}/accounts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: accountPayloads.asset,
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("missing accounting:update permission returns 403", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const account = await createAccount(registered, entity.id, accountPayloads.asset);
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "accounting", actions: ["read"] },
    ]);

    const response = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: { name: "Nope" },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("unauthenticated request returns 401", async () => {
    const response = await api("/api/entities/507f1f77bcf86cd799439011/accounts");
    assert.equal(response.status, 401);
});

test("accounting module disabled returns 403 MODULE_NOT_ENABLED", async () => {
    const registered = await register();

    await api(`/api/subscriptions/${registered.subscription.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { modules: [{ key: "accounting", enabled: false }] },
    });

    const response = await api("/api/entities/507f1f77bcf86cd799439011/accounts", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "MODULE_NOT_ENABLED");
});

test("inactive account can still be read", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const account = await createAccount(registered, entity.id, accountPayloads.asset);

    const deactivated = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { status: "inactive" },
    });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.account.status, "inactive");

    const get = await api(`/api/entities/${entity.id}/accounts/${account.body.account.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(get.status, 200);
    assert.equal(get.body.account.status, "inactive");
});

test("inactive account remains in full list and is filtered by status", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    const asset = await createAccount(registered, entity.id, accountPayloads.asset);
    const liability = await createAccount(registered, entity.id, {
        ...accountPayloads.liability,
        status: "inactive",
    });

    const full = await api(`/api/entities/${entity.id}/accounts`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(full.status, 200);
    assert.equal(full.body.accounts.length, 2);

    const active = await api(`/api/entities/${entity.id}/accounts?status=active`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(active.status, 200);
    assert.equal(active.body.accounts.length, 1);
    assert.equal(active.body.accounts[0].id, asset.body.account.id);

    const inactive = await api(`/api/entities/${entity.id}/accounts?status=inactive`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(inactive.body.accounts.length, 1);
    assert.equal(inactive.body.accounts[0].id, liability.body.account.id);
});

test("isControlAccount and allowPosting flags persist", async () => {
    const registered = await register();
    const entity = await createEntity(registered);

    const response = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        isControlAccount: true,
        allowPosting: false,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.account.isControlAccount, true);
    assert.equal(response.body.account.allowPosting, false);

    const updated = await api(`/api/entities/${entity.id}/accounts/${response.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { allowPosting: true },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.account.isControlAccount, true);
    assert.equal(updated.body.account.allowPosting, true);
});

test("update account allows whitelisted fields and clears parent with null", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    await bumpEntityLimit(registered, 3);
    const parent = await createAccount(registered, entity.id, { ...accountPayloads.asset, code: "1000", allowPosting: false });
    const child = await createAccount(registered, entity.id, {
        ...accountPayloads.asset,
        code: "1100",
        name: "Premium Receivable",
        parentAccountId: parent.body.account.id,
    });

    const updated = await api(`/api/entities/${entity.id}/accounts/${child.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Premium AR",
            description: "Subledger receivable",
            accountSubtype: "receivable",
            isControlAccount: true,
            sortOrder: 5,
            notes: "Control account",
        },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.account.name, "Premium AR");
    assert.equal(updated.body.account.accountSubtype, "receivable");
    assert.equal(updated.body.account.isControlAccount, true);
    assert.equal(updated.body.account.sortOrder, 5);

    const cleared = await api(`/api/entities/${entity.id}/accounts/${child.body.account.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { parentAccountId: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.account.parentAccountId, null);
});

test("list orders by sortOrder then code", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    await bumpEntityLimit(registered, 10);
    await createAccount(registered, entity.id, { ...accountPayloads.asset, code: "1100", name: "Premium AR", sortOrder: 2 });
    await createAccount(registered, entity.id, { ...accountPayloads.asset, code: "1200", name: "Premium Trust", sortOrder: 1 });
    await createAccount(registered, entity.id, { ...accountPayloads.asset, code: "1210", name: "Commission AR", sortOrder: 1 });
    await createAccount(registered, entity.id, { ...accountPayloads.liability, code: "2000", name: "Carrier Payable", sortOrder: 0 });

    const list = await api(`/api/entities/${entity.id}/accounts`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(list.body.accounts.length, 4);
    const codes = list.body.accounts.map((account) => account.code);
    assert.deepEqual(codes, ["2000", "1200", "1210", "1100"]);
});

test("accountType filter narrows listing", async () => {
    const registered = await register();
    const entity = await createEntity(registered);
    await bumpEntityLimit(registered, 10);
    await createAccount(registered, entity.id, accountPayloads.asset);
    await createAccount(registered, entity.id, accountPayloads.liability);

    const response = await api(`/api/entities/${entity.id}/accounts?accountType=liability`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.accounts.length, 1);
    assert.equal(response.body.accounts[0].accountType, "liability");
});