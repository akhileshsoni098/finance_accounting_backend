const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "tenant";

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

test("GET /api/tenants returns only your own tenant for a normal user", async () => {
    const registered = await register();
    const response = await api("/api/tenants", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.tenants.length, 1);
    assert.equal(response.body.tenants[0].id, registered.tenant.id);
    assert.equal(response.body.tenants[0].code, "ACME01");
    assert.ok(response.body.tenants[0].createdAt);
});

test("super admin lists all tenants across the platform", async () => {
    await register();
    const second = await register({
        tenant: { code: "OTHER01", name: "Other Corp", email: "info@other.com" },
        admin: { displayName: "Neeraj", email: "neeraj@other.com" },
    });

    const response = await api("/api/tenants", {
        headers: { Authorization: `Bearer ${second.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.tenants.length, 2);
    const codes = response.body.tenants.map((t) => t.code);
    assert.ok(codes.includes("ACME01"));
    assert.ok(codes.includes("OTHER01"));
});

test("PATCH /api/tenants/:id updates allowed fields", async () => {
    const registered = await register();
    const response = await api(`/api/tenants/${registered.tenant.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Acme Insurance Ltd",
            phone: "+1-555-0199",
            website: "https://acme-insurance.com",
            setupStage: "accounting",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.tenant.name, "Acme Insurance Ltd");
    assert.equal(response.body.tenant.phone, "+1-555-0199");
    assert.equal(response.body.tenant.website, "https://acme-insurance.com");
    assert.equal(response.body.tenant.setupStage, "accounting");
    assert.equal(response.body.tenant.code, "ACME01");
});

test("PATCH foreign tenant returns 404", async () => {
    const registered = await register();
    const other = await register({
        tenant: { code: "OTHER02", email: "info@other.com" },
        admin: { displayName: "Neeraj", email: "neeraj@other.com" },
    });

    const response = await api(`/api/tenants/${other.tenant.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { name: "Hacked" },
    });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "TENANT_NOT_FOUND");
});

test("PATCH rejects code and businessType changes with 400", async () => {
    const registered = await register();

    const codeChange = await api(`/api/tenants/${registered.tenant.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { code: "CHANGGG" },
    });
    assert.equal(codeChange.status, 400);

    const typeChange = await api(`/api/tenants/${registered.tenant.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { businessType: "carrier" },
    });
    assert.equal(typeChange.status, 400);
});

test("PATCH rejects unknown fields and invalid values", async () => {
    const registered = await register();
    const token = registered.token;
    const id = registered.tenant.id;

    const unknown = await api(`/api/tenants/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: { password: "hacked" },
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "VALIDATION_ERROR");

    const badEmail = await api(`/api/tenants/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: { email: "not-an-email" },
    });
    assert.equal(badEmail.status, 400);

    const badStatus = await api(`/api/tenants/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: { status: "evil" },
    });
    assert.equal(badStatus.status, 400);
});

test("tenant update respects permission guard", async () => {
    const registered = await register();
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "tenants", actions: ["read"] },
    ]);

    const response = await api(`/api/tenants/${registered.tenant.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: { name: "Nope" },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
});

test("tenant routes require auth and valid subscription", async () => {
    const noAuth = await api("/api/tenants");
    assert.equal(noAuth.status, 401);
});