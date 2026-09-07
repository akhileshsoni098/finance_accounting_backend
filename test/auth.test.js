const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.TEST_DB_SUFFIX = "auth";

const app = require("../app");
const {
    connectTestDB,
    disconnectTestDB,
    cleanCollections,
} = require("./helpers");
const Tenant = require("../modules/foundation/models/tenant");
const Subscription = require("../modules/foundation/models/subscription");
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
    return {
        status: response.status,
        body,
    };
}

test("register creates tenant, subscription, role, user and returns JWT", async () => {
    const response = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    assert.equal(response.status, 201);
    assert.ok(response.body.token);

    const { token } = response.body;
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    assert.deepEqual(
        Object.keys(claims).filter((k) => !["iat", "exp"].includes(k)).sort(),
        ["roleId", "tenantId", "userId"],
    );

    assert.equal(response.body.tenant.code, "ACME01");
    assert.equal(response.body.role.key, "super_admin");
    assert.deepEqual(response.body.role.permissions, [{ module: "*", actions: ["*"] }]);
    assert.equal(response.body.subscription.limits.users, 5);

    const tenant = await Tenant.findById(response.body.tenant.id);
    const subscription = await Subscription.findById(response.body.subscription.id);
    const role = await Role.findById(response.body.role.id);
    const user = await User.findOne({ email: registerBody.admin.email });

    assert.ok(tenant);
    assert.ok(subscription);
    assert.ok(role);
    assert.ok(user);

    assert.equal(String(subscription.tenantId), String(tenant._id));
    assert.equal(String(user.tenantId), String(tenant._id));
    assert.equal(String(user.roleId), String(role._id));
    assert.equal(user.status, "active");
    assert.equal(tenant.setupStage, "organization");
});

test("register rejects duplicate tenant code with 409", async () => {
    await api("/api/auth/register", { method: "POST", body: registerBody });

    const response = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            admin: { displayName: "Other Admin", email: "other@acme.com", password: "secure-pass-123" },
        },
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "DUPLICATE_KEY");
});

test("register rejects invalid payload with 400", async () => {
    const response = await api("/api/auth/register", {
        method: "POST",
        body: {
            tenant: { name: "X", code: "A", businessType: "unknown" },
            admin: { displayName: "A", email: "not-an-email", password: "short" },
        },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("login succeeds with correct credentials and /me returns context", async () => {
    const registered = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    const loginResponse = await api("/api/auth/login", {
        method: "POST",
        body: { email: registerBody.admin.email, password: registerBody.admin.password },
    });

    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.body.token);
    assert.equal(loginResponse.body.user.email, registerBody.admin.email);
    assert.equal(loginResponse.body.role.key, "super_admin");

    const meResponse = await api("/api/auth/me", {
        headers: { Authorization: `Bearer ${loginResponse.body.token}` },
    });

    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.email, registerBody.admin.email);
    assert.equal(meResponse.body.role.key, "super_admin");
    assert.equal(meResponse.body.tenant.code, "ACME01");
    assert.equal(meResponse.body.subscription.limits.users, 5);

    assert.equal(registered.body.user.id, String(meResponse.body.user.id));
});

test("login fails with wrong password", async () => {
    await api("/api/auth/register", { method: "POST", body: registerBody });

    const response = await api("/api/auth/login", {
        method: "POST",
        body: { email: registerBody.admin.email, password: "wrong-password" },
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "INVALID_CREDENTIALS");
});

test("/me requires a valid token", async () => {
    const missing = await api("/api/auth/me");
    assert.equal(missing.status, 401);

    const badToken = await api("/api/auth/me", {
        headers: { Authorization: "Bearer not-a-jwt" },
    });
    assert.equal(badToken.status, 401);
});

test("GET /api/tenants returns own tenant", async () => {
    const registered = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    const response = await api("/api/tenants", {
        headers: { Authorization: `Bearer ${registered.body.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.tenants.length, 1);
    assert.equal(response.body.tenants[0].id, String(registered.body.tenant.id));
});

test("GET /api/tenants/:id returns own tenant and 404 for foreign tenant", async () => {
    const registered = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    const token = registered.body.token;
    const ownId = registered.body.tenant.id;

    const own = await api(`/api/tenants/${ownId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(own.status, 200);
    assert.equal(own.body.tenant.code, "ACME01");

    const other = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, code: "OTHER02", email: "info@other.com" },
            admin: { displayName: "Neeraj", email: "neeraj@other.com", password: "secure-pass-123" },
        },
    });
    const foreignId = other.body.tenant.id;

    const foreign = await api(`/api/tenants/${foreignId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(foreign.status, 404);

    const unknown = await api("/api/tenants/not-an-id", {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(unknown.status, 400);

    const noAuth = await api(`/api/tenants/${ownId}`);
    assert.equal(noAuth.status, 401);
});

test("registration creates a trial subscription with full default limits", async () => {
    const registered = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    assert.equal(registered.status, 201);
    assert.deepEqual(registered.body.subscription.limits, {
        users: 5,
        storageGB: 10,
        entities: 1,
        monthlyBordereaux: 100,
    });
});

test("login with duplicate email across tenants requires tenantCode and resolves the right tenant", async () => {
    const first = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, code: "ACME01", email: "contact@acme.com" },
            admin: { ...registerBody.admin, email: "shared@dualbiz.com" },
        },
    });
    assert.equal(first.status, 201);

    const second = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, code: "BETA02", email: "contact@beta.com", name: "Beta Corp" },
            admin: { displayName: "Sita Rao", email: "shared@dualbiz.com", password: "secure-pass-123" },
        },
    });
    assert.equal(second.status, 201);

    const ambiguous = await api("/api/auth/login", {
        method: "POST",
        body: { email: "shared@dualbiz.com", password: "secure-pass-123" },
    });
    assert.equal(ambiguous.status, 400);
    assert.equal(ambiguous.body.error.code, "MULTIPLE_ACCOUNTS");

    const acmeLogin = await api("/api/auth/login", {
        method: "POST",
        body: { email: "shared@dualbiz.com", password: "secure-pass-123", tenantCode: "ACME01" },
    });
    assert.equal(acmeLogin.status, 200);
    assert.equal(acmeLogin.body.user.id, first.body.user.id);

    const betaLogin = await api("/api/auth/login", {
        method: "POST",
        body: { email: "shared@dualbiz.com", password: "secure-pass-123", tenantCode: "BETA02" },
    });
    assert.equal(betaLogin.status, 200);
    assert.equal(betaLogin.body.user.id, second.body.user.id);
});

test("login with disabled user returns ACCOUNT_DISABLED", async () => {
    const registered = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    await User.updateOne({ _id: registered.body.user.id }, { $set: { status: "disabled" } });

    const response = await api("/api/auth/login", {
        method: "POST",
        body: { email: registerBody.admin.email, password: registerBody.admin.password },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "ACCOUNT_DISABLED");
});

test("login with expired subscription returns SUBSCRIPTION_EXPIRED", async () => {
    const registered = await api("/api/auth/register", {
        method: "POST",
        body: registerBody,
    });

    await Subscription.updateOne(
        { _id: registered.body.subscription.id },
        { $set: { endDate: new Date(Date.now() - 1000) } },
    );

    const response = await api("/api/auth/login", {
        method: "POST",
        body: { email: registerBody.admin.email, password: registerBody.admin.password },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "SUBSCRIPTION_EXPIRED");
});