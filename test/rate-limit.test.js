const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.TEST_DB_SUFFIX = "ratelimit";

const app = require("../app");
const { connectTestDB, disconnectTestDB, cleanCollections } = require("./helpers");

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

test("login endpoint rate limits after too many attempts", async () => {
    const registered = await api("/api/auth/register", { method: "POST", body: registerBody });
    assert.equal(registered.status, 201);

    for (let i = 0; i < 10; i += 1) {
        const attempt = await api("/api/auth/login", {
            method: "POST",
            body: { email: registerBody.admin.email, password: "wrong-password" },
        });
        assert.equal(attempt.status, 401);
    }

    const blocked = await api("/api/auth/login", {
        method: "POST",
        body: { email: registerBody.admin.email, password: "wrong-password" },
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, "RATE_LIMITED");
});