const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.TEST_DB_SUFFIX = "role";

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

test("GET /api/permissions returns the permission catalog", async () => {
    const registered = await register();
    const response = await api("/api/permissions", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    const modules = response.body.modules.map((entry) => entry.module);
    assert.ok(modules.includes("roles"));
    assert.ok(modules.includes("subscriptions"));
    assert.ok(modules.includes("accounting"));
    assert.ok(modules.includes("insurance"));
});

test("super admin can list roles and gets the system role", async () => {
    const registered = await register();
    const response = await api("/api/roles", {
        headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.roles.length, 1);
    assert.equal(response.body.roles[0].key, "super_admin");
    assert.equal(response.body.roles[0].isSystem, true);
    assert.deepEqual(response.body.roles[0].permissions, [{ module: "*", actions: ["*"] }]);
});

test("create role with valid permissions returns 201", async () => {
    const registered = await register();
    const response = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Account Manager",
            key: "account_manager",
            permissions: [{ module: "accounting", actions: ["read", "create"] }],
        },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.role.name, "Account Manager");
    assert.equal(response.body.role.key, "account_manager");
    assert.equal(response.body.role.isSystem, false);
    assert.equal(response.body.role.status, "active");
});

test("create role rejects unknown module and bad key with 400", async () => {
    const registered = await register();

    const badModule = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Hacker",
            key: "hacker",
            permissions: [{ module: "nope", actions: ["read"] }],
        },
    });
    assert.equal(badModule.status, 400);
    assert.equal(badModule.body.error.code, "INVALID_INPUT");

    const badKey = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Hacker",
            key: "Bad Key!",
            permissions: [{ module: "accounting", actions: ["read"] }],
        },
    });
    assert.equal(badKey.status, 400);
});

test("create role with duplicate key returns 409", async () => {
    const registered = await register();
    await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Manager A",
            key: "manager",
            permissions: [{ module: "accounting", actions: ["read"] }],
        },
    });

    const duplicate = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Manager B",
            key: "manager",
            permissions: [{ module: "accounting", actions: ["read"] }],
        },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "DUPLICATE_KEY");
});

test("get role by id, update role, and reject foreign role with 404", async () => {
    const registered = await register();
    const token = registered.token;

    const created = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
            name: "Usher",
            key: "usher",
            permissions: [{ module: "tenants", actions: ["read"] }],
        },
    });
    const roleId = created.body.role.id;

    const got = await api(`/api/roles/${roleId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(got.status, 200);
    assert.equal(got.body.role.key, "usher");

    const updated = await api(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: {
            name: "Senior Usher",
            permissions: [{ module: "tenants", actions: ["read", "update"] }],
            status: "inactive",
        },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.role.name, "Senior Usher");
    assert.equal(updated.body.role.status, "inactive");
    assert.deepEqual(updated.body.role.permissions, [{ module: "tenants", actions: ["read", "update"] }]);

    const other = await registerOther();
    const foreign = await api(`/api/roles/${other.role.id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(foreign.status, 404);
});

async function registerOther() {
    const response = await api("/api/auth/register", {
        method: "POST",
        body: {
            ...registerBody,
            tenant: { ...registerBody.tenant, code: "OTHER02", email: "info@other.com" },
            admin: { displayName: "Neeraj", email: "neeraj@other.com", password: "secure-pass-123" },
        },
    });
    assert.equal(response.status, 201);
    return response.body;
}

test("PATCH rejects changing role key with 400", async () => {
    const registered = await register();
    const created = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Usher",
            key: "usher",
            permissions: [{ module: "tenants", actions: ["read"] }],
        },
    });
    const roleId = created.body.role.id;

    const response = await api(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: { key: "renamed_key" },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT");
    assert.match(response.body.error.message, /key cannot be changed on update/);
});

test("system role cannot be updated or deleted", async () => {
    const registered = await register();
    const token = registered.token;
    const systemRoleId = registered.role.id;

    const update = await api(`/api/roles/${systemRoleId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: { name: "Super Admin Renamed" },
    });
    assert.equal(update.status, 403);
    assert.equal(update.body.error.code, "SYSTEM_ROLE_PROTECTED");

    const remove = await api(`/api/roles/${systemRoleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(remove.status, 403);
});

test("role assigned to a user cannot be deleted", async () => {
    const registered = await register();

    const created = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Viewer",
            key: "viewer",
            permissions: [{ module: "roles", actions: ["read"] }],
        },
    });
    const roleId = created.body.role.id;

    await Role.updateOne({ _id: roleId }, { $set: { permissions: [{ module: "roles", actions: ["read"] }] } });
    await User.create([
        {
            tenantId: registered.tenant.id,
            roleId,
            displayName: "Assigned User",
            email: "assigned@acme.com",
            passwordHash: await bcrypt.hash("some-pass-123", 10),
            status: "active",
            isEmailVerified: false,
        },
    ]);

    const response = await api(`/api/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "ROLE_IN_USE");
});

test("delete role returns 204 and removes it", async () => {
    const registered = await register();

    const created = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${registered.token}` },
        body: {
            name: "Temp Role",
            key: "temp_role",
            permissions: [{ module: "roles", actions: ["read"] }],
        },
    });
    const roleId = created.body.role.id;

    const response = await api(`/api/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(response.status, 204);

    const gone = await api(`/api/roles/${roleId}`, {
        headers: { Authorization: `Bearer ${registered.token}` },
    });
    assert.equal(gone.status, 404);
});

test("role routes require auth and respect permission guards", async () => {
    const noAuth = await api("/api/roles");
    assert.equal(noAuth.status, 401);

    const registered = await register();
    const limitedToken = await seedLimitedUser(registered.tenant.id, [
        { module: "roles", actions: ["read"] },
    ]);

    const denied = await api("/api/roles", {
        method: "POST",
        headers: { Authorization: `Bearer ${limitedToken}` },
        body: {
            name: "Nope",
            key: "nope",
            permissions: [{ module: "roles", actions: ["read"] }],
        },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");
});