const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "user";

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

async function createRole(token, key, name, permissions) {
    const response = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: { key, name, permissions },
    });
    assert.equal(response.status, 201);
    return response.body.role;
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

test("GET /api/users lists users with role info", async () => {
    const registered = await register();
    const response = await api("/api/users", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.users.length, 1);
    assert.equal(response.body.users[0].email, "ravi.kumar@acme.com");
    assert.equal(response.body.users[0].role.key, "super_admin");
    assert.ok(response.body.users[0].createdAt);
});

test("create user returns 201 and duplicate email returns 409", async () => {
    const registered = await register();
    const token = registered.token;

    const created = await api("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
            displayName: "Nisha Verma",
            email: "nisha.verma@acme.com",
            password: "nisha-pass-123",
            roleId: registered.role.id,
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.displayName, "Nisha Verma");
    assert.equal(created.body.user.status, "active");
    assert.ok(created.body.user.id);

    const duplicate = await api("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
            displayName: "Nisha Dup",
            email: "NISHA.VERMA@acme.com",
            password: "another-pass-123",
            roleId: registered.role.id,
        },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "DUPLICATE_KEY");
});

test("create user rejects foreign role with 400", async () => {
    const registered = await register();
    const other = await register({
        tenant: { code: "OTHER01", email: "info@other.com" },
        admin: { displayName: "Neeraj", email: "neeraj@other.com" },
    });

    const response = await api("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            displayName: "Bad Role",
            email: "bad.role@acme.com",
            password: "bad-role-pass-1",
            roleId: other.role.id,
        },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "ROLE_NOT_FOUND");
});

test("get foreign user returns 404", async () => {
    const registered = await register();
    const other = await register({
        tenant: { code: "OTHER02", email: "info@other.com" },
        admin: { displayName: "Neeraj", email: "neeraj@other.com" },
    });

    const response = await api(`/api/users/${other.user.id}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "USER_NOT_FOUND");
});

test("update user displayName and roleId", async () => {
    const registered = await register();
    const token = registered.token;
    const managerRole = await createRole(token, "account_manager", "Account Manager", [
        { module: "accounting", actions: ["read", "create"] },
    ]);

    const created = await api("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
            displayName: "Nisha Verma",
            email: "nisha.verma@acme.com",
            password: "nisha-pass-123",
            roleId: registered.role.id,
        },
    });
    const userId = created.body.user.id;

    const updated = await api(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: { displayName: "Nisha V.", roleId: managerRole.id },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.user.displayName, "Nisha V.");
    assert.equal(updated.body.user.role.key, "account_manager");

    const rejected = await api(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: { password: "hacked", tenantId: "000000000000000000000000" },
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, "VALIDATION_ERROR");
});

test("suspend blocks login, activate restores it", async () => {
    const registered = await register();
    const token = registered.token;

    const created = await api("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
            displayName: "Nisha Verma",
            email: "nisha.verma@acme.com",
            password: "nisha-pass-123",
            roleId: registered.role.id,
        },
    });
    const userId = created.body.user.id;

    const suspended = await api(`/api/users/${userId}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.body.user.status, "suspended");

    const blockedLogin = await api("/api/auth/login", {
        method: "POST",
        body: { email: "nisha.verma@acme.com", password: "nisha-pass-123" },
    });
    assert.equal(blockedLogin.status, 403);
    assert.equal(blockedLogin.body.error.code, "ACCOUNT_SUSPENDED");

    const activated = await api(`/api/users/${userId}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(activated.status, 200);
    assert.equal(activated.body.user.status, "active");

    const okLogin = await api("/api/auth/login", {
        method: "POST",
        body: { email: "nisha.verma@acme.com", password: "nisha-pass-123" },
    });
    assert.equal(okLogin.status, 200);
});

test("cannot suspend your own account", async () => {
    const registered = await register();

    const response = await api(`/api/users/${registered.user.id}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "CANNOT_SUSPEND_SELF");
});

test("user routes respect permission guards", async () => {
    const noAuth = await api("/api/users");
    assert.equal(noAuth.status, 401);

    const registered = await register();
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "roles", actions: ["read"] },
    ]);

    const denied = await api("/api/users", {
        headers: { Authorization: `Bearer ${limitedToken}` },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");

    const deniedCreate = await api("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: {
            displayName: "Nope",
            email: "nope@acme.com",
            password: "nope-pass-123",
            roleId: registered.role.id,
        },
    });
    assert.equal(deniedCreate.status, 403);
});